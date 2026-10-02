import mongoose from 'mongoose';
import * as circleRepo from '../repositories/circle.repo.js';
import * as commerceRepo from '../repositories/commerce.repo.js';
import * as reqRepo from '../repositories/requirements.repo.js';
import * as eventsRepo from '../repositories/events.repo.js';
import * as auraRepo from '../repositories/aura.repo.js';
import * as catalog from './catalog.service.js';
import { VendorMessageThread } from '../../external/models/VendorMessageThread.js';
import { Opportunity } from '../../external/models/Opportunity.js';
import { notifyVendor } from '../../notifications/notification.service.js';
import { getOwnedEventOr404 } from './events.service.js';
import { serializeEvent } from './understanding.js';
import { categoryLabel } from './planCatalog.js';
import { badRequest, notFound } from '../utils/http.js';

/**
 * Event Circle (messages per context) and Updates (notifications).
 */

const serializeMessage = (m) => ({
  id: String(m._id),
  senderType: m.senderType,
  senderName: m.senderType === 'customer' ? 'You' : m.senderName || (m.senderType === 'team' ? 'STARVNT team' : 'STARVNT'),
  body: m.body,
  createdAt: m.createdAt,
  bookingId: m.booking ? String(m.booking) : null,
  requirementId: m.requirement ? String(m.requirement) : null,
});

async function syncCustomerBookingMessageToVendor({ event, bookingId, customerId, text }) {
  if (!bookingId) return;
  const booking = await commerceRepo.getBooking(bookingId);
  if (!booking || String(booking.event) !== String(event._id)) return;

  let option = null;
  try {
    option = await catalog.getOption(event, booking.optionId);
  } catch {
    return;
  }
  if (!option?.vendorId) return;

  const now = new Date();
  const senderName = event.contactName || event.hostName || 'Customer';
  const thread = await VendorMessageThread.findOneAndUpdate(
    { vendor: option.vendorId, customerBooking: booking._id },
    {
      $setOnInsert: {
        vendor: option.vendorId,
        customer: customerId,
        customerBooking: booking._id,
        customerEvent: event._id,
        clientName: senderName,
        eventName: event.title || booking.packageName || 'Event Booking',
        eventType: categoryLabel(booking.category),
        eventDate: event.eventDate || '',
        venueLocation: event.location?.address || event.city || '',
      },
      $set: {
        lastMessageText: text,
        lastMessageAt: now,
        status: 'ACTIVE',
      },
      $push: {
        messages: {
          sender: 'CLIENT',
          senderName,
          text,
          isRead: false,
          createdAt: now,
        },
      },
      $inc: { unreadVendorCount: 1 },
    },
    { upsert: true, new: true }
  ).lean();

  await notifyVendor({
    vendorId: option.vendorId,
    title: 'New customer message',
    message: `${senderName}: ${text.slice(0, 160)}`,
    type: 'MESSAGE',
    link: '/vendor/messages',
    idempotencyKey: `vendor.message.booking.${thread?._id || booking._id}.${String(text).slice(0, 64)}`,
    metadata: {
      threadId: thread?._id ? String(thread._id) : null,
      customerBookingId: String(booking._id),
      customerEventId: String(event._id),
    },
  });
}

async function syncCustomerRequirementMessageToVendor({ event, requirementId, optionId, customerId, text, customerMessageId = null }) {
  if (!requirementId) return;
  const requirements = await reqRepo.listRequirements(event._id);
  const requirement = requirements.find((r) => String(r._id) === String(requirementId));
  const selectedOptionId =
    typeof optionId === 'string' && optionId.startsWith('vs_')
      ? optionId
      : requirement?.selectedOptionId;
  if (!selectedOptionId) return;

  let option = null;
  try {
    option = await catalog.getOption(event, selectedOptionId);
  } catch {
    return;
  }
  if (!option?.vendorId || option.isDemo) return;

  const now = new Date();
  const senderName = event.contactName || event.hostName || 'Customer';
  const vendorServiceId = selectedOptionId.slice(3);
  if (customerMessageId) {
    const alreadySynced = await VendorMessageThread.exists({
      vendor: option.vendorId,
      customerRequirement: requirement._id,
      'messages.metadata.customerMessageId': String(customerMessageId),
    });
    if (alreadySynced) return;
  }
  const opportunity = await Opportunity.findOne({
    vendor: option.vendorId,
    customer: customerId,
    vendorService: vendorServiceId,
    eventDate: event.eventDate || new Date().toISOString().slice(0, 10),
    status: { $ne: 'EXPIRED' },
  }).sort({ createdAt: -1 }).lean();
  await VendorMessageThread.updateMany(
    {
      vendor: option.vendorId,
      customerRequirement: requirement._id,
      $or: [{ messages: { $exists: false } }, { messages: { $type: 'object' } }],
    },
    { $set: { messages: [] } }
  );
  const thread = await VendorMessageThread.findOneAndUpdate(
    { vendor: option.vendorId, customerRequirement: requirement._id },
    {
      $setOnInsert: {
        vendor: option.vendorId,
        customer: customerId,
        opportunity: opportunity?._id || null,
        customerRequirement: requirement._id,
        customerEvent: event._id,
        clientName: senderName,
        eventName: event.title || categoryLabel(requirement.category),
        eventType: categoryLabel(requirement.category),
        eventDate: event.eventDate || '',
        venueLocation: event.location?.address || event.city || '',
      },
      $set: {
        lastMessageText: text,
        lastMessageAt: now,
        status: 'ACTIVE',
      },
      $push: {
        messages: {
          sender: 'CLIENT',
          senderName,
          text,
          isRead: false,
          createdAt: now,
          metadata: {
            customerEventId: String(event._id),
            customerRequirementId: String(requirement._id),
            selectedOptionId,
            customerMessageId: customerMessageId ? String(customerMessageId) : null,
          },
        },
      },
      $inc: { unreadVendorCount: 1 },
    },
    { upsert: true, new: true }
  ).lean();

  await notifyVendor({
    vendorId: option.vendorId,
    title: 'New service message',
    message: `${senderName} · ${categoryLabel(requirement.category)}: ${text.slice(0, 140)}`,
    type: 'MESSAGE',
    link: '/vendor/messages',
    idempotencyKey: `vendor.message.requirement.${thread?._id || requirement._id}.${customerMessageId || String(text).slice(0, 64)}`,
    metadata: {
      threadId: thread?._id ? String(thread._id) : null,
      customerEventId: String(event._id),
      customerRequirementId: String(requirement._id),
      selectedOptionId,
    },
  });
}

async function backfillCustomerRequirementMessagesToVendor({ event, requirementId, customerId }) {
  if (!requirementId) return;
  const messages = await circleRepo.listMessages(event._id, { requirementId });
  for (const message of messages) {
    if (message.senderType !== 'customer') continue;
    await syncCustomerRequirementMessageToVendor({
      event,
      requirementId,
      customerId,
      text: message.body,
      customerMessageId: message._id,
    });
  }
}

async function resolveContext(event, { bookingId, requirementId }) {
  if (bookingId) {
    const b = await commerceRepo.getBooking(bookingId);
    if (!b || String(b.event) !== String(event._id)) throw notFound('Booking not found');
    return { bookingId: b._id };
  }
  if (requirementId) {
    if (!mongoose.isValidObjectId(requirementId)) throw notFound('Service not found');
    const reqs = await reqRepo.listRequirements(event._id);
    if (!reqs.some((r) => String(r._id) === String(requirementId))) throw notFound('Service not found');
    return { requirementId };
  }
  return {};
}

export async function circle(customerId, eventId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const [bookings, requirements, messages] = await Promise.all([
    commerceRepo.listBookings(event._id),
    reqRepo.listRequirements(event._id),
    circleRepo.listAllMessages([event._id]),
  ]);
  const count = (pred) => messages.filter(pred).length;
  const contexts = [
    { key: 'event', label: 'Whole event', path: [event.title], messageCount: count((m) => !m.booking && !m.requirement) },
    ...bookings.map((b) => ({
      key: `booking:${b._id}`,
      bookingId: String(b._id),
      label: b.vendorName,
      status: b.status,
      path: [event.title, categoryLabel(b.category), b.vendorName, `Booking #${String(b._id).slice(-6).toUpperCase()}`],
      messageCount: count((m) => String(m.booking) === String(b._id)),
    })),
    ...requirements
      .filter((r) => messages.some((m) => String(m.requirement) === String(r._id)))
      .map((r) => ({
        key: `requirement:${r._id}`,
        requirementId: String(r._id),
        label: r.selectedOption?.vendorName || categoryLabel(r.category),
        path: [
          event.title,
          categoryLabel(r.category),
          r.selectedOption?.vendorName,
          r.selectedOption?.packageName,
        ].filter(Boolean),
        messageCount: count((m) => String(m.requirement) === String(r._id)),
      })),
  ];
  return { event: serializeEvent(event), contexts };
}

export async function listMessages(customerId, eventId, query = {}) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const ctx = await resolveContext(event, query);
  await backfillCustomerRequirementMessagesToVendor({ event, requirementId: ctx.requirementId, customerId });
  return { messages: (await circleRepo.listMessages(event._id, ctx)).map(serializeMessage) };
}

export async function postMessage(customerId, eventId, body = {}) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!text || text.length > 2000) throw badRequest('INVALID_BODY', 'Message must be 1–2000 characters');
  const ctx = await resolveContext(event, {
    bookingId: body.bookingId || body.booking,
    requirementId: body.requirementId || body.service,
  });
  const m = await circleRepo.addMessage({
    event: event._id,
    booking: ctx.bookingId || null,
    requirement: ctx.requirementId || null,
    senderType: 'customer',
    senderCustomer: customerId,
    body: text,
  });
  await syncCustomerBookingMessageToVendor({ event, bookingId: ctx.bookingId, customerId, text });
  await syncCustomerRequirementMessageToVendor({
    event,
    requirementId: ctx.requirementId,
    optionId: body.optionId || body.selectedOptionId,
    customerId,
    text,
    customerMessageId: m._id,
  });
  return { message: serializeMessage(m) };
}

// ── Updates ────────────────────────────────────────────────────────────────
const IMPORTANT = ['payment', 'booking', 'completion', 'cancellation'];

export async function updates(customerId) {
  const [notifications, events, sessions, unread, threads] = await Promise.all([
    circleRepo.listNotifications(customerId),
    eventsRepo.listEventsForCustomer(customerId),
    auraRepo.listSessionsForCustomer(customerId),
    circleRepo.countUnread(customerId),
    VendorMessageThread.find({ customer: customerId })
      .populate('vendor', 'businessName category')
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(30)
      .lean()
      .catch(() => []),
  ]);
  const titles = new Map(events.map((e) => [String(e._id), e.title]));
  const messages = await circleRepo.listAllMessages(events.map((e) => e._id));
  return {
    unread,
    notifications: notifications.map((n) => {
      let defaultTo = n.actionUrl || null;
      if (!defaultTo && n.event) {
        const evId = String(n.event);
        const t = String(n.type || '').toLowerCase();
        if (['booking', 'payment', 'completion'].includes(t)) defaultTo = `/customer/events/${evId}/bookings`;
        else if (t === 'quote') defaultTo = `/customer/events/${evId}/quotes`;
        else if (t === 'message') defaultTo = `/customer/events/${evId}/circle`;
        else if (t === 'event_day') defaultTo = `/customer/events/${evId}/event-day`;
        else defaultTo = `/customer/events/${evId}`;
      }
      return {
        id: String(n._id),
        type: n.type || 'system',
        important: IMPORTANT.includes(n.type),
        title: n.title,
        body: n.body,
        to: defaultTo,
        priority: n.priority || 'NORMAL',
        status: n.status || (n.readAt ? 'READ' : 'DELIVERED'),
        eventId: n.event ? String(n.event) : null,
        eventTitle: n.event ? titles.get(String(n.event)) || null : null,
        read: Boolean(n.readAt),
        createdAt: n.createdAt,
      };
    }),
    threads: (threads || []).map((t) => {
      const evId = t.customerEvent ? String(t.customerEvent) : null;
      const serviceId = t.customerRequirement ? String(t.customerRequirement) : null;
      const bookingId = t.customerBooking ? String(t.customerBooking) : null;
      const toUrl = evId
        ? `/customer/events/${evId}/circle${bookingId ? `?booking=${bookingId}` : serviceId ? `?service=${serviceId}` : ''}`
        : '/customer/events';
      return {
        id: String(t._id),
        vendorName: t.vendor?.businessName || t.clientName || 'Vendor Partner',
        vendorCategory: t.vendor?.category || t.eventType || 'Service',
        eventName: t.eventName || (evId ? titles.get(evId) : null) || 'Event',
        lastMessageText: t.lastMessageText || '',
        lastMessageAt: t.lastMessageAt || t.updatedAt,
        unreadCount: t.unreadClientCount || 0,
        eventId: evId,
        to: toUrl,
      };
    }),
    vendorMessages: messages
      .filter((m) => m.senderType === 'vendor' || m.senderType === 'team' || m.senderType === 'customer')
      .slice(0, 30)
      .map((m) => {
        const evId = m.event ? String(m.event) : null;
        return {
          ...serializeMessage(m),
          eventId: evId,
          eventTitle: evId ? titles.get(evId) || null : null,
          to: evId
            ? `/customer/events/${evId}/circle${m.booking ? `?booking=${m.booking}` : m.requirement ? `?service=${m.requirement}` : ''}`
            : '/customer/events',
        };
      }),
    auraConversations: sessions.map((s) => ({
      sessionId: s._id,
      eventId: s.event ? String(s.event) : null,
      eventTitle: s.event ? titles.get(String(s.event)) || 'Event Planning' : 'General Planning',
      updatedAt: s.updatedAt,
    })),
  };
}

export async function readAll(customerId) {
  const [r] = await Promise.all([
    circleRepo.markAllRead(customerId),
    VendorMessageThread.updateMany(
      { customer: customerId },
      { $set: { unreadClientCount: 0, 'messages.$[m].isRead': true } },
      { arrayFilters: [{ 'm.sender': 'VENDOR' }] }
    ).catch(() => null),
  ]);
  return { marked: r?.modifiedCount || 0 };
}

export const unreadCount = (customerId) => circleRepo.countUnread(customerId);
