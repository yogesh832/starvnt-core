import crypto from 'node:crypto';

/**
 * Razorpay (test mode) via REST + HMAC. Keys live only in .env.
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

/** HMAC-SHA256 of the raw body with the webhook secret, compared in constant time. */
export function verifyWebhookSignature(rawBody, signature) {
  const { webhookSecret } = env();
  if (!webhookSecret || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
