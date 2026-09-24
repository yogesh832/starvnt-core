import { EventMessage, CustomerNotification } from '../models/index.js';

export function listMessages(eventId, { bookingId, requirementId } = {}) {
  const filter = { event: eventId };
  if (bookingId) filter.booking = bookingId;
  else if (requirementId) filter.requirement = requirementId;
  else {
    filter.booking = null;
    filter.requirement = null;
  }
  return EventMessage.find(filter).sort({ createdAt: 1, _id: 1 }).limit(500).lean();
}

export function listAllMessages(eventIds) {
  return EventMessage.find({ event: { $in: eventIds } }).sort({ createdAt: -1 }).limit(500).lean();
}

export async function addMessage(data) {
  const doc = await EventMessage.create(data);
  return doc.toObject();
}

export async function notify({ customerId, eventId = null, type, title, body = '' }) {
  const doc = await CustomerNotification.create({ customer: customerId, event: eventId, type, title, body });
  return doc.toObject();
}

export const listNotifications = (customerId) => CustomerNotification.find({ customer: customerId }).sort({ createdAt: -1 }).limit(200).lean();
export const countUnread = (customerId) => CustomerNotification.countDocuments({ customer: customerId, readAt: null });
export const markAllRead = (customerId) => CustomerNotification.updateMany({ customer: customerId, readAt: null }, { $set: { readAt: new Date() } });
