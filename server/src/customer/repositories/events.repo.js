import { CustomerEvent, EventHistory } from '../models/index.js';

/** All CustomerEvent / EventHistory queries. Ownership is part of every lookup. */

export function findOwnedEvent(customerId, eventId) {
  return CustomerEvent.findOne({ _id: eventId, customer: customerId }).lean();
}

// Internal (webhook / ops) lookups only; customer paths always use findOwnedEvent.
export function findEventById(eventId) {
  return CustomerEvent.findById(eventId).lean();
}

export function setEventStatus(eventId, fromStatuses, toStatus) {
  return CustomerEvent.findOneAndUpdate({ _id: eventId, status: { $in: fromStatuses } }, { $set: { status: toStatus } }, { new: true }).lean();
}

export function listEventsForCustomer(customerId) {
  return CustomerEvent.find({ customer: customerId }).sort({ createdAt: -1 }).lean();
}

export async function createEvent(data) {
  const doc = await CustomerEvent.create(data);
  return doc.toObject();
}

export function updateEventFields(customerId, eventId, fields, { onlyStatuses } = {}) {
  const filter = { _id: eventId, customer: customerId };
  if (onlyStatuses) filter.status = { $in: onlyStatuses };
  return CustomerEvent.findOneAndUpdate(filter, { $set: fields }, { new: true }).lean();
}

/** Atomic status move; returns null when the event wasn't in `fromStatus`. */
export function transitionStatus(customerId, eventId, fromStatus, toStatus) {
  return CustomerEvent.findOneAndUpdate(
    { _id: eventId, customer: customerId, status: fromStatus },
    { $set: { status: toStatus } },
    { new: true }
  ).lean();
}

export function listHistory(eventId, limit = 200) {
  return EventHistory.find({ event: eventId }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
}

export function appendHistory({ eventId, actorType, actorId = null, action, details = {} }) {
  return EventHistory.create({ event: eventId, actorType, actorId: actorId ? String(actorId) : null, action, details });
}
