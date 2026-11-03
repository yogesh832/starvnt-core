import { schedulingError } from './scheduleRules.js';
export const EXTERNAL_CHANNELS = ['DIRECT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'WEBSITE', 'JUSTDIAL', 'REFERRAL', 'REPEAT', 'OTHER', 'LEGACY_UNKNOWN'];
export const EXTERNAL_TRANSITIONS = {
  ENQUIRY: ['NEGOTIATION', 'QUOTE_SENT', 'ON_HOLD', 'CONFIRMED', 'CANCELLED'],
  NEGOTIATION: ['QUOTE_SENT', 'ON_HOLD', 'CONFIRMED', 'CANCELLED'], QUOTE_SENT: ['NEGOTIATION', 'ON_HOLD', 'CONFIRMED', 'CANCELLED'],
  ON_HOLD: ['CONFIRMED', 'ENQUIRY', 'NEGOTIATION', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'], IN_PROGRESS: ['COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: [],
};
export function externalMoney(value, label = 'amount') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e10 || Math.abs(value * 100 - Math.round(value * 100)) > 0.0001) throw schedulingError('INVALID_EXTERNAL_AMOUNT', `Use a valid ${label} with at most two decimal places.`);
  return Math.round(value * 100) / 100;
}
export function externalCommercialInput(input = {}) {
  if (!input || typeof input !== 'object' || (input.lineItems !== undefined && !Array.isArray(input.lineItems)) || (input.allocations !== undefined && !Array.isArray(input.allocations))) throw schedulingError('INVALID_EXTERNAL_ITEMS', 'Use valid service and resource lists.');
  if (input.guestCount != null && (!Number.isInteger(input.guestCount) || input.guestCount < 1 || input.guestCount > 1000000)) throw schedulingError('INVALID_GUEST_COUNT', 'Guest count must be a positive whole number.');
  const acquisitionChannel = input.acquisitionChannel || 'LEGACY_UNKNOWN';
  const lifecycle = input.lifecycle || 'CONFIRMED';
  const totalAmount = input.totalAmount ?? 0;
  if (!EXTERNAL_CHANNELS.includes(acquisitionChannel) || !Object.hasOwn(EXTERNAL_TRANSITIONS, lifecycle)) throw schedulingError('INVALID_EXTERNAL_BOOKING', 'Choose a valid booking source and lifecycle.');
  externalMoney(totalAmount, 'contract amount');
  const holdExpiresAt = input.holdExpiresAt ? new Date(input.holdExpiresAt) : null;
  if (holdExpiresAt && !Number.isFinite(holdExpiresAt.getTime())) throw schedulingError('INVALID_HOLD_EXPIRY', 'Choose a valid hold expiry.');
  if (lifecycle === 'ON_HOLD' && (!holdExpiresAt || !Number.isFinite(holdExpiresAt.getTime()) || holdExpiresAt <= new Date())) throw schedulingError('HOLD_EXPIRY_REQUIRED', 'Choose a future expiry for a tentative hold.');
  const dueAt = input.nextPaymentDueAt ? new Date(input.nextPaymentDueAt) : null;
  if (dueAt && !Number.isFinite(dueAt.getTime())) throw schedulingError('INVALID_PAYMENT_DUE_DATE', 'Choose a valid next payment date.');
  const buffers = Object.fromEntries(['setupMinutes', 'teardownMinutes', 'travelBeforeMinutes', 'travelAfterMinutes'].map(k => {
    const value = input.buffers?.[k] ?? 0;
    if (!Number.isInteger(value) || value < 0 || value > 1440) throw schedulingError('INVALID_BUFFER', 'Buffers must be whole minutes between 0 and 1440.');
    return [k, value];
  }));
  const lineItems = (input.lineItems || []).map(line => {
    if (!line || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 100000 || (!line.service && !String(line.name || '').trim())) throw schedulingError('INVALID_SERVICE_QUANTITY', 'Each service needs a name or catalogue service and a positive whole quantity.');
    return { service: line.service || null, name: String(line.name || '').trim().slice(0, 120), quantity: line.quantity, unitPrice: externalMoney(line.unitPrice ?? 0, 'unit price') };
  });
  const allocations = (input.allocations || []).map(a => {
    if (!a?.resource || !Number.isInteger(a.units) || a.units < 1 || a.units > 100000) throw schedulingError('INVALID_RESOURCE_QUANTITY', 'Each resource needs a positive whole quantity.');
    return { resource: String(a.resource), units: a.units };
  });
  if (lineItems.length > 50 || allocations.length > 100 || new Set(allocations.map(a => a.resource)).size !== allocations.length) throw schedulingError('INVALID_EXTERNAL_ITEMS', 'Use at most 50 service lines and 100 distinct resources.');
  return { acquisitionChannel, lifecycle, totalAmount: Math.round(totalAmount * 100) / 100, holdExpiresAt, nextPaymentDueAt: dueAt,
    eventName: String(input.eventName || '').trim().slice(0, 160), guestCount: input.guestCount ?? null, lineItems, allocations, buffers };
}
export function externalFinancials(row, now = new Date()) {
  const b = row.externalBooking || {};
  const sum = list => Math.round((list || []).reduce((n, r) => n + Math.round(r.amount * 100), 0)) / 100;
  const received = sum(b.receipts), refunded = sum(b.refunds), net = Math.round((received - refunded) * 100) / 100;
  const cancelled = row.status === 'CANCELLED' || b.lifecycle === 'CANCELLED';
  const outstanding = cancelled ? 0 : Math.max(0, Math.round(((b.totalAmount || 0) - net) * 100) / 100);
  return { totalAmount: b.totalAmount || 0, receivedAmount: received, refundedAmount: refunded, netReceivedAmount: net, outstandingAmount: outstanding,
    paymentStatus: cancelled ? (net > 0 ? 'CANCELLATION_REVIEW' : 'CLOSED') : b.totalAmount === 0 ? 'NO_PAYMENT_DUE' : outstanding === 0 && received > 0 ? 'REPORTED_PAID' : received > 0 ? 'REPORTED_PARTIAL' : 'UNPAID',
    overdue: !cancelled && outstanding > 0 && b.nextPaymentDueAt != null && new Date(b.nextPaymentDueAt) < now, verification: 'VENDOR_REPORTED' };
}
export function externalReservesCapacity(row, now = new Date()) {
  if (row.recordType !== 'EXTERNAL_COMMITMENT' || !row.externalBooking?.lifecycle) return true;
  const { lifecycle, holdExpiresAt } = row.externalBooking;
  return ['CONFIRMED', 'IN_PROGRESS'].includes(lifecycle) || (lifecycle === 'ON_HOLD' && holdExpiresAt && new Date(holdExpiresAt) > now);
}
