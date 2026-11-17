import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorBlockout } from '../src/external/models/VendorBlockout.js';
import { VendorReview } from '../src/external/models/VendorReview.js';
import { OtpVerification } from '../src/external/models/OtpVerification.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { AdminSession } from '../src/admin/models/AdminSession.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { signAdminAccessToken } from '../src/admin/utils/tokens.js';
import { recordVerifiedIdentity } from '../src/foundation/identity.service.js';
import { CUSTOMER_NOTICE, setConsent } from '../src/foundation/consent.service.js';
import { requestDeletion } from '../src/foundation/privacy.service.js';
import { CustomerNotification } from '../src/customer/models/index.js';
import { Experience, LoyaltyRule, LoyaltyAward, CampaignDelivery } from '../src/experience/models.js';
import { NotificationPreference } from '../src/notifications/preferences.models.js';
let app, mongo, phoneCounter = 0;
const qrEnabledByDefault = config.vendorQrEnabled;
before(() => { config.vendorQrEnabled = true; });
after(() => { config.vendorQrEnabled = qrEnabledByDefault; });
const id = () => new mongoose.Types.ObjectId(), key = () => crypto.randomUUID(), auth = token => ({ Authorization: `Bearer ${token}` });
before(async () => { mongo = await MongoMemoryServer.create(); await Promise.all([externalConn.openUri(mongo.getUri('experience')), adminConn.openUri(mongo.getUri('experience_admin'))]); app = createApp(); await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(m => m.init())); }, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo.stop(); });
async function token(user) { const session = await ExternalSession.create({ user: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) }); return signExternalAccessToken(user, session._id); }
async function customer() { const user = await ExternalUser.create({ fullName: 'Client', accountType: 'CUSTOMER', email: `${key()}@example.test`, phone: `+919888${String(++phoneCounter).padStart(6, '0')}` }); await recordVerifiedIdentity(user, 'PHONE', user.phone, 'MOBILE_OTP'); return { user, token: await token(user) }; }
async function fixture() {
  const owner = await ExternalUser.create({ fullName: 'Vendor', accountType: 'VENDOR', email: `${key()}@example.test` });
  const vendor = await VendorOrganization.create({ owner: owner._id, ownerIdentityKey: owner._id, businessName: 'Test Studio', category: 'Photography', location: 'Pune' }); owner.vendorOrganization = vendor._id; await owner.save();
  const c = await customer();
  const booking = await VendorBlockout.create({ vendor: vendor._id, date: '2026-10-01', recordType: 'EXTERNAL_COMMITMENT', external: { customerName: 'Client', customerPhone: c.user.phone }, externalBooking: { lifecycle: 'COMPLETED', acquisitionChannel: 'WHATSAPP', eventName: 'Private celebration', totalAmount: 1000 } });
  return { owner, vendor, customer: c.user, customerToken: c.token, booking, token: await token(owner) };
}
async function issue(f, extra = {}) { return (await request(app).post('/api/vendor/experiences').set(auth(f.token)).send({ source: 'VENDOR_PRIVATE', booking: f.booking._id, idempotencyKey: key(), ...extra }).expect(201)).body; }
async function access(f, issued) { const token = new URL(issued.url).pathname.split('/').at(-1); await OtpVerification.create({ phone: f.customer.phone, otp: '438721', expiresAt: new Date(Date.now() + 60000) }); const verified = await request(app).post(`/api/experience/${token}/verify`).set('X-Forwarded-For', `198.51.100.${phoneCounter}`).send({ phone: f.customer.phone, otp: '438721' }).expect(200); return { token, proof: verified.body.accessToken, headers: { 'X-Feedback-Access': verified.body.accessToken } }; }
const feedback = (extra = {}) => ({ name: 'Client name', rating: 1, criteria: { quality: 1, punctuality: 2, staff: 3, communication: 4 }, reviewText: 'The service did not meet my expectations.', eventConfirmed: true, ecosystem: false, marketing: false, channel: 'NONE', noticeVersion: CUSTOMER_NOTICE.version, revision: 0, idempotencyKey: key(), ...extra });
async function grant(customer, extra = {}) { return setConsent(customer, { purpose: 'ECOSYSTEM', channel: 'ALL', status: 'GRANTED', noticeVersion: CUSTOMER_NOTICE.version, revision: 0, idempotencyKey: key(), ...extra }); }
async function admin(permissions) { const user = await AdminUser.create({ fullName: 'Reviewer', email: `${key()}@example.test`, passwordHash: 'fixture', role: 'ADMIN', permissions }); const session = await AdminSession.create({ admin: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) }); return signAdminAccessToken(user, session._id); }

test('the release disables Experience QR issuance and access to previously issued QR links', async t => {
  const f = await fixture();
  const issued = await issue(f);
  const token = new URL(issued.url).pathname.split('/').at(-1);
  config.vendorQrEnabled = qrEnabledByDefault;
  t.after(() => { config.vendorQrEnabled = true; });
  assert.equal(config.vendorQrEnabled, false);
  await request(app).post('/api/vendor/experiences').set(auth(f.token))
    .send({ source: 'VENDOR_PRIVATE', booking: f.booking._id, idempotencyKey: key() }).expect(404);
  await request(app).get(`/api/experience/${token}`).expect(404);
  await request(app).post('/api/customer/experience/claim').set(auth(f.customerToken)).send({ token }).expect(404);
});

test('QR issuance is owner-bound, non-guessable, replay-safe and public metadata has no recipient or event details', async () => {
  const f = await fixture(), other = await fixture(), input = { idempotencyKey: key() }, qr = await issue(f, input), replay = await issue(f, input);
  assert.equal(qr.url, replay.url); assert.match(qr.qrDataUrl, /^data:image\/png;base64,/);
  await request(app).post('/api/vendor/experiences').set(auth(other.token)).send({ source: 'VENDOR_PRIVATE', booking: f.booking._id, idempotencyKey: key() }).expect(404);
  const publicData = await request(app).get(new URL(qr.url).pathname.replace('/experience/', '/api/experience/')).expect(200);
  for (const value of [f.customer.phone, 'Private celebration', String(f.booking._id)]) assert.equal(JSON.stringify(publicData.body).includes(value), false);
  assert.equal(publicData.body.accountRequired, false);
});
test('incomplete external work and unverified Core completion cannot issue a QR', async () => {
  const f = await fixture(); await VendorBlockout.updateOne({ _id: f.booking._id }, { $set: { 'externalBooking.lifecycle': 'CONFIRMED' } });
  await request(app).post('/api/vendor/experiences').set(auth(f.token)).send({ source: 'VENDOR_PRIVATE', booking: f.booking._id, idempotencyKey: key() }).expect(409);
  const core = await CoreBooking.create({ vendorId: f.vendor._id, customerId: f.customer._id, serviceName: 'Photos', eventDate: '2026-10-01', totalAmount: 1000, bookingStatus: 'CONFIRMED', executionStatus: 'COMPLETION_SUBMITTED' });
  await request(app).post('/api/vendor/experiences').set(auth(f.token)).send({ source: 'STARVNT', booking: core._id, idempotencyKey: key() }).expect(409);
  await CoreBooking.updateOne({ _id: core._id }, { $set: { executionStatus: 'COMPLETION_VERIFIED' } });
  assert.equal((await issue(f, { source: 'STARVNT', booking: core._id })).experience.source, 'STARVNT');
});
test('OTP must match the booking recipient and development master OTPs never authorize feedback', async () => {
  const f = await fixture(), qr = await issue(f), token = new URL(qr.url).pathname.split('/').at(-1);
  await request(app).post(`/api/experience/${token}/verify`).set('X-Forwarded-For', `198.51.100.${phoneCounter}`).send({ phone: '+919999999999', otp: '438721' }).expect(403);
  await request(app).post(`/api/experience/${token}/verify`).set('X-Forwarded-For', `198.51.100.${phoneCounter}`).send({ phone: f.customer.phone, otp: '123456' }).expect(401);
  await request(app).post(`/api/experience/${token}/feedback`).send(feedback()).expect(401);
});
test('guest review needs no account or marketing, publishes negative feedback, deduplicates and controls edits', async () => {
  const f = await fixture(), a = await access(f, await issue(f)), body = feedback();
  const first = await request(app).post(`/api/experience/${a.token}/feedback`).set(a.headers).send(body).expect(200);
  await request(app).post(`/api/experience/${a.token}/feedback`).set(a.headers).send(body).expect(200);
  assert.equal(await VendorReview.countDocuments({ booking: f.booking._id }), 1); assert.equal(first.body.review.status, 'PUBLISHED'); assert.equal(first.body.review.rating, 1);
  assert.equal((await VendorOrganization.findById(f.vendor._id)).rating.average, 1);
  const edit = feedback({ rating: 2, revision: 1 }); await request(app).post(`/api/experience/${a.token}/feedback`).set(a.headers).send(edit).expect(200);
  await request(app).post(`/api/experience/${a.token}/feedback`).set(a.headers).send(feedback({ revision: 1 })).expect(409);
  assert.equal((await VendorReview.findOne({ booking: f.booking._id })).reviewHistory.length, 2);
});
test('rotated, expired and revoked QR invitations invalidate existing feedback proofs without removing reviews', async () => {
  const f = await fixture(), qr = await issue(f), a = await access(f, qr);
  await request(app).post(`/api/experience/${a.token}/feedback`).set(a.headers).send(feedback()).expect(200);
  const newer = await issue(f); await request(app).get(`/api/experience/${a.token}`).expect(404);
  const t = new URL(newer.url).pathname.split('/').at(-1);
  await request(app).post(`/api/vendor/experiences/${newer.experience._id}/revoke`).set(auth(f.token)).send({ revision: newer.experience.revision, reason: 'Wrong delivery' }).expect(200);
  await request(app).get(`/api/experience/${t}`).expect(404); assert.equal(await VendorReview.countDocuments({ booking: f.booking._id }), 1);
  const expired = await issue(f); await Experience.updateOne({ _id: expired.experience._id }, { $set: { expiresAt: new Date(0) } }); await request(app).get(new URL(expired.url).pathname.replace('/experience/', '/api/experience/')).expect(404);
});
test('external contacts do not merge into accounts without verified explicit claim and current ecosystem consent', async () => {
  const f = await fixture(), other = await customer(), a = await access(f, await issue(f));
  await request(app).post(`/api/experience/${a.token}/feedback`).set(a.headers).send(feedback({ ecosystem: true })).expect(200);
  const body = { token: a.token, accessToken: a.proof };
  await request(app).post('/api/customer/experience/claim').set(auth(f.customerToken)).send(body).expect(403);
  await grant(f.customer._id); await grant(other.user._id);
  await request(app).post('/api/customer/experience/claim').set(auth(other.token)).send(body).expect(403);
  await request(app).post('/api/customer/experience/claim').set(auth(f.customerToken)).send(body).expect(200);
  const view = await request(app).get('/api/customer/relationships').set(auth(f.customerToken)).expect(200); assert.equal(view.body.externalBookings.length, 1);
  await request(app).post(`/api/experience/${a.token}/withdraw`).set(a.headers).send({}).expect(200);
  assert.equal((await request(app).get('/api/customer/relationships').set(auth(f.customerToken))).body.externalBookings.length, 0);
});
test('support and guest deletion are logged, optional use stops and vendor cannot hide a reported negative review', async () => {
  const f = await fixture(), a = await access(f, await issue(f)); const result = await request(app).post(`/api/experience/${a.token}/feedback`).set(a.headers).send(feedback({ ecosystem: true })).expect(200);
  const support = { message: 'Please help with the service.', idempotencyKey: key() };
  const one = await request(app).post(`/api/experience/${a.token}/support`).set(a.headers).send(support).expect(202); const two = await request(app).post(`/api/experience/${a.token}/support`).set(a.headers).send(support).expect(202); assert.equal(one.body.request._id, two.body.request._id);
  await request(app).post(`/api/vendor/reviews/${result.body.review._id}/report`).set(auth(f.token)).send({ reason: 'Please review' }).expect(202);
  assert.equal((await VendorReview.findById(result.body.review._id)).status, 'PUBLISHED');
  await request(app).post(`/api/experience/${a.token}/deletion`).set(a.headers).send({}).expect(202);
  const stored = await VendorReview.findById(result.body.review._id); assert.equal(stored.feedbackPermissions.ecosystem, false); assert.ok(stored.feedbackPermissions.deletionRequestedAt);
  await request(app).post(`/api/experience/${a.token}/feedback`).set(a.headers).send(feedback({ revision: stored.revision })).expect(409);
});
test('physical card needs explicit address consent, stays vendor-private, and can be cancelled before dispatch', async () => {
  const f = await fixture(), a = await access(f, await issue(f));
  const input = { address: 'Private delivery address', noticeVersion: CUSTOMER_NOTICE.version };
  await request(app).post(`/api/experience/${a.token}/delivery`).set(a.headers).send(input).expect(400);
  await request(app).post(`/api/experience/${a.token}/delivery`).set(a.headers).send({ ...input, addressConsent: true }).expect(202);
  const directory = await request(app).get('/api/vendor/customer-directory').set(auth(f.token)).expect(200);
  assert.equal(JSON.stringify(directory.body).includes(input.address), false);
  await request(app).post(`/api/experience/${a.token}/delivery/cancel`).set(a.headers).send({}).expect(200);
  assert.equal((await request(app).get(`/api/experience/${a.token}/support`).set(a.headers).expect(200)).body.delivery.status, 'CANCELLED');
});
test('moderation is permission-gated, reasoned and audited; vendor still has no rating-write route', async () => {
  const f = await fixture(), a = await access(f, await issue(f)); const review = (await request(app).post(`/api/experience/${a.token}/feedback`).set(a.headers).send(feedback()).expect(200)).body.review;
  const readOnly = await admin(['reviews.read']), moderator = await admin(['reviews.moderate']);
  await request(app).post(`/api/admin/experience/reviews/${review._id}/moderate`).set(auth(readOnly)).send({ status: 'HIDDEN', revision: review.revision, reason: 'Contains personal information' }).expect(403);
  await request(app).post(`/api/admin/experience/reviews/${review._id}/moderate`).set(auth(moderator)).send({ status: 'HIDDEN', revision: review.revision, reason: 'Contains personal information' }).expect(200);
  assert.equal((await VendorOrganization.findById(f.vendor._id)).rating.count, 0);
  await request(app).post('/api/vendor/reviews').set(auth(f.token)).send({ rating: 5 }).expect(403);
});
test('vendor directory isolates tenants and does not link private records by matching name or mobile', async () => {
  const f = await fixture(), other = await fixture();
  await VendorBlockout.create({ vendor: f.vendor._id, date: '2026-10-02', recordType: 'EXTERNAL_COMMITMENT', external: { customerName: 'Client', customerPhone: f.customer.phone }, externalBooking: { lifecycle: 'COMPLETED' } });
  const d = (await request(app).get('/api/vendor/customer-directory').set(auth(f.token)).expect(200)).body;
  assert.equal(d.customers.length, 2); assert.equal(d.customers.every(c => !c.customerId && !c.campaignEligible), true);
  assert.equal(JSON.stringify(d).includes(other.customer.phone), false); assert.equal(JSON.stringify(d).includes(f.customer.phone), false);
});
test('campaign delivery requires vendor-specific consent, deduplicates and enforces global frequency and withdrawal', async () => {
  const f = await fixture();
  await CoreBooking.create({ vendorId: f.vendor._id, customerId: f.customer._id, customerName: 'Client', serviceName: 'Photos', eventDate: '2026-10-01', totalAmount: 1000, bookingStatus: 'CONFIRMED' });
  const make = async () => (await request(app).post('/api/vendor/growth/campaigns').set(auth(f.token)).send({ title: 'Plan a celebration', body: 'Explore a new event with us.', idempotencyKey: key() }).expect(201)).body.campaign;
  let c = await make(); const publish = c => request(app).post(`/api/vendor/growth/campaigns/${c._id}/publish`).set(auth(f.token)).send({ revision: c.revision, idempotencyKey: key() });
  assert.equal((await publish(c).expect(200)).body.delivered, 0);
  await grant(f.customer._id, { vendorId: f.vendor._id, purpose: 'MARKETING', channel: 'IN_APP' });
  c = await make(); assert.equal((await publish(c).expect(200)).body.delivered, 1); assert.equal((await publish(c).expect(200)).body.delivered, 1);
  assert.equal(await CustomerNotification.countDocuments({ customer: f.customer._id, type: 'campaign' }), 1);
  const c2 = await make(); assert.equal((await publish(c2).expect(200)).body.skipped, 1);
  await grant(f.customer._id, { vendorId: f.vendor._id, purpose: 'MARKETING', channel: 'IN_APP', revision: 1, status: 'WITHDRAWN' });
  assert.equal((await publish(await make()).expect(200)).body.delivered, 0);
});
test('channel preferences and account deletion independently stop optional campaigns', async () => {
  const f = await fixture();
  await CoreBooking.create({ vendorId: f.vendor._id, customerId: f.customer._id, serviceName: 'Photos', eventDate: '2026-10-01', totalAmount: 1000 });
  await grant(f.customer._id, { vendorId: f.vendor._id, purpose: 'MARKETING', channel: 'IN_APP' });
  await NotificationPreference.create({ _id: `CUSTOMER:${f.customer._id}`, audience: 'CUSTOMER', channels: { IN_APP: false } });
  assert.equal((await request(app).get('/api/vendor/customer-directory').set(auth(f.token))).body.customers.some(c => c.campaignEligible), false);
  await requestDeletion(f.customer._id);
  assert.equal((await request(app).get('/api/vendor/customer-directory').set(auth(f.token))).body.customers.some(c => c.campaignEligible), false);
});
test('personalization is independent, optional interests validate revisions, and suggestions use only own completed records', async () => {
  const f = await fixture(), payload = { interests: [{ eventType: 'Birthday', city: 'Pune', month: '2027-02' }], preferredChannel: 'IN_APP', revision: 0, idempotencyKey: key() };
  await request(app).put('/api/customer/interests').set(auth(f.customerToken)).send(payload).expect(403);
  await grant(f.customer._id, { purpose: 'PERSONALIZATION' });
  await request(app).put('/api/customer/interests').set(auth(f.customerToken)).send(payload).expect(200);
  await request(app).put('/api/customer/interests').set(auth(f.customerToken)).send(payload).expect(200);
  await request(app).put('/api/customer/interests').set(auth(f.customerToken)).send({ ...payload, idempotencyKey: key() }).expect(409);
  await grant(f.customer._id, { purpose: 'PERSONALIZATION', revision: 1, status: 'WITHDRAWN' });
  const growth = await request(app).get('/api/customer/growth').set(auth(f.customerToken)).expect(200); assert.equal(growth.body.interests, null); assert.deepEqual(growth.body.suggestions, []);
  await request(app).delete('/api/customer/interests').set(auth(f.customerToken)).expect(200);
});
test('referrals are immutable, reject self-attribution and do not self-award a reward', async () => {
  const a = await customer(), b = await customer(); await grant(a.user._id); await grant(b.user._id);
  const code = (await request(app).post('/api/customer/referrals/code').set(auth(a.token)).send({}).expect(200)).body.code;
  await request(app).post('/api/customer/referrals/attribute').set(auth(a.token)).send({ code }).expect(400);
  await request(app).post('/api/customer/referrals/attribute').set(auth(b.token)).send({ code }).expect(200);
  await request(app).post('/api/customer/referrals/attribute').set(auth(b.token)).send({ code }).expect(200);
  assert.equal(await LoyaltyAward.countDocuments({ customer: b.user._id }), 0);
});
test('loyalty uses versioned rules, verified Core completions only, once per booking, with reversal', async () => {
  const f = await fixture(); await grant(f.customer._id);
  await LoyaltyRule.updateMany({}, { $set: { active: false } }); await LoyaltyRule.create({ version: key(), pointsPerCompletion: 20, active: true });
  const core = await CoreBooking.create({ vendorId: f.vendor._id, customerId: f.customer._id, serviceName: 'Photos', eventDate: '2026-10-01', totalAmount: 1000, bookingStatus: 'CONFIRMED', executionStatus: 'COMPLETION_VERIFIED', paymentStatus: 'PAYMENT_VERIFIED' });
  const reconcile = () => request(app).post('/api/customer/loyalty/reconcile').set(auth(f.customerToken)).send({});
  assert.equal((await reconcile().expect(200)).body.points, 20); assert.equal((await reconcile().expect(200)).body.points, 20);
  assert.equal(await LoyaltyAward.countDocuments({ booking: core._id }), 1);
  await CoreBooking.updateOne({ _id: core._id }, { $set: { bookingStatus: 'CANCELLED' } }); assert.equal((await reconcile().expect(200)).body.points, 0);
});
