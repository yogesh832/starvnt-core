import crypto from 'node:crypto';

/**
 * Razorpay via REST + HMAC. The configured key selects live or test mode.
 * Payment infrastructure owns money: we create orders and verify signed
 * webhooks; a browser callback is never proof of payment.
 */
const env = () => ({
  keyId: process.env.RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
});

export const isConfigured = () => Boolean(env().keyId && env().keySecret);
export const webhookConfigured = () => Boolean(env().webhookSecret);
// Checkout verifies capture through the server REST API. Webhooks add asynchronous recovery.
export const checkoutConfigured = () => isConfigured();
export const publicKeyId = () => env().keyId;

export const toPaise = (rupees) => Math.round(Number(rupees) * 100);

export async function createOrder({ amount, receipt, notes = {} }) {
  const { keyId, keySecret } = env();
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
    },
    body: JSON.stringify({ amount: toPaise(amount), currency: 'INR', receipt: String(receipt).slice(0, 40), notes }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    const err = new Error(data?.error?.description || `Razorpay order failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data; // { id, amount, currency, ... }
}

export async function listOrderPayments(orderId) {
  const { keyId, keySecret } = env();
  const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/payments`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
    },
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.description || `Razorpay payment lookup failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return Array.isArray(data.items) ? data.items : [];
}

async function refundRequest(path, body) {
  const { keyId, keySecret } = env();
  if (!keyId || !keySecret) throw new Error('REFUND_PROVIDER_NOT_CONFIGURED');
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.description || 'REFUND_PROVIDER_UNAVAILABLE');
  return result;
}
export function createRefund(paymentId, { amount, receipt }) {
  return refundRequest(`payments/${encodeURIComponent(paymentId)}/refund`, { amount: toPaise(amount), receipt });
}
export function listPaymentRefunds(paymentId, skip = 0) {
  return refundRequest(`payments/${encodeURIComponent(paymentId)}/refunds?count=100&skip=${skip}`);
}

/** HMAC-SHA256 of the raw body with the webhook secret, compared in constant time. */
export function verifyWebhookSignature(rawBody, signature) {
  const { webhookSecret } = env();
  if (!webhookSecret || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const { keySecret } = env();
  if (!keySecret || !orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Capture, order, currency and exact amount must all match. An authorised
// payment or a valid Checkout HMAC alone is not proof that money was captured.
export async function findCapturedOrderPayment({ orderId, amount, paymentId }) {
  if (!orderId || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return null;
  const payments = await listOrderPayments(orderId);
  return payments.find(payment => payment.order_id === orderId
    && (!paymentId || payment.id === paymentId)
    && Number(payment.amount) === toPaise(amount) && payment.currency === 'INR'
    && payment.status === 'captured' && payment.captured === true) || null;
}
