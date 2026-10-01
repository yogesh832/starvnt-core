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
    if (existing) return { notification: existing, created: false };
  }
  try {
    const created = await Model.create(doc);
    return { notification: created.toObject(), created: true };
  } catch (err) {
    if (err?.code === 11000 && doc.idempotencyKey) {
      const existing = await Model.findOne(findFilter).lean();
      if (existing) return { notification: existing, created: false };
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
  const key = idempotencyKey || dedupeKey(`customer.${type}`, [customerId, eventId, bookingId, title]);
  return createOnce(
    CustomerNotification,
    { idempotencyKey: key },
    {
      customer: customerId,
      event: eventId,
      booking: bookingId,
      type,
      priority: cleanPriority(priority),
      channel: cleanChannel(channel),
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
  const cleanType = String(type || 'SYSTEM').toUpperCase();
  const key = idempotencyKey || dedupeKey(`vendor.${cleanType}`, [vendorId, metadata?.opportunityId, metadata?.quoteId, metadata?.threadId, title]);
  return createOnce(
    VendorNotification,
    { idempotencyKey: key },
    {
      vendor: vendorId,
      title: compactText(title, 140),
      message: compactText(message, 500),
      type: cleanType,
      priority: cleanPriority(priority),
      channel: cleanChannel(channel),
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

