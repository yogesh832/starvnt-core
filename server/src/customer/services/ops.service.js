import * as eventsRepo from '../repositories/events.repo.js';
import * as reqRepo from '../repositories/requirements.repo.js';
import * as commerceRepo from '../repositories/commerce.repo.js';
import * as circleRepo from '../repositories/circle.repo.js';
import { verifyPayment, serializeBooking, serializePayment } from './commerce.service.js';
import { categoryLabel } from './planCatalog.js';
import { EXECUTION_STEPS } from '../models/index.js';
import { HttpError, badRequest, conflict, notFound } from '../utils/http.js';

/**
 * Internal operations (x-internal-key). Every call names an operator, which
 * is kept in the audit trail but never shown to customers.
 * Nothing here ever marks an event complete just because the date passed.
 */

function operatorOf(body) {
  const op = typeof body?.operator === 'string' ? body.operator.trim() : '';
  if (!op || op.length > 80) throw badRequest('OPERATOR_REQUIRED', 'operator is required');
  return op;
}

/** Manual verification, e.g. a bank transfer. */
export async function verifyPaymentManually(paymentId, body) {
  const operator = operatorOf(body);
  const payment = await commerceRepo.getPayment(paymentId);
  if (!payment) throw notFound('Payment not found');
  if (payment.status === 'failed') throw conflict('PAYMENT_FAILED', 'A failed payment cannot be verified');
  const result = await verifyPayment(payment._id, { actorType: 'ops', actorId: operator });
  return { payment: serializePayment(result.payment), booking: result.booking ? serializeBooking(result.booking) : null };
}

/** Vendor or team reply in the Event Circle, plus a customer notification. */
export async function postOpsMessage(eventId, body) {
  const operator = operatorOf(body);
  const event = await eventsRepo.findEventById(eventId).catch(() => null);
  if (!event) throw notFound('Event not found');
  const senderType = body.senderType;
  if (!['team', 'vendor'].includes(senderType)) throw badRequest('INVALID_SENDER', 'senderType must be team or vendor');
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!text || text.length > 2000) throw badRequest('INVALID_BODY', 'Message must be 1–2000 characters');

  let booking = null;
  if (body.bookingId) {
    booking = await commerceRepo.getBooking(body.bookingId);
    if (!booking || String(booking.event) !== String(event._id)) throw notFound('Booking not found');
  }
  if (senderType === 'vendor' && !booking) throw badRequest('BOOKING_REQUIRED', 'Vendor messages belong to a booking');

  const senderName = senderType === 'vendor' ? booking.vendorName : 'STARVNT team';
  const message = await circleRepo.addMessage({ event: event._id, booking: booking?._id || null, senderType, senderName, body: text });
  await eventsRepo.appendHistory({ eventId: event._id, actorType: 'ops', actorId: operator, action: 'ops_message', details: { senderType } });
  await circleRepo.notify({
    customerId: event.customer,
    eventId: event._id,
    type: 'message',
    title: `New message from ${senderName}`,
    body: text.length > 140 ? `${text.slice(0, 140)}…` : text,
  });
  return { message: { id: String(message._id), senderType, senderName, body: text, createdAt: message.createdAt } };
}

function cleanEvidence(evidence) {
  if (evidence == null) return null;
  if (typeof evidence !== 'object') throw badRequest('INVALID_EVIDENCE', 'evidence must be an object');
  const note = evidence.note == null ? null : String(evidence.note).trim().slice(0, 1000) || null;
  const urls = Array.isArray(evidence.photoUrls) ? evidence.photoUrls : [];
  if (urls.length > 20) throw badRequest('INVALID_EVIDENCE', 'Too many photos');
  for (const u of urls) {
    let ok = false;
    try {
      ok = new URL(String(u)).protocol === 'https:';
    } catch {
      ok = false;
    }
    if (!ok) throw badRequest('INVALID_EVIDENCE', 'Photo links must be https URLs');
  }
  return { note, photoUrls: urls.map(String) };
}

/**
 * Event-day progress for one confirmed booking. Forward-only:
 * not_started → checked_in → started → completed.
 */
export async function updateExecution(bookingId, body) {
  const operator = operatorOf(body);
  const booking = await commerceRepo.getBooking(bookingId);
  if (!booking) throw notFound('Booking not found');
  if (booking.status !== 'confirmed') throw conflict('BOOKING_NOT_CONFIRMED', 'Only confirmed bookings can be updated');
  const to = body.status;
  if (!['checked_in', 'started', 'completed'].includes(to)) throw badRequest('INVALID_STATUS', 'status must be checked_in, started or completed');
  if (EXECUTION_STEPS.indexOf(to) <= EXECUTION_STEPS.indexOf(booking.executionStatus)) {
    throw conflict('NOT_FORWARD', `Booking is already ${booking.executionStatus}`);
  }
  const evidence = cleanEvidence(body.evidence);

  const now = new Date();
  const set = { executionStatus: to };
  if (to === 'checked_in') set.checkedInAt = now;
  if (to === 'started') set.startedAt = now;
  if (to === 'completed') {
    set.completedAt = now;
    if (evidence) set.completionEvidence = evidence;
  }
  const updated = await commerceRepo.updateBooking(booking._id, { executionStatus: booking.executionStatus, status: 'confirmed' }, set);
  if (!updated) throw conflict('CONCURRENT_UPDATE', 'Booking changed, please retry');

  const event = await eventsRepo.findEventById(booking.event);
  // The first update of the day puts the event live.
  const live = await eventsRepo.setEventStatus(event._id, ['planning', 'booked'], 'in_progress');
  await eventsRepo.appendHistory({ eventId: event._id, actorType: 'ops', actorId: operator, action: 'execution_updated', details: { category: booking.category, status: to } });
  if (live) {
    await circleRepo.notify({ customerId: event.customer, eventId: event._id, type: 'event_day', title: 'Your event is live', body: `${categoryLabel(booking.category)} has ${to === 'checked_in' ? 'checked in' : to}.` });
  }

  if (to === 'completed') {
    await reqRepo.upsertRequirement(event._id, booking.category, { status: 'completed' }, { onlyIfStatusIn: ['booked', 'confirmed'] });
    const all = (await commerceRepo.listBookings(event._id)).filter((b) => b.status === 'confirmed');
    if (all.length && all.every((b) => b.executionStatus === 'completed')) await markEventCompleted(event, operator);
  }
  return { booking: serializeBooking(updated) };
}

async function markEventCompleted(event, operator) {
  const done = await eventsRepo.setEventStatus(event._id, ['planning', 'booked', 'in_progress'], 'completed');
  if (!done) return false;
  await eventsRepo.appendHistory({ eventId: event._id, actorType: 'ops', actorId: operator, action: 'event_completed', details: {} });
  await circleRepo.notify({ customerId: event.customer, eventId: event._id, type: 'completion', title: `${event.title} is complete 🎉`, body: 'All booked services are completed. Thank you for planning with STARVNT.' });
  return true;
}

/** Complete an event explicitly. Refused while any booked service is incomplete. */
export async function completeEvent(eventId, body) {
  const operator = operatorOf(body);
  const event = await eventsRepo.findEventById(eventId).catch(() => null);
  if (!event) throw notFound('Event not found');
  if (event.status === 'draft') throw conflict('EVENT_NOT_CONFIRMED', 'A draft event cannot be completed');
  if (['completed', 'cancelled'].includes(event.status)) return { status: event.status, alreadyClosed: true };
  const incomplete = (await commerceRepo.listBookings(event._id)).filter((b) => b.status === 'confirmed' && b.executionStatus !== 'completed');
  if (incomplete.length) {
    throw conflict('INCOMPLETE_SERVICES', `Not completed yet: ${incomplete.map((b) => categoryLabel(b.category)).join(', ')}`);
  }
  await markEventCompleted(event, operator);
  return { status: 'completed' };
}

/** Admin simulation: the vendor cancels. The plan item reopens for a new choice. */
export async function simulateVendorCancellation(body) {
  const operator = operatorOf(body);
  const booking = await commerceRepo.getBooking(body.bookingId);
  if (!booking) throw notFound('Booking not found');
  if (booking.status === 'cancelled') return { booking: serializeBooking(booking), alreadyCancelled: true };
  if (booking.executionStatus === 'completed') throw conflict('ALREADY_COMPLETED', 'A completed service cannot be cancelled');

  const updated = await commerceRepo.updateBooking(booking._id, { status: { $ne: 'cancelled' } }, { status: 'cancelled' });
  const event = await eventsRepo.findEventById(booking.event);
  if (event.eventDate) await commerceRepo.releaseOptionDate(booking.optionId, event.eventDate, event._id);
  await reqRepo.upsertRequirement(
    event._id,
    booking.category,
    { status: 'pending', source: 'system', selectedOptionId: null, selectedOption: { vendorName: null, packageName: null, price: null, isDemo: false } },
    { onlyIfStatusIn: ['booked', 'confirmed'] }
  );
  await eventsRepo.setEventStatus(event._id, ['booked'], 'planning');
  await eventsRepo.appendHistory({ eventId: event._id, actorType: 'ops', actorId: operator, action: 'booking_cancelled_by_vendor', details: { category: booking.category, vendorName: booking.vendorName } });
  await circleRepo.notify({
    customerId: event.customer,
    eventId: event._id,
    type: 'cancellation',
    title: `${booking.vendorName} cancelled`,
    body: `${categoryLabel(booking.category)} needs a new choice. Aura+ can suggest alternatives — you decide.`,
  });
  return { booking: serializeBooking(updated || booking) };
}

export function resetRefused() {
  throw new HttpError(410, 'GONE', 'Reset is disabled. Data is never deleted.');
}
