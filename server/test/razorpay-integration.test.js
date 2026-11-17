import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { VendorFinancialProfile } from '../src/external/models/VendorFinancialProfile.js';
import { BankVerificationLog } from '../src/external/models/BankVerificationLog.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { Quote } from '../src/external/models/Quote.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { CustomerEvent, Payment, Booking, Reservation, EventRequirement, PaymentWebhookEvent } from '../src/customer/models/index.js';
import { recordWebhookEvent } from '../src/customer/repositories/commerce.repo.js';
import { requestBankVerification } from '../src/external/services/bankVerification.service.js';
import { requestRazorpayBankVerification, normalizeRazorpayBankResult } from '../src/external/services/razorpayBankVerification.service.js';
import { findCapturedOrderPayment, checkoutConfigured } from '../src/customer/services/payments/razorpay.js';
import { reconcileCustomerPayment } from '../src/customer/services/commerce.service.js';

const id = () => new mongoose.Types.ObjectId();
const key = () => crypto.randomUUID();
const bank = { accountHolderName: 'Sample Vendor', accountNumber: '123456789012', ifsc: 'HDFC0001234', bankName: 'HDFC', accountType: 'CURRENT' };
const completed = (validationId, extra = {}) => ({ id: validationId, status: 'completed', validation_results: { account_status: 'active', registered_name: bank.accountHolderName }, ...extra });
const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const envNames = ['RAZORPAYX_KEY_ID', 'RAZORPAYX_KEY_SECRET', 'RAZORPAYX_ACCOUNT_NUMBER', 'RAZORPAYX_BANK_VERIFICATION_ENABLED', 'RAZORPAYX_WEBHOOK_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];
let mongo, app, originalEnv;
before(async () => {
  originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  Object.assign(process.env, { RAZORPAYX_KEY_ID: 'rzp_live_fixture', RAZORPAYX_KEY_SECRET: 'fixture_x_secret', RAZORPAYX_ACCOUNT_NUMBER: '1234567890', RAZORPAYX_BANK_VERIFICATION_ENABLED: 'true', RAZORPAYX_WEBHOOK_SECRET: 'fixture_x_webhook', RAZORPAY_KEY_ID: 'rzp_test_fixture', RAZORPAY_KEY_SECRET: 'fixture_payment_secret', RAZORPAY_WEBHOOK_SECRET: 'fixture_webhook' });
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('razorpay_external_test')), adminConn.openUri(mongo.getUri('razorpay_admin_test'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(model => model.init()));
}, { timeout: 120000 });
after(async () => {
  for (const [name, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  await Promise.all([externalConn.close(), adminConn.close()]);
  if (mongo) await mongo.stop();
});
async function user(accountType = 'CUSTOMER') {
  const u = await ExternalUser.create({ fullName: 'Fixture user', email: `${key()}@example.test`, accountType });
  const session = await ExternalSession.create({ user: u._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  return { user: u, auth: { Authorization: `Bearer ${signExternalAccessToken(u, session._id)}` } };
}
async function vendor() {
  const owner = await user('VENDOR');
  const v = await VendorOrganization.create({ owner: owner.user._id, businessName: bank.accountHolderName, status: 'SUSPENDED' });
  owner.user.vendorOrganization = v._id; await owner.user.save();
  await VendorFinancialProfile.create({ vendor: v._id, pan: { panNumber: 'ABCDE1234F', verificationStatus: 'VERIFIED' } });
  return { vendor: v, ...owner };
}
async function quoteFixture() {
  const v = await vendor(), customer = await user();
  const orderId = `order_${key()}`;
  const quote = await Quote.create({ vendor: v.vendor._id, customer: customer.user._id, vendorService: id(), serviceName: 'Photography', eventDate: '2099-01-01', status: 'SUBMITTED', pricingBreakdown: { basePrice: 1000, totalAmount: 1000 }, advancePayment: { amount: 300, percentage: 30, status: 'ORDER_CREATED', providerOrderId: orderId } });
  return { ...v, customer, quote, orderId };
}
async function balanceFixture() {
  const v = await vendor(), customer = await user();
  const event = await CustomerEvent.create({ customer: customer.user._id, title: 'Paid booking', eventDate: '2099-01-01', status: 'planning' });
  const requirement = await EventRequirement.create({ event: event._id, category: 'photography' });
  const reservation = await Reservation.create({ customer: customer.user._id, event: event._id, quote: id(), quoteItem: id(), requirement: requirement._id, category: 'photography', optionId: `vs_${id()}`, vendorName: 'Fixture Vendor', packageName: 'Photography', packageTotal: 1000, amount: 300, balanceAmount: 700, advancePercent: 30, status: 'converted', expiresAt: new Date(Date.now() + 3600000) });
  const advance = await Payment.create({ customer: customer.user._id, event: event._id, reservation: reservation._id, amount: 300, status: 'verified', providerOrderId: `order_advance_${key()}` });
  const snapshot = { vendorId: v.vendor._id, serviceName: 'Photography', eventDate: event.eventDate, totalAmount: 1000, paymentSummary: { paidAmount: 300, balanceAmount: 700 } };
  const booking = await Booking.create({ customer: customer.user._id, event: event._id, requirement: requirement._id, reservation: reservation._id, payment: advance._id, category: 'photography', optionId: reservation.optionId, vendorName: 'Fixture Vendor', packageName: 'Photography', amount: 1000, paidAmount: 300, balanceAmount: 700, status: 'confirmed', vendor: v.vendor._id, coreSync: { status: 'SYNCED', snapshot } });
  const core = await CoreBooking.create({ customerBookingId: booking._id, customerId: customer.user._id, customerEvent: event._id, vendorId: v.vendor._id, serviceName: 'Photography', eventDate: event.eventDate, totalAmount: 1000, bookingStatus: 'CONFIRMED', paymentStatus: 'PAYMENT_VERIFIED', executionStatus: 'COMPLETION_VERIFIED', paymentSummary: { paidAmount: 300, balanceAmount: 700 } });
  return { ...v, customer, event, reservation, advance, booking, core };
}
function captured(orderId, extra = {}) { return { id: 'pay_fixture', order_id: orderId, amount: 30000, currency: 'INR', status: 'captured', captured: true, ...extra }; }
async function paymentWebhook(orderId, eventId = key()) {
  const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: captured(orderId) } } });
  return request(app).post('/api/webhooks/razorpay').set('Content-Type', 'application/json').set('x-razorpay-event-id', eventId).set('x-razorpay-signature', crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex')).send(raw);
}

test('bank result requires completed, active and matching name; unknown results never verify', () => {
  assert.equal(normalizeRazorpayBankResult(completed('fav_1'), bank.accountHolderName).verificationStatus, 'VERIFIED');
  for (const result of [{}, completed('fav_1', { status: 'failed' }), completed('fav_1', { validation_results: { account_status: 'invalid', registered_name: bank.accountHolderName } }), completed('fav_1', { validation_results: { account_status: 'active', registered_name: 'Unrelated Person' } })]) assert.equal(normalizeRazorpayBankResult(result, bank.accountHolderName).verificationStatus, 'FAILED');
  assert.equal(normalizeRazorpayBankResult({ status: 'created' }, bank.accountHolderName).verificationStatus, 'PROCESSING');
  assert.equal(normalizeRazorpayBankResult({ status: 'completed', results: { account_status: 'active', registered_name: bank.accountHolderName } }, bank.accountHolderName).verificationStatus, 'VERIFIED');
});

test('Vendor financial API uses Razorpay by default and refreshes the documented GET results shape', async t => {
  assert.equal(config.bankVerificationProvider, 'RAZORPAY');
  const f = await vendor(); let posts = 0, gets = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(String(url).startsWith('https://api.razorpay.com/v1/fund_accounts/validations'));
    if (options.method === 'POST') { posts++; return json({ id: 'fav_default', status: 'created' }); }
    gets++; return json({ id: 'fav_default', status: 'completed', results: { account_status: 'active', registered_name: bank.accountHolderName }, fund_account: { bank_account: { account_number: bank.accountNumber, ifsc: bank.ifsc } } });
  });
  const initial = await request(app).post('/api/vendor/financial/bank/verify').set(f.auth).send(bank).expect(200);
  assert.equal(initial.body.provider, 'RAZORPAY'); assert.equal(initial.body.status, 'PROCESSING');
  const refresh = await request(app).post('/api/vendor/financial/bank/verify').set(f.auth).send(bank).expect(200);
  assert.equal(refresh.body.status, 'VERIFIED'); assert.equal(posts, 1); assert.equal(gets, 1);
  const profile = await request(app).get('/api/vendor/financial').set(f.auth).expect(200);
  assert.equal(profile.body.bankVerification.provider, 'RAZORPAY'); assert.equal(profile.body.bankVerification.configured, true);
});

test('missing RazorpayX setup is unavailable and never falls back to Cashfree or a mock', async t => {
  const f = await vendor(); const original = process.env.RAZORPAYX_BANK_VERIFICATION_ENABLED;
  process.env.RAZORPAYX_BANK_VERIFICATION_ENABLED = 'false';
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Provider must not be called'); });
  try {
    const response = await request(app).post('/api/vendor/financial/bank/verify').set(f.auth).send({ ...bank, mock: true, provider: 'CASHFREE' }).expect(503);
    assert.equal(response.body.error, 'RAZORPAYX_NOT_CONFIGURED'); assert.equal(fetchMock.mock.callCount(), 0);
    const profile = await request(app).get('/api/vendor/financial').set(f.auth).expect(200);
    assert.equal(profile.body.bankVerification.configured, false);
    assert.notEqual(profile.body.profile.bankAccount?.verificationStatus, 'VERIFIED');
  } finally { process.env.RAZORPAYX_BANK_VERIFICATION_ENABLED = original; }
});

test('bank save and verification reject invalid account numbers and IFSC before provider calls', async t => {
  const f = await vendor();
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Provider must not be called'); });
  for (const change of [{ accountNumber: 'AB123456' }, { accountNumber: '123' }, { ifsc: 'BAD' }, { accountType: 'INVALID' }]) {
    for (const path of ['/api/vendor/financial/bank', '/api/vendor/financial/bank/verify']) await request(app).post(path).set(f.auth).send({ ...bank, ...change }).expect(400);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('an active bank account with a different holder name remains unverified', async t => {
  const f = await vendor();
  t.mock.method(globalThis, 'fetch', async () => json(completed('fav_mismatch', { validation_results: { account_status: 'active', registered_name: 'Different Beneficiary' } })));
  const response = await request(app).post('/api/vendor/financial/bank/verify').set(f.auth).send(bank).expect(200);
  assert.equal(response.body.status, 'FAILED'); assert.equal(response.body.nameMatchStatus, 'MISMATCH');
  const profile = await VendorFinancialProfile.findOne({ vendor: f.vendor._id });
  assert.equal(profile.bankAccount.verificationStatus, 'FAILED'); assert.equal(profile.isSettlementEligible, false);
});

test('test keys cannot validate a bank or silently use the enabled test mock', async t => {
  const original = process.env.RAZORPAYX_KEY_ID;
  process.env.RAZORPAYX_KEY_ID = 'rzp_test_fixture';
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not call provider'); });
  try {
    const result = await requestBankVerification(id(), bank, { provider: 'RAZORPAY', mock: true });
    assert.equal(result.error, 'RAZORPAYX_NOT_CONFIGURED');
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally { process.env.RAZORPAYX_KEY_ID = original; }
});

test('bank pending request is reused and refreshed by GET; audit never contains full bank payload', async t => {
  const f = await vendor(); let posts = 0, gets = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).hostname, 'api.razorpay.com');
    if (options.method === 'POST') {
      posts++; const body = JSON.parse(options.body); assert.equal(body.validation_type, 'penniless');
      return json({ id: 'fav_pending', status: 'created' });
    }
    gets++; return json(completed('fav_pending', { fund_account: { bank_account: { account_number: bank.accountNumber, ifsc: bank.ifsc } } }));
  });
  const pending = await requestBankVerification(f.vendor._id, bank, { provider: 'RAZORPAY' });
  assert.equal(pending.status, 'PROCESSING');
  const result = await requestBankVerification(f.vendor._id, bank, { provider: 'RAZORPAY', forceRetry: true });
  assert.equal(result.status, 'VERIFIED'); assert.equal(posts, 1); assert.equal(gets, 1);
  assert.equal((await VendorFinancialProfile.findOne({ vendor: f.vendor._id })).isSettlementEligible, true);
  const log = await BankVerificationLog.findOne({ vendor: f.vendor._id }).lean();
  assert.ok(!JSON.stringify(log).includes(bank.accountNumber));
  assert.equal(log.completedAt instanceof Date, true);
});

test('bank timeout stays pending and cannot trigger another provider transaction', async t => {
  const f = await vendor(); let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('timeout'); });
  assert.equal((await requestRazorpayBankVerification(f.vendor._id, bank)).status, 'PROCESSING');
  assert.equal((await requestRazorpayBankVerification(f.vendor._id, bank)).status, 'PROCESSING');
  assert.equal(calls, 1);
  const changed = await requestRazorpayBankVerification(f.vendor._id, { ...bank, accountNumber: '999999999999' });
  assert.equal(changed.error, 'BANK_VERIFICATION_IN_PROGRESS');
});

test('concurrent bank verification submits at most one provider transaction', async t => {
  const f = await vendor(); let posts = 0;
  t.mock.method(globalThis, 'fetch', async () => { posts++; return json({ id: 'fav_concurrent', status: 'created' }); });
  await Promise.all([requestRazorpayBankVerification(f.vendor._id, bank), requestRazorpayBankVerification(f.vendor._id, bank)]);
  assert.equal(posts, 1);
});

test('saving changed bank details clears verification and settlement eligibility', async () => {
  const f = await vendor();
  await VendorFinancialProfile.updateOne({ vendor: f.vendor._id }, { $set: { bankAccount: { ...bank, verificationStatus: 'VERIFIED', nameMatchStatus: 'EXACT', lastVerifiedAt: new Date() }, isSettlementEligible: true } });
  await request(app).post('/api/vendor/financial/bank').set(f.auth).send({ ...bank, accountNumber: '999999999999' }).expect(200);
  const profile = await VendorFinancialProfile.findOne({ vendor: f.vendor._id });
  assert.equal(profile.bankAccount.verificationStatus, 'NOT_VERIFIED'); assert.equal(profile.isSettlementEligible, false);
});

test('RazorpayX webhook rejects invalid signatures, reconciles via REST and tolerates duplicates', async t => {
  const f = await vendor();
  t.mock.method(globalThis, 'fetch', async (url, options) => json(options.method === 'POST' ? { id: 'fav_webhook', status: 'created' } : completed('fav_webhook')));
  await requestRazorpayBankVerification(f.vendor._id, bank);
  const raw = JSON.stringify({ event: 'fund_account.validation.completed', payload: { 'fund_account.validation': { entity: { id: 'fav_webhook' } } } });
  const endpoint = '/api/webhooks/razorpayx';
  await request(app).post(endpoint).set('Content-Type', 'application/json').set('x-razorpay-signature', 'bad').send(raw).expect(400);
  await request(app).post(endpoint).set('Content-Type', 'application/json').set('x-razorpay-signature', 'é'.repeat(64)).send(raw).expect(400);
  const signature = crypto.createHmac('sha256', process.env.RAZORPAYX_WEBHOOK_SECRET).update(raw).digest('hex');
  await request(app).post(endpoint).set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(raw).expect(200);
  assert.equal((await VendorFinancialProfile.findOne({ vendor: f.vendor._id })).bankAccount.verificationStatus, 'VERIFIED');
  const duplicate = await request(app).post(endpoint).set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(raw).expect(200);
  assert.equal(duplicate.body.ignored, true);
});

test('captured payment lookup rejects wrong order, amount, currency or only authorised money', async t => {
  let payment = captured('order_ok');
  t.mock.method(globalThis, 'fetch', async () => json({ items: [payment] }));
  assert.ok(await findCapturedOrderPayment({ orderId: 'order_ok', amount: 300 }));
  for (const change of [{ order_id: 'order_foreign' }, { amount: 1 }, { currency: 'USD' }, { status: 'authorized', captured: false }, { captured: false }]) {
    payment = captured('order_ok', change);
    assert.equal(await findCapturedOrderPayment({ orderId: 'order_ok', amount: 300 }), null);
  }
});

test('Checkout can use server-side capture verification without an installed webhook', () => {
  const original = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = '';
  try { assert.equal(checkoutConfigured(), true); }
  finally { process.env.RAZORPAY_WEBHOOK_SECRET = original; }
});

test('balance checkout collects only the outstanding amount and captured money reaches both dashboards once', async t => {
  const f = await balanceFixture(); const orderId = `order_balance_${key()}`; let posts = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'POST') { posts++; assert.equal(JSON.parse(options.body).amount, 70000); return json({ id: orderId }); }
    return json({ items: [captured(orderId, { amount: 70000 })] });
  });
  const payPath = `/api/customer/events/${f.event._id}/reservations/${f.reservation._id}/pay`;
  const first = await request(app).post(payPath).set(f.customer.auth).send({}).expect(200);
  const retry = await request(app).post(payPath).set(f.customer.auth).send({}).expect(200);
  assert.equal(first.body.payment.amount, 700); assert.equal(retry.body.payment.id, first.body.payment.id); assert.equal(posts, 1);
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|pay_fixture`).digest('hex');
  const callback = `/api/customer/events/${f.event._id}/payments/${first.body.payment.id}/checkout-complete`;
  const payload = { razorpay_order_id: orderId, razorpay_payment_id: 'pay_fixture', razorpay_signature: signature };
  await request(app).post(callback).set(f.customer.auth).send(payload).expect(200);
  await request(app).post(callback).set(f.customer.auth).send(payload).expect(200);
  const core = await CoreBooking.findById(f.core._id);
  assert.equal(core.paymentSummary.paidAmount, 1000); assert.equal(core.paymentSummary.balanceAmount, 0); assert.equal(core.executionStatus, 'COMPLETION_VERIFIED');
  const vendorView = await request(app).get('/api/vendor/bookings').set(f.auth).expect(200);
  assert.equal(vendorView.body.bookings.find(row => row._id === String(core._id)).paymentSummary.paidAmount, 1000);
  const customerView = await request(app).get(`/api/customer/events/${f.event._id}/bookings`).set(f.customer.auth).expect(200);
  assert.ok(customerView.body.bookings.some(row => row.paidAmount === 1000 && row.balanceAmount === 0));
  const again = await request(app).post(payPath).set(f.customer.auth).send({}).expect(409);
  assert.equal(again.body.error, 'ALREADY_PAID'); assert.equal(posts, 1);
});

test('simultaneous checkout requests cannot create two provider orders', async t => {
  const f = await balanceFixture(); let posts = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => { if (options.method === 'POST') posts++; return json({ id: `order_race_${f.reservation._id}` }); });
  const path = `/api/customer/events/${f.event._id}/reservations/${f.reservation._id}/pay`;
  const results = await Promise.all([request(app).post(path).set(f.customer.auth).send({}), request(app).post(path).set(f.customer.auth).send({})]);
  assert.ok(results.some(row => row.status === 200)); assert.ok(results.every(row => [200, 409].includes(row.status))); assert.equal(posts, 1);
});

test('expired holds and demo bookings cannot open live-money checkout', async t => {
  const owner = await user();
  const event = await CustomerEvent.create({ customer: owner.user._id, title: 'No charge', eventDate: '2099-01-01', status: 'planning' });
  const reservation = await Reservation.create({ customer: owner.user._id, event: event._id, quote: id(), quoteItem: id(), requirement: id(), category: 'photography', optionId: 'demo_photo', vendorName: 'Demo', packageName: 'Demo', amount: 300, isDemo: true, expiresAt: new Date(Date.now() - 1000) });
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not create a chargeable order'); });
  const path = `/api/customer/events/${event._id}/reservations/${reservation._id}/pay`;
  const expired = await request(app).post(path).set(owner.auth).send({}).expect(409);
  assert.equal(expired.body.error, 'RESERVATION_EXPIRED');
  await Reservation.updateOne({ _id: reservation._id }, { $set: { expiresAt: new Date(Date.now() + 3600000), status: 'pending_payment' } });
  const previous = process.env.RAZORPAY_KEY_ID; process.env.RAZORPAY_KEY_ID = 'rzp_live_fixture';
  try {
    const demo = await request(app).post(path).set(owner.auth).send({}).expect(409); assert.equal(demo.body.error, 'DEMO_PAYMENT_DISABLED');
  } finally { process.env.RAZORPAY_KEY_ID = previous; }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('customer callback rejects a forged signature and leaves authorised money processing', async t => {
  const owner = await user();
  const event = await CustomerEvent.create({ customer: owner.user._id, title: 'Checkout verification', eventDate: '2099-01-01' });
  const orderId = `order_${key()}`;
  const payment = await Payment.create({ customer: owner.user._id, event: event._id, reservation: id(), amount: 300, providerOrderId: orderId });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return json({ items: [captured(orderId, { status: 'authorized', captured: false })] }); });
  const endpoint = `/api/customer/events/${event._id}/payments/${payment._id}/checkout-complete`;
  const payload = { razorpay_order_id: orderId, razorpay_payment_id: 'pay_fixture', razorpay_signature: 'invalid' };
  await request(app).post(endpoint).set(owner.auth).send(payload).expect(400);
  assert.equal(calls, 0); assert.equal((await Payment.findById(payment._id)).status, 'pending');
  payload.razorpay_signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|pay_fixture`).digest('hex');
  const response = await request(app).post(endpoint).set(owner.auth).send(payload).expect(200);
  assert.equal(response.body.payment.status, 'processing');
  assert.equal(await CoreBooking.countDocuments({ customerId: owner.user._id }), 0);
});

test('a valid Checkout HMAC cannot confirm an uncaptured quote payment', async t => {
  const f = await quoteFixture();
  t.mock.method(globalThis, 'fetch', async () => json({ items: [captured(f.orderId, { status: 'authorized', captured: false })] }));
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${f.orderId}|pay_fixture`).digest('hex');
  await request(app).post(`/api/customer/vendor-quotes/${f.quote._id}/checkout-complete`).set(f.customer.auth).send({ razorpay_order_id: f.orderId, razorpay_payment_id: 'pay_fixture', razorpay_signature: signature }).expect(402);
  assert.equal((await Quote.findById(f.quote._id)).advancePayment.status, 'ORDER_CREATED');
  await request(app).post(`/api/customer/vendor-quotes/${f.quote._id}/checkout-complete`).set(f.customer.auth).send({ razorpay_order_id: f.orderId, razorpay_payment_id: 'pay_fixture', razorpay_signature: 'bad' }).expect(400);
  assert.equal((await Quote.findById(f.quote._id)).advancePayment.status, 'ORDER_CREATED');
});

test('quote webhook recovers money when checkout closed and leaves activation conflicts for review', async t => {
  const f = await quoteFixture();
  t.mock.method(globalThis, 'fetch', async () => json({ items: [captured(f.orderId)] }));
  const eventId = key();
  assert.equal((await paymentWebhook(f.orderId, eventId)).status, 200);
  const quote = await Quote.findById(f.quote._id);
  assert.equal(quote.advancePayment.status, 'VERIFIED');
  assert.equal(quote.bookingReview.status, 'CONFLICT_REVIEW');
  assert.equal(await CoreBooking.countDocuments({ quoteId: String(quote._id) }), 0);
  assert.equal((await paymentWebhook(f.orderId, eventId)).body.duplicate, true);
});

test('customer payment reconciliation checks customer and event ownership before contacting provider', async t => {
  const owner = await user(), stranger = await user();
  const event = await CustomerEvent.create({ customer: owner.user._id, title: 'Private event', eventDate: '2099-01-01' });
  const payment = await Payment.create({ customer: owner.user._id, event: event._id, reservation: id(), amount: 300, providerOrderId: `order_${key()}` });
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not call provider'); });
  await assert.rejects(reconcileCustomerPayment(stranger.user._id, event._id, payment._id));
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('webhook delivery preserves empty objects, ignores key ordering and rejects changed content', async () => {
  const eventId = key();
  const send = body => request(app).post('/api/webhooks/razorpay').set('Content-Type', 'application/json').set('x-razorpay-event-id', eventId).set('x-razorpay-signature', crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex')).send(body);
  const first = await send(JSON.stringify({ event: 'integration.readiness_check', payload: {} })).expect(200);
  assert.equal(first.body.ignored, true);
  const retry = await send(JSON.stringify({ payload: {}, event: 'integration.readiness_check' })).expect(200);
  assert.equal(retry.body.duplicate, true);
  await send(JSON.stringify({ event: 'integration.readiness_check', payload: { changed: true } })).expect(409);
});

test('legacy webhook records without a hash tolerate Mongoose empty-object minimization', async () => {
  const providerEventId = key();
  await PaymentWebhookEvent.collection.insertOne({ provider: 'razorpay', providerEventId, eventType: 'legacy', payload: { event: 'legacy' }, processingStatus: 'COMPLETED' });
  assert.equal(await recordWebhookEvent('razorpay', providerEventId, 'legacy', { event: 'legacy', payload: {} }), false);
  const row = await PaymentWebhookEvent.findOne({ providerEventId }).lean();
  assert.equal(row.payloadHash.length, 64);
});
