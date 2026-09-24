import mongoose from 'mongoose';
import { Reservation, Payment, PaymentWebhookEvent, Booking, OptionAvailability, CustomerQuote } from '../models/index.js';

const isId = (id) => mongoose.isValidObjectId(id);

// ── Quotes ──────────────────────────────────────────────────────────────────
/** draft → accepted, atomically; null when the quote wasn't an unexpired draft. */
export function acceptDraftQuote(customerId, quoteId) {
  if (!isId(quoteId)) return null;
  return CustomerQuote.findOneAndUpdate(
    { _id: quoteId, customer: customerId, status: 'draft', validUntil: { $gt: new Date() } },
    { $set: { status: 'accepted', acceptedAt: new Date() } },
    { new: true }
  ).lean();
}

// ── Reservations ────────────────────────────────────────────────────────────
export function expireStaleReservations(filter) {
  return Reservation.updateMany({ ...filter, status: 'pending_payment', expiresAt: { $lt: new Date() } }, { $set: { status: 'expired' } });
}

export async function listReservations(eventId) {
  await expireStaleReservations({ event: eventId });
  return Reservation.find({ event: eventId }).sort({ createdAt: -1 }).lean();
}

export async function findReservation(eventId, reservationId) {
  if (!isId(reservationId)) return null;
  await expireStaleReservations({ _id: reservationId });
  return Reservation.findOne({ _id: reservationId, event: eventId }).lean();
}

export const getReservation = (id) => Reservation.findById(id).lean();

export async function createReservations(rows) {
  const docs = await Reservation.insertMany(rows);
  return docs.map((d) => d.toObject());
}

/** A newer accepted quote replaces older unpaid holds for the same plan items. */
export function cancelPendingForRequirements(requirementIds) {
  return Reservation.updateMany({ requirement: { $in: requirementIds }, status: 'pending_payment' }, { $set: { status: 'cancelled' } });
}

export function setReservationStatus(id, status) {
  return Reservation.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
}

export async function countPendingPaymentByEvent(eventIds) {
  await expireStaleReservations({ event: { $in: eventIds } });
  const rows = await Reservation.aggregate([{ $match: { event: { $in: eventIds }, status: 'pending_payment' } }, { $group: { _id: '$event', n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

// ── Payments ────────────────────────────────────────────────────────────────
export const listPayments = (eventId) => Payment.find({ event: eventId }).sort({ createdAt: -1 }).lean();
export const getPayment = (id) => (isId(id) ? Payment.findById(id).lean() : null);
export const findPaymentByOrder = (orderId) => Payment.findOne({ providerOrderId: orderId }).lean();

export function findOpenPaymentForReservation(reservationId) {
  return Payment.findOne({ reservation: reservationId, status: { $in: ['pending', 'processing', 'paid', 'verified'] } })
    .sort({ createdAt: -1 })
    .lean();
}

export async function createPayment(data) {
  const doc = await Payment.create(data);
  return doc.toObject();
}

/** Conditional status move; null when the payment wasn't in one of `from`. */
export function movePayment(id, from, set) {
  return Payment.findOneAndUpdate({ _id: id, status: { $in: from } }, { $set: set }, { new: true }).lean();
}

/** Failed payments the customer can still retry (hold live, no newer attempt). */
export async function countRetryableFailedByEvent(eventIds) {
  const failed = await Payment.find({ event: { $in: eventIds }, status: 'failed' }).select('event reservation').lean();
  if (!failed.length) return new Map();
  const resIds = [...new Set(failed.map((p) => String(p.reservation)))];
  const [live, retried] = await Promise.all([
    Reservation.find({ _id: { $in: resIds }, status: 'pending_payment', expiresAt: { $gt: new Date() } }).select('_id').lean(),
    Payment.find({ reservation: { $in: resIds }, status: { $ne: 'failed' } }).select('reservation').lean(),
  ]);
  const liveSet = new Set(live.map((r) => String(r._id)));
  const retriedSet = new Set(retried.map((p) => String(p.reservation)));
  const out = new Map();
  const seen = new Set();
  for (const p of failed) {
    const rid = String(p.reservation);
    if (seen.has(rid) || !liveSet.has(rid) || retriedSet.has(rid)) continue;
    seen.add(rid);
    out.set(String(p.event), (out.get(String(p.event)) || 0) + 1);
  }
  return out;
}

/** Records a webhook event once; returns false for a duplicate delivery. */
export async function recordWebhookEvent(provider, providerEventId, eventType, payload) {
  try {
    await PaymentWebhookEvent.create({ provider, providerEventId, eventType, payload });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

// ── Bookings ────────────────────────────────────────────────────────────────
export const listBookings = (eventId) => Booking.find({ event: eventId }).sort({ createdAt: 1 }).lean();
export const listBookingsForEvents = (eventIds) => Booking.find({ event: { $in: eventIds } }).lean();
export const getBooking = (id) => (isId(id) ? Booking.findById(id).lean() : null);
export const findBookingForReservation = (reservationId) => Booking.findOne({ reservation: reservationId }).lean();

export async function createBooking(data) {
  try {
    const doc = await Booking.create(data);
    return { booking: doc.toObject(), created: true };
  } catch (err) {
    // Same reservation verified twice: the first booking wins.
    if (err?.code === 11000) return { booking: await Booking.findOne({ reservation: data.reservation }).lean(), created: false };
    throw err;
  }
}

export function updateBooking(id, filter, set) {
  return Booking.findOneAndUpdate({ _id: id, ...filter }, { $set: set }, { new: true }).lean();
}

// ── Option availability (our own booked dates) ──────────────────────────────
export function bookedOptionDates(optionIds, date) {
  if (!optionIds.length || !date) return [];
  return OptionAvailability.find({ optionId: { $in: optionIds }, date, status: 'booked' }).lean();
}

/**
 * Claim option+date for an event. Succeeds when the slot is free, released,
 * or already held by the same event; a clash with another event returns false.
 */
export async function claimOptionDate(optionId, date, eventId) {
  try {
    await OptionAvailability.findOneAndUpdate(
      { optionId, date, $or: [{ status: 'released' }, { event: eventId }] },
      { $set: { status: 'booked', event: eventId } },
      { upsert: true, new: true }
    );
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

export function releaseOptionDate(optionId, date, eventId) {
  return OptionAvailability.updateOne({ optionId, date, event: eventId }, { $set: { status: 'released' } });
}
