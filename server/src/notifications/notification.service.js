import { observeProduct } from '../common/productObservability.js';
import { NotificationPreference } from './preferences.models.js';
import { incrementMetric } from '../metrics.js';
import { CustomerNotification } from '../customer/models/index.js';
import { Notification as VendorNotification } from '../external/models/Notification.js';

const PRIORITIES = new Set(['CRITICAL', 'HIGH', 'NORMAL', 'LOW']);
const CHANNELS = new Set(['IN_APP', 'PUSH', 'SMS', 'WHATSAPP', 'EMAIL']);

function cleanPriority(priority) {
  const value = String(priority || 'NORMAL').toUpperCase();
  return PRIORITIES.has(value) ? value : 'NORMAL';
}

function cleanChannel(channel) {
  const value = String(channel || 'IN_APP').toUpperCase();
  return CHANNELS.has(value) ? value : 'IN_APP';
}

function compactText(value, max = 240) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function dedupeKey(prefix, parts) {
  return [prefix, ...parts.map((p) => String(p || '').trim()).filter(Boolean)].join(':');
}

async function createOnce(Model, findFilter, doc) {
  if (doc.idempotencyKey) {
    const existing = await Model.findOne(findFilter).lean();
    if (existing) { await observeProduct('notification', 'DUPLICATE'); return { notification: existing, created: false }; }
  }
  try {
    const created = await Model.create(doc);
    incrementMetric('starvnt_notifications_created_total', { type: doc.type });
    await observeProduct('notification', 'CREATED');
    return { notification: created.toObject(), created: true };
  } catch (err) {
    if (err?.code === 11000 && doc.idempotencyKey) {
      const existing = await Model.findOne(findFilter).lean();
      if (existing) { await observeProduct('notification', 'DUPLICATE'); return { notification: existing, created: false }; }
    }
    throw err;
  }
}

export async function notifyCustomer({
  customerId,
  eventId = null,
  bookingId = null,
  type = 'system',
  priority = 'NORMAL',
  title,
  body = '',
  actionUrl = null,
  templateId = null,
  idempotencyKey = null,
  payload = {},
  channel = 'IN_APP',
  recipient = null,
} = {}) {
  if (!customerId || !title) return { notification: null, created: false, skipped: true };
  const policy = await NotificationPreference.findById(`CUSTOMER:${customerId}`).lean();
  if (policy?.disabledTypes?.map(t => t.toLowerCase()).includes(type.toLowerCase())) return { notification: null, created: false, skipped: true };
  if (!['IN_APP', 'PUSH'].includes(cleanChannel(channel))) throw new Error('Notification channel is not configured');
  const destination = type.toLowerCase().includes('quote') ? '/quotes' : /payment|booking|cancellation|completion/i.test(type) ? '/bookings' : /message/i.test(type) ? '/circle' : '';
  actionUrl = actionUrl || (eventId ? `/customer/events/${eventId}${destination}${bookingId ? `#${bookingId}` : ''}` : '/customer/updates');
  const key = idempotencyKey || dedupeKey(`customer.${type}`, [customerId, eventId, bookingId, payload.quoteId, payload.paymentId, payload.messageId, payload.threadId, payload.revision, title]);
  return createOnce(
    CustomerNotification,
    { idempotencyKey: key },
    {
      customer: customerId,
      event: eventId,
      booking: bookingId,
      type,
      priority: cleanPriority(priority),
      channel: 'IN_APP',
      templateId,
      recipient,
      title: compactText(title, 140),
      body: compactText(body, 500),
      actionUrl,
      payload,
      idempotencyKey: key,
      status: 'DELIVERED',
      provider: 'STARVNT_CORE',
      sentAt: new Date(),
      deliveredAt: new Date(),
    }
  );
}

export async function notifyVendor({
  vendorId,
  type = 'SYSTEM',
  priority = 'NORMAL',
  title,
  message = '',
  link = '/vendor/dashboard',
  templateId = null,
  idempotencyKey = null,
  metadata = {},
  channel = 'IN_APP',
  recipient = null,
} = {}) {
  if (!vendorId || !title) return { notification: null, created: false, skipped: true };
  const policy = await NotificationPreference.findById(`VENDOR:${vendorId}`).lean();
  if (policy?.disabledTypes?.map(t => t.toLowerCase()).includes(type.toLowerCase())) return { notification: null, created: false, skipped: true };
  if (!['IN_APP', 'PUSH'].includes(cleanChannel(channel))) throw new Error('Notification channel is not configured');
  const cleanType = String(type || 'SYSTEM').toUpperCase();
  const key = idempotencyKey || dedupeKey(`vendor.${cleanType}`, [vendorId, metadata?.opportunityId, metadata?.quoteId, metadata?.bookingId, metadata?.paymentId, metadata?.messageId, metadata?.threadId, metadata?.revision, title]);
  return createOnce(
    VendorNotification,
    { idempotencyKey: key },
    {
      vendor: vendorId,
      title: compactText(title, 140),
      message: compactText(message, 500),
      type: cleanType,
      priority: cleanPriority(priority),
      channel: 'IN_APP',
      templateId,
      recipient,
      link,
      idempotencyKey: key,
      status: 'DELIVERED',
      provider: 'STARVNT_CORE',
      sentAt: new Date(),
      deliveredAt: new Date(),
      metadata,
    }
  );
}

