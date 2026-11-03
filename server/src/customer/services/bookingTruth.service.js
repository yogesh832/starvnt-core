import mongoose from 'mongoose';
import { Booking, Payment, Reservation, CustomerEvent, OptionAvailability, EventRequirement } from '../models/index.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { withVendorSchedule } from '../../external/services/scheduleLock.js';
import { checkTrueAvailability } from '../../external/services/availability.service.js';
import { conflict, notFound } from '../utils/http.js';

/** The durable intent lives with the customer projection. Core owns the contract.
 * Cross-database writes are deliberately retried, never treated as atomic. */
export async function syncBookingTruth(id) {
  const booking = await Booking.findById(id).lean();
  if (!booking || booking.coreSync?.status === 'NOT_REQUIRED') return booking;
  try {
    const snapshot = booking.coreSync?.snapshot;
    if (!snapshot) throw new Error('CORE_SNAPSHOT_MISSING');
    const reservation = await Reservation.findById(booking.reservation).lean();
    const links = [{ customerBookingId: booking._id }];
    if (booking.coreBooking) links.push({ _id: booking.coreBooking });
    if (snapshot.quoteId) links.push({ quoteId: snapshot.quoteId });
    const matches = await CoreBooking.find({ customerId: booking.customer, $or: links }).limit(2);
    if (matches.length > 1) throw new Error('AMBIGUOUS_CORE_BOOKING');
    let core = matches[0];
    if (!core) {
      if (booking.status !== 'cancelled') {
        const available = await checkTrueAvailability({ vendorId: booking.vendor, vendorServiceId: snapshot.vendorService, date: snapshot.eventDate, allDay: true, excludeBookingId: booking._id, excludeReservationId: booking.reservation });
        if (!available.feasible) throw new Error('CORE_SCHEDULE_CONFLICT_REQUIRES_REVIEW');
      }
      // Reuse the canonical projection ID for new contracts, including catalogue bookings.
      core = await CoreBooking.findOneAndUpdate({ _id: booking._id }, { $setOnInsert: {
        ...snapshot, customerBookingId: booking._id, reservationId: booking.reservation,
        customerId: booking.customer, customerEvent: booking.event,
        bookingStatus: booking.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
        cancellation: booking.cancellation, source: 'STARVNT',
      } }, { upsert: true, new: true, runValidators: true });
    }
    if (String(core.customerId) !== String(booking.customer) || String(core.vendorId) !== String(booking.vendor)) throw new Error('CORE_OWNERSHIP_MISMATCH');
    const payments = await Payment.find({ reservation: booking.reservation, customer: booking.customer, status: 'verified' }).lean();
    const paid = Math.max(core.paymentSummary?.paidAmount || 0, payments.reduce((sum, p) => sum + p.amount, 0));
    const set = { customerBookingId: booking._id, reservationId: booking.reservation,
      'paymentSummary.paidAmount': paid, 'paymentSummary.balanceAmount': Math.max(0, core.totalAmount - paid) };
    // Reconciliation must never reset execution, settlement, refunds, or revive a cancellation.
    if (booking.status === 'cancelled' && core.bookingStatus !== 'CANCELLED') {
      if (core.settlementStatus === 'SETTLED' || /STARTED|SUBMITTED|VERIFIED|COMPLETED/.test(core.executionStatus)) throw new Error('CANCELLATION_REQUIRES_REVIEW');
      set.bookingStatus = 'CANCELLED'; set.cancellation = booking.cancellation;
    }
    const audit = set.bookingStatus === 'CANCELLED' ? { $push: { history: { actor: booking.cancellation?.actor, action: 'CANCELLED', at: booking.cancellation?.at, reason: booking.cancellation?.reason } } } : {};
    core = await CoreBooking.findOneAndUpdate({ _id: core._id, bookingStatus: core.bookingStatus, executionStatus: core.executionStatus, settlementStatus: core.settlementStatus }, { $set: set, ...audit }, { new: true, runValidators: true });
    if (!core) throw new Error('CORE_CHANGED_RETRY');
    const cancelled = core.bookingStatus === 'CANCELLED';
    const result = await Booking.findByIdAndUpdate(booking._id, { $set: { coreBooking: core._id,
      status: cancelled ? 'cancelled' : core.bookingStatus === 'CONFIRMED' ? 'confirmed' : 'pending', paidAmount: paid, balanceAmount: Math.max(0, core.totalAmount - paid),
      'coreSync.status': 'SYNCED', 'coreSync.lastError': null, 'coreSync.syncedAt': new Date() } }, { new: true }).lean();
    if (cancelled) {
      await Reservation.updateOne({ _id: booking.reservation }, { $set: { status: 'cancelled' } });
      const event = await CustomerEvent.findById(booking.event).lean();
      if (event) await OptionAvailability.updateOne({ optionId: booking.optionId, date: event.eventDate, event: booking.event }, { $set: { status: 'released' } });
      await EventRequirement.updateOne({ _id: booking.requirement, status: { $in: ['booked', 'confirmed'] } }, { $set: { status: 'pending' } });
      await CustomerEvent.updateOne({ _id: booking.event, status: 'booked' }, { $set: { status: 'planning' } });
    } else if (reservation && core.bookingStatus === 'CONFIRMED') {
      await Reservation.updateOne({ _id: reservation._id, status: { $ne: 'cancelled' } }, { $set: { status: 'converted' } });
      await EventRequirement.updateOne({ _id: booking.requirement, status: { $in: ['missing', 'pending', 'customer_provided'] } }, { $set: { status: 'booked', source: 'system' } });
    }
    await CoreBooking.updateOne({ _id: core._id }, { $set: { projectionSyncPending: false } });
    return result;
  } catch (err) {
    await Booking.updateOne({ _id: id }, { $set: { 'coreSync.status': 'PENDING', 'coreSync.lastError': err.message } });
    throw err;
  }
}

export async function cancelOwnedBooking(customerId, bookingId, input = {}, actorId = customerId) {
  const id = mongoose.isValidObjectId(bookingId);
  let booking = id ? await Booking.findOne({ _id: bookingId, customer: customerId }).lean() : null;
  const links = [{ bookingReference: String(bookingId) }, ...(id ? [{ _id: bookingId }, { customerBookingId: bookingId }] : [])];
  if (booking?.coreBooking) links.push({ _id: booking.coreBooking });
  let core = await CoreBooking.findOne({ customerId, $or: links }).lean();
  if (!booking && core?.customerBookingId) booking = await Booking.findOne({ _id: core.customerBookingId, customer: customerId }).lean();
  if (!booking && !core) throw notFound('Booking not found');
  const vendorId = core?.vendorId || booking?.vendor;
  const cancel = async () => {
    if (core) core = await CoreBooking.findOne({ _id: core._id, customerId }).lean();
    const reason = String(input.reason || 'Customer requested cancellation').trim().slice(0, 500);
    const cancellation = { actor: String(actorId), at: new Date(), reason, refundStatus: 'REVIEW_REQUIRED' };
    if ((core && (core.settlementStatus === 'SETTLED' || /STARTED|SUBMITTED|VERIFIED|COMPLETED/.test(core.executionStatus))) || ['started', 'completed'].includes(booking?.executionStatus)) throw conflict('CANCELLATION_REQUIRES_REVIEW', 'Contact support to cancel a service already in progress or settled.');
    if (core && core.bookingStatus !== 'CANCELLED') {
      const moved = await CoreBooking.findOneAndUpdate({ _id: core._id, customerId, bookingStatus: core.bookingStatus, executionStatus: core.executionStatus, settlementStatus: core.settlementStatus }, {
        $set: { bookingStatus: 'CANCELLED', cancellation, projectionSyncPending: Boolean(booking), ...(booking ? { customerBookingId: booking._id, reservationId: booking.reservation } : {}) },
        $push: { history: { actor: String(actorId), action: 'CANCELLED', at: cancellation.at, reason } },
      }, { new: true }).lean();
      if (!moved) throw conflict('BOOKING_CHANGED', 'Booking changed. Retry cancellation.');
      core = moved;
    }
    if (booking) {
      // Cancellation plus audit and sync intent commit in one document write.
      await Booking.updateOne({ _id: booking._id, customer: customerId, status: { $ne: 'cancelled' } }, {
        $set: { status: 'cancelled', cancellation, ...(booking.coreSync?.snapshot || core ? { 'coreSync.status': 'PENDING',
          'coreSync.snapshot': booking.coreSync?.snapshot || { vendorId: core.vendorId, serviceName: core.serviceName, eventDate: core.eventDate, totalAmount: core.totalAmount, paymentSummary: core.paymentSummary },
          vendor: booking.vendor || core?.vendorId, coreBooking: booking.coreBooking || core?._id } : {}) },
        $push: { history: { actor: String(actorId), action: 'CANCELLATION_REQUESTED', at: cancellation.at, reason } },
      });
      if (booking.coreSync?.snapshot || core) await syncBookingTruth(booking._id);
    }
    if (booking) {
      await Reservation.updateOne({ _id: booking.reservation }, { $set: { status: 'cancelled' } });
      const event = await CustomerEvent.findById(booking.event).lean();
      if (event) await OptionAvailability.updateOne({ event: booking.event, optionId: booking.optionId, date: event.eventDate }, { $set: { status: 'released' } });
      await EventRequirement.updateOne({ _id: booking.requirement, status: { $in: ['booked', 'confirmed'] } }, { $set: { status: 'pending' } });
    }
    return { ok: true, bookingId, status: 'cancelled', refundStatus: 'REVIEW_REQUIRED' };
  };
  return vendorId ? withVendorSchedule(vendorId, cancel) : cancel();
}

export async function reconcileBookingBatch(limit = 50) {
  const cancelled = await CoreBooking.find({ projectionSyncPending: true, bookingStatus: 'CANCELLED' }).limit(limit).lean();
  for (const core of cancelled) {
    await Booking.updateOne({ _id: core.customerBookingId, customer: core.customerId }, { $set: {
      status: 'cancelled', cancellation: core.cancellation, vendor: core.vendorId, coreBooking: core._id,
      'coreSync.status': 'PENDING', 'coreSync.snapshot': { vendorId: core.vendorId, serviceName: core.serviceName, eventDate: core.eventDate, totalAmount: core.totalAmount, paymentSummary: core.paymentSummary },
    } });
  }
  const rows = await Booking.find({ 'coreSync.status': 'PENDING' }).sort({ updatedAt: 1 }).limit(limit).lean();
  const results = [];
  for (const row of rows) {
    try { await withVendorSchedule(row.vendor, () => syncBookingTruth(row._id)); results.push({ id: row._id, ok: true }); }
    catch (err) { results.push({ id: row._id, ok: false, error: err.message }); }
  }
  return results;
}
