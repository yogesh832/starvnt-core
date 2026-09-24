import * as eventsRepo from '../repositories/events.repo.js';
import * as reqRepo from '../repositories/requirements.repo.js';
import * as quotesRepo from '../repositories/quotes.repo.js';
import * as commerceRepo from '../repositories/commerce.repo.js';
import * as circleRepo from '../repositories/circle.repo.js';
import * as catalog from './catalog.service.js';
import * as razorpay from './payments/razorpay.js';
import { getOwnedEventOr404 } from './events.service.js';
import { assertCommerceAllowed, serializeQuote } from './decision.service.js';
import { HANDLED_STATUSES, serializeEvent } from './understanding.js';
import { categoryLabel, templateFor } from './planCatalog.js';
import { LOCKED_REQUIREMENT_STATUSES } from '../models/index.js';
import { HttpError, badRequest, conflict, notFound } from '../utils/http.js';

/**
 * Reserve → pay → verify → book (Blueprint §6, phases 9–10).
 * - Accepting a quote creates 48 h holds (reservations), never bookings.
 * - The browser callback only moves a payment to "processing".
 * - Only a signed webhook or an ops verification makes it "verified".
 * - A booking is confirmed only if the payment is verified AND the hold is
 *   live AND the date isn't taken; otherwise it waits "under review".
 */

const HOLD_HOURS = 48;
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

// ── Serializers (customer-safe) ─────────────────────────────────────────────
export function serializeReservation(r) {
  return {
    id: String(r._id),
    category: r.category,
    label: categoryLabel(r.category),
    vendorName: r.vendorName,
    packageName: r.packageName,
    amount: r.amount,
    isDemo: r.isDemo,
    status: r.status,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  };
}

export function serializePayment(p) {
  return {
    id: String(p._id),
    reservationId: String(p.reservation),
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    createdAt: p.createdAt,
    verifiedAt: p.verifiedAt,
    failureReason: p.status === 'failed' ? p.failureReason || 'Payment failed' : null,
  };
}

export function serializeBooking(b) {
  return {
    id: String(b._id),
    reference: String(b._id).slice(-6).toUpperCase(),
    category: b.category,
    label: categoryLabel(b.category),
    vendorName: b.vendorName,
    packageName: b.packageName,
    amount: b.amount,
    isDemo: b.isDemo,
    status: b.status,
    underReviewReason: b.status === 'pending' ? b.reviewReason : null,
    executionStatus: b.executionStatus,
    checkedInAt: b.checkedInAt,
    startedAt: b.startedAt,
    completedAt: b.completedAt,
    evidence: b.completionEvidence?.note || b.completionEvidence?.photoUrls?.length ? b.completionEvidence : null,
    createdAt: b.createdAt,
  };
}

// ── Accept a quote → reservations ───────────────────────────────────────────
export async function acceptQuote(customerId, quoteId) {
  const quote = await quotesRepo.findOwned(customerId, quoteId).catch(() => null);
  if (!quote) throw notFound('Quote not found');
  const event = await getOwnedEventOr404(customerId, quote.event);
  assertCommerceAllowed(event);
  if (quote.status === 'expired') throw conflict('QUOTE_EXPIRED', 'This quote has expired. Please get a new quote.');
  if (quote.status !== 'draft') throw conflict('QUOTE_NOT_OPEN', 'This quote can no longer be accepted');

  // Re-check every item before holding anything.
  const problems = [];
  for (const item of quote.items) {
    const req = await reqRepo.findRequirement(event._id, item.category);
    if (req && LOCKED_REQUIREMENT_STATUSES.includes(req.status)) {
      problems.push(`${categoryLabel(item.category)} is already ${req.status}`);
      continue;
    }
    try {
      const o = await catalog.getOption(event, item.optionId);
      if (!catalog.isBookable(o)) problems.push(`${item.vendorName} is no longer available on your date`);
    } catch {
      problems.push(`${item.vendorName} is no longer offered`);
    }
  }
  if (problems.length) throw conflict('QUOTE_ITEMS_UNAVAILABLE', problems.join('. '), { problems });

  const accepted = await commerceRepo.acceptDraftQuote(customerId, quote._id);
  if (!accepted) throw conflict('QUOTE_NOT_OPEN', 'This quote can no longer be accepted');

  await commerceRepo.cancelPendingForRequirements(quote.items.map((i) => i.requirement));
  const expiresAt = new Date(Date.now() + HOLD_HOURS * 3600000);
  const reservations = await commerceRepo.createReservations(
    quote.items.map((i) => ({
      event: event._id,
      customer: customerId,
      quote: quote._id,
      quoteItem: i._id,
      requirement: i.requirement,
      category: i.category,
      optionId: i.optionId,
      vendorName: i.vendorName,
      packageName: i.packageName,
      amount: i.price,
      isDemo: i.isDemo,
      status: 'pending_payment',
      expiresAt,
    }))
  );
  await eventsRepo.appendHistory({
    eventId: event._id,
    actorType: 'customer',
    actorId: customerId,
    action: 'quote_accepted',
    details: { total: quote.total, itemCount: quote.items.length },
  });
  return { quote: serializeQuote(accepted), reservations: reservations.map(serializeReservation) };
}

// ── Bookings & payments view ────────────────────────────────────────────────
export async function bookingsView(customerId, eventId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const [reservations, bookings, payments] = await Promise.all([
    commerceRepo.listReservations(event._id),
    commerceRepo.listBookings(event._id),
    commerceRepo.listPayments(event._id),
  ]);
  return {
    event: serializeEvent(event),
    paymentsConfigured: razorpay.isConfigured(),
    reservations: reservations.map(serializeReservation),
    bookings: bookings.map(serializeBooking),
    payments: payments.map(serializePayment),
  };
}

// ── Pay a reservation (creates or reuses a Razorpay order) ──────────────────
export async function payReservation(customer, eventId, reservationId) {
  const customerId = customer._id;
  const event = await getOwnedEventOr404(customerId, eventId);
  assertCommerceAllowed(event);
  const reservation = await commerceRepo.findReservation(event._id, reservationId);
  if (!reservation) throw notFound('Reservation not found');
  if (reservation.status === 'expired') throw conflict('RESERVATION_EXPIRED', 'This hold has expired. Please get a new quote.');
  if (reservation.status !== 'pending_payment') throw conflict('RESERVATION_NOT_PAYABLE', 'This reservation is not awaiting payment');
  if (!razorpay.isConfigured()) {
    throw new HttpError(503, 'PAYMENT_NOT_CONFIGURED', 'Online payment is not set up yet. Please try again later.');
  }

  let payment = await commerceRepo.findOpenPaymentForReservation(reservation._id);
  if (payment && ['paid', 'verified'].includes(payment.status)) throw conflict('ALREADY_PAID', 'This reservation is already paid');
  if (!payment || !payment.providerOrderId) {
    let order;
    try {
      order = await razorpay.createOrder({
        amount: reservation.amount,
        receipt: `res_${reservation._id}`,
        notes: { eventId: String(event._id), reservationId: String(reservation._id) },
      });
    } catch (err) {
      console.error('[payments] order failed:', err.message);
      throw new HttpError(502, 'PAYMENT_PROVIDER_ERROR', 'Could not start the payment. Please try again.');
    }
    payment = await commerceRepo.createPayment({
      event: event._id,
      customer: customerId,
      reservation: reservation._id,
      amount: reservation.amount,
      currency: 'INR',
      status: 'pending',
      providerOrderId: order.id,
    });
  }

  return {
    payment: serializePayment(payment),
    checkout: {
      key: razorpay.publicKeyId(),
      orderId: payment.providerOrderId,
      amount: razorpay.toPaise(payment.amount),
      currency: payment.currency,
      name: 'STARVNT',
      description: `${categoryLabel(reservation.category)} · ${reservation.vendorName}`,
      prefill: { name: customer.fullName || '', email: customer.email || '', contact: customer.phone || '' },
    },
  };
}

/** The browser says checkout finished. Recorded, never trusted as proof. */
export async function checkoutComplete(customerId, eventId, paymentId, body = {}) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const payment = await commerceRepo.getPayment(paymentId);
  if (!payment || String(payment.event) !== String(event._id)) throw notFound('Payment not found');
  const ref = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id.slice(0, 64) : null;
  const moved = await commerceRepo.movePayment(payment._id, ['pending'], { status: 'processing', ...(ref ? { providerRef: ref } : {}) });
  return { payment: serializePayment(moved || payment) };
}

// ── Verification & booking confirmation (webhook / ops only) ────────────────
async function markFailed(payment, reason, actor) {
  const moved = await commerceRepo.movePayment(payment._id, ['pending', 'processing', 'paid'], { status: 'failed', failureReason: reason });
  if (!moved) return null;
  await eventsRepo.appendHistory({ eventId: payment.event, ...actor, action: 'payment_failed', details: { amount: payment.amount } });
  await circleRepo.notify({
    customerId: payment.customer,
    eventId: payment.event,
    type: 'payment',
    title: 'Payment failed',
    body: `Your payment of ${inr(payment.amount)} didn't go through. You can try again while the hold is active.`,
  });
  return moved;
}

async function maybeMarkEventBooked(eventId) {
  const event = await eventsRepo.findEventById(eventId);
  if (!event || event.status !== 'planning') return;
  const reqs = await reqRepo.listRequirements(event._id);
  const byCat = new Map(reqs.map((r) => [r.category, r]));
  const allHandled = templateFor(event.eventType).essential.every((c) => HANDLED_STATUSES.includes(byCat.get(c)?.status));
  if (!allHandled) return;
  const moved = await eventsRepo.setEventStatus(event._id, ['planning'], 'booked');
  if (moved) {
    await eventsRepo.appendHistory({ eventId: event._id, actorType: 'system', action: 'event_booked', details: {} });
    await circleRepo.notify({ customerId: event.customer, eventId: event._id, type: 'booking', title: 'All essentials booked', body: `${event.title} has every essential service booked.` });
  }
}

/**
 * Create the booking for a verified payment. Idempotent (one booking per
 * reservation). Confirmed only when the hold is live and the date is free.
 */
export async function confirmBookingFor(payment) {
  const reservation = await commerceRepo.getReservation(payment.reservation);
  if (!reservation) return null;
  const existing = await commerceRepo.findBookingForReservation(reservation._id);
  if (existing) return existing;
  const event = await eventsRepo.findEventById(reservation.event);
  if (!event) return null;

  let reason = null;
  if (reservation.status !== 'pending_payment' || reservation.expiresAt <= new Date()) reason = 'The hold expired before payment was verified';
  if (!reason) {
    const req = await reqRepo.findRequirement(event._id, reservation.category);
    if (req && LOCKED_REQUIREMENT_STATUSES.includes(req.status)) reason = `${categoryLabel(reservation.category)} is already ${req.status}`;
  }
  if (!reason) {
    try {
      const o = await catalog.getOption(event, reservation.optionId);
      if (!catalog.isBookable(o)) reason = 'The vendor is not available on your date';
    } catch {
      reason = 'The option is no longer offered';
    }
  }
  if (!reason && event.eventDate) {
    const claimed = await commerceRepo.claimOptionDate(reservation.optionId, event.eventDate, event._id);
    if (!claimed) reason = 'The vendor was just booked by someone else for your date';
  }

  const { booking, created } = await commerceRepo.createBooking({
    event: event._id,
    customer: event.customer,
    requirement: reservation.requirement,
    category: reservation.category,
    optionId: reservation.optionId,
    vendorName: reservation.vendorName,
    packageName: reservation.packageName,
    reservation: reservation._id,
    payment: payment._id,
    amount: reservation.amount,
    isDemo: reservation.isDemo,
    status: reason ? 'pending' : 'confirmed',
    reviewReason: reason,
  });
  if (!created) return booking;
  await commerceRepo.setReservationStatus(reservation._id, 'converted');

  const label = categoryLabel(reservation.category);
  if (!reason) {
    await reqRepo.upsertRequirement(event._id, reservation.category, { status: 'booked', source: 'system' }, { onlyIfStatusIn: ['missing', 'pending', 'customer_provided'] });
    await eventsRepo.appendHistory({ eventId: event._id, actorType: 'system', action: 'booking_confirmed', details: { category: reservation.category, vendorName: reservation.vendorName, amount: reservation.amount } });
    await circleRepo.notify({ customerId: event.customer, eventId: event._id, type: 'booking', title: `${label} booked`, body: `${reservation.vendorName} is confirmed for ${event.title}.` });
    await maybeMarkEventBooked(event._id);
  } else {
    await eventsRepo.appendHistory({ eventId: event._id, actorType: 'system', action: 'booking_under_review', details: { category: reservation.category } });
    await circleRepo.notify({
      customerId: event.customer,
      eventId: event._id,
      type: 'booking',
      title: `${label} booking under review`,
      body: `Your payment was received. ${reason}, so our team is reviewing it. We'll update you here.`,
    });
  }
  return booking;
}

/** Verify a payment (webhook or ops) and run booking confirmation. Idempotent. */
export async function verifyPayment(paymentId, { actorType, actorId }) {
  const payment = await commerceRepo.getPayment(paymentId);
  if (!payment) return null;
  if (payment.status === 'failed') return { payment, booking: null };
  const moved = await commerceRepo.movePayment(payment._id, ['pending', 'processing', 'paid'], {
    status: 'verified',
    verifiedAt: new Date(),
    verifiedBy: actorType === 'ops' ? `ops:${actorId}` : actorType,
  });
  if (moved) {
    await eventsRepo.appendHistory({ eventId: payment.event, actorType, actorId, action: 'payment_verified', details: { amount: payment.amount } });
  }
  const booking = await confirmBookingFor(moved || payment);
  return { payment: moved || (await commerceRepo.getPayment(paymentId)), booking };
}

/** Signed Razorpay webhook. Duplicate deliveries are ignored. */
export async function handleRazorpayWebhook(rawBody, headers) {
  if (!razorpay.webhookConfigured()) throw new HttpError(503, 'WEBHOOK_NOT_CONFIGURED', 'Webhook secret not configured');
  if (!razorpay.verifyWebhookSignature(rawBody, headers['x-razorpay-signature'])) throw badRequest('INVALID_SIGNATURE', 'Invalid signature');

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw badRequest('INVALID_BODY', 'Invalid JSON');
  }
  const eventType = String(body.event || '');
  const providerEventId = headers['x-razorpay-event-id'] || body.id;
  if (!providerEventId) throw badRequest('MISSING_EVENT_ID', 'Missing event id');
  if (!(await commerceRepo.recordWebhookEvent('razorpay', String(providerEventId), eventType, body))) {
    return { ok: true, duplicate: true };
  }

  const pay = body.payload?.payment?.entity || null;
  const order = body.payload?.order?.entity || null;
  const orderId = pay?.order_id || order?.id;
  const payment = orderId ? await commerceRepo.findPaymentByOrder(orderId) : null;
  if (!payment) return { ok: true, ignored: true };

  const actor = { actorType: 'webhook', actorId: 'razorpay' };
  switch (eventType) {
    case 'payment.authorized':
      await commerceRepo.movePayment(payment._id, ['pending', 'processing'], { status: 'paid', ...(pay?.id ? { providerRef: pay.id } : {}) });
      break;
    case 'payment.captured':
    case 'order.paid': {
      const amount = eventType === 'order.paid' ? order?.amount_paid ?? order?.amount ?? pay?.amount : pay?.amount;
      const currency = (eventType === 'order.paid' ? order?.currency : pay?.currency) || pay?.currency;
      if (Number(amount) !== razorpay.toPaise(payment.amount) || currency !== payment.currency) {
        await markFailed(payment, 'Amount mismatch', actor);
        break;
      }
      if (pay?.id) await commerceRepo.movePayment(payment._id, ['pending', 'processing', 'paid'], { providerRef: pay.id });
      await verifyPayment(payment._id, actor);
      break;
    }
    case 'payment.failed':
      await markFailed(payment, pay?.error_description || 'Payment failed', actor);
      break;
    default:
      return { ok: true, ignored: true };
  }
  return { ok: true };
}
