import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorBlockout } from '../src/external/models/VendorBlockout.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { AdminSession } from '../src/admin/models/AdminSession.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { AdminAuditLog } from '../src/admin/models/AdminAuditLog.js';
import { recordAudit } from '../src/admin/utils/audit.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { signAdminAccessToken } from '../src/admin/utils/tokens.js';
import { Booking, CustomerEvent, EventRequirement, Reservation, Payment, PaymentWebhookEvent, AuraSession, AuraMessage } from '../src/customer/models/index.js';
import { syncBookingTruth, reconcileBookingBatch, cancelOwnedBooking } from '../src/customer/services/bookingTruth.service.js';
import { bookingsView, verifyPayment, confirmBookingFor } from '../src/customer/services/commerce.service.js';
import { customerFinancialTruth } from '../src/common/financialTruth.service.js';
import { setConsent, CUSTOMER_NOTICE, communicationAllowed } from '../src/foundation/consent.service.js';
import { recordVerifiedIdentity, findPhoneIdentity, verifiedContact } from '../src/foundation/identity.service.js';
import { IdentityClaim, CustomerConsent, PrivacyRequest, IdentityLink } from '../src/foundation/models.js';
import { requestDeletion, processDeletion } from '../src/foundation/privacy.service.js';
import { recordWebhookEvent, finishWebhookEvent } from '../src/customer/repositories/commerce.repo.js';
import { saveCommitment, transitionExternalBooking, recordExternalReceipt, expireExternalHolds } from '../src/external/services/commitments.service.js';
import { checkTrueAvailability } from '../src/external/services/availability.service.js';
import { NotificationPreference } from '../src/notifications/preferences.models.js';
import { notifyCustomer } from '../src/notifications/notification.service.js';
import { PushSubscription, PushJob } from '../src/notifications/push.models.js';
import { deliverOne } from '../src/notifications/push.service.js';
import { foundationMigration } from '../src/foundation/migration.js';
import { VendorService } from '../src/external/models/VendorService.js';
import { VendorCapability } from '../src/external/models/VendorCapability.js';
import { VendorFinancialProfile } from '../src/external/models/VendorFinancialProfile.js';
import { OperatingLocation } from '../src/external/models/OperatingLocation.js';
import { ServiceCoverage } from '../src/external/models/ServiceCoverage.js';
import { PortfolioItem } from '../src/external/models/PortfolioItem.js';
import { evaluateVendorActivation } from '../src/external/services/vendorActivation.service.js';
import { verifyPaymentFromCore, startService } from '../src/admin/services/executionSettlement.service.js';
import { OtpVerification } from '../src/external/models/OtpVerification.js';
import { verifyMobileOtp } from '../src/external/services/otp.service.js';

let mongo, app;
const id = () => new mongoose.Types.ObjectId();
const key = () => crypto.randomUUID();
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('foundation_external')), adminConn.openUri(mongo.getUri('foundation_admin'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(m => m.init()));
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); if (mongo) await mongo.stop(); });
async function customer(extra = {}) { return ExternalUser.create({ fullName: 'Test Customer', email: `${key()}@example.test`, accountType: 'CUSTOMER', ...extra }); }
async function token(user) {
  const session = await ExternalSession.create({ user: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  return signExternalAccessToken(user, session._id);
}
async function admin(permissions = []) {
  const user = await AdminUser.create({ fullName: 'Test Admin', email: `${key()}@example.test`, passwordHash: 'fixture', role: 'ADMIN', permissions });
  const session = await AdminSession.create({ admin: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  return { user, token: signAdminAccessToken(user, session._id) };
}
const auth = value => ({ Authorization: `Bearer ${value}` });
async function bookingFixture() {
  const user = await customer(); const vendor = id(), service = id();
  const event = await CustomerEvent.create({ customer: user._id, eventDate: '2027-08-01', status: 'planning', title: 'Test event' });
  const requirement = await EventRequirement.create({ event: event._id, category: 'photography' });
  const reservation = await Reservation.create({ customer: user._id, event: event._id, quote: id(), quoteItem: id(), requirement: requirement._id, category: 'photography', optionId: `vs_${service}`, vendorName: 'Vendor', packageName: 'Photo package', amount: 300, packageTotal: 1000, expiresAt: new Date(Date.now() + 3600000) });
  const payment = await Payment.create({ customer: user._id, event: event._id, reservation: reservation._id, amount: 300, status: 'verified' });
  const snapshot = { vendorId: vendor, vendorService: service, serviceName: 'Photo package', vendorName: 'Vendor', customerName: user.fullName, eventDate: event.eventDate, totalAmount: 1000, paymentStatus: 'PAYMENT_VERIFIED', executionStatus: 'SERVICE_SCHEDULED', settlementStatus: 'NOT_ELIGIBLE', paymentSummary: { paidAmount: 300, balanceAmount: 700 } };
  const booking = await Booking.create({ customer: user._id, event: event._id, requirement: requirement._id, reservation: reservation._id, payment: payment._id, category: 'photography', optionId: reservation.optionId, vendorName: 'Vendor', packageName: 'Photo package', amount: 1000, paidAmount: 300, status: 'pending', vendor, coreSync: { status: 'PENDING', snapshot } });
  return { user, vendor, event, requirement, reservation, payment, booking };
}
const consentInput = (extra = {}) => ({ purpose: 'MARKETING', channel: 'PUSH', status: 'GRANTED', noticeVersion: CUSTOMER_NOTICE.version, revision: 0, idempotencyKey: key(), ...extra });

test('Core outage leaves durable intent; retry creates exactly one contract and financial totals deduplicate canonical links', async t => {
  const f = await bookingFixture();
  t.mock.method(CoreBooking, 'findOneAndUpdate', () => { throw new Error('injected Core outage'); });
  await assert.rejects(syncBookingTruth(f.booking._id), /injected Core outage/);
  assert.equal((await Booking.findById(f.booking._id)).status, 'pending');
  assert.equal((await Booking.findById(f.booking._id)).coreSync.status, 'PENDING');
  t.mock.restoreAll();
  const results = await reconcileBookingBatch(); assert.equal(results.find(r => String(r.id) === String(f.booking._id)).ok, true);
  await syncBookingTruth(f.booking._id); await verifyPayment(f.payment._id, { actorType: 'webhook', actorId: 'test' });
  assert.equal(await CoreBooking.countDocuments({ customerBookingId: f.booking._id }), 1);
  const truth = await customerFinancialTruth(f.user._id, f.event._id);
  assert.equal(truth.metrics.committedAmount, 1000); assert.equal(truth.metrics.paidAmount, 300); assert.equal(truth.counts.bookings, 1);
  const view = await bookingsView(f.user._id, f.event._id); assert.equal(view.bookings.length, 1);
});

test('verified payment retries resume missing booking and reject unverified confirmation', async () => {
  const f = await bookingFixture();
  await assert.rejects(confirmBookingFor({ ...f.payment.toObject(), status: 'processing' }), /verified payments/);
  await verifyPayment(f.payment._id, { actorType: 'webhook', actorId: 'test' });
  assert.equal((await Booking.findById(f.booking._id)).coreSync.status, 'SYNCED');
});

test('cancellation retains contracts, payment and audit, is owner scoped, repeatable, and never renders cancelled Core as confirmed', async () => {
  const f = await bookingFixture(); await syncBookingTruth(f.booking._id);
  await assert.rejects(cancelOwnedBooking(id(), f.booking._id), e => e.status === 404 || e.statusCode === 404);
  await cancelOwnedBooking(f.user._id, f.booking._id, { reason: 'Changed plans' });
  await cancelOwnedBooking(f.user._id, f.booking._id);
  const b = await Booking.findById(f.booking._id), core = await CoreBooking.findOne({ customerBookingId: b._id });
  assert.equal(b.status, 'cancelled'); assert.equal(core.bookingStatus, 'CANCELLED');
  assert.equal(b.history.length, 1); assert.equal(await Payment.countDocuments({ _id: f.payment._id }), 1);
  const view = await bookingsView(f.user._id, f.event._id); assert.equal(view.bookings[0].status, 'cancelled');
});

test('Core execution and settlement cannot be reset by payment reconciliation', async () => {
  const f = await bookingFixture(); await syncBookingTruth(f.booking._id);
  await CoreBooking.updateOne({ customerBookingId: f.booking._id }, { $set: { executionStatus: 'COMPLETION_VERIFIED', settlementStatus: 'SETTLEMENT_ELIGIBLE' } });
  await syncBookingTruth(f.booking._id);
  const core = await CoreBooking.findOne({ customerBookingId: f.booking._id });
  assert.equal(core.executionStatus, 'COMPLETION_VERIFIED'); assert.equal(core.settlementStatus, 'SETTLEMENT_ELIGIBLE');
  await assert.rejects(cancelOwnedBooking(f.user._id, f.booking._id), e => e.code === 'CANCELLATION_REQUIRES_REVIEW');
});

test('failed canonical Core contracts cannot be displayed as confirmed by reconciliation', async () => {
  const f = await bookingFixture(); await syncBookingTruth(f.booking._id);
  await CoreBooking.updateOne({ customerBookingId: f.booking._id }, { $set: { bookingStatus: 'FAILED' } });
  const result = await syncBookingTruth(f.booking._id); assert.equal(result.status, 'pending');
});

test('cancellation survives a failed projection write after the canonical Core transition', async t => {
  const f = await bookingFixture(); await syncBookingTruth(f.booking._id);
  t.mock.method(Booking, 'updateOne', () => { throw new Error('projection unavailable'); });
  await assert.rejects(cancelOwnedBooking(f.user._id, f.booking._id), /projection unavailable/);
  const core = await CoreBooking.findOne({ customerBookingId: f.booking._id });
  assert.equal(core.bookingStatus, 'CANCELLED'); assert.equal(core.projectionSyncPending, true);
  t.mock.restoreAll();
  await reconcileBookingBatch();
  assert.equal((await Booking.findById(f.booking._id)).status, 'cancelled');
  assert.equal((await CoreBooking.findById(core._id)).projectionSyncPending, false);
});

test('receipt recomputation never adds a repeated secondary payment twice', async () => {
  const f = await bookingFixture(); await syncBookingTruth(f.booking._id);
  const second = await Payment.create({ event: f.event._id, customer: f.user._id, reservation: f.reservation._id, amount: 200, status: 'verified' });
  await verifyPayment(second._id, { actorType: 'webhook', actorId: 'test' });
  await verifyPayment(second._id, { actorType: 'webhook', actorId: 'test' });
  assert.equal((await Booking.findById(f.booking._id)).paidAmount, 500);
});

test('webhook failures can be retried, active delivery is busy, completed deliveries deduplicate and changed content conflicts', async () => {
  const eventId = key(), body = { test: true };
  const first = await recordWebhookEvent('test', eventId, 'captured', body);
  await assert.rejects(recordWebhookEvent('test', eventId, 'captured', body), e => e.code === 'WEBHOOK_BUSY');
  await finishWebhookEvent(first, new Error('interrupted'));
  const retry = await recordWebhookEvent('test', eventId, 'captured', body); assert.ok(retry);
  await finishWebhookEvent(retry);
  assert.equal(await recordWebhookEvent('test', eventId, 'captured', body), false);
  await assert.rejects(recordWebhookEvent('test', eventId, 'captured', { test: false }), e => e.code === 'WEBHOOK_CONFLICT');
});

test('consent is optional by default, server-attributed, versioned, idempotent, and stale decisions cannot overwrite withdrawal', async () => {
  const user = await customer(); assert.equal(await communicationAllowed(user._id, { purpose: 'MARKETING' }), false);
  const input = consentInput(); const row = await setConsent(user._id, { ...input, actor: 'spoofed' });
  assert.equal(row.history[0].actor, String(user._id)); assert.equal((await setConsent(user._id, input)).revision, 1);
  assert.equal(await communicationAllowed(user._id, { purpose: 'MARKETING' }), true);
  await setConsent(user._id, consentInput({ status: 'WITHDRAWN', revision: 1 }));
  await assert.rejects(setConsent(user._id, consentInput()), e => e.code === 'STALE_REVISION');
  assert.equal(await communicationAllowed(user._id, { purpose: 'MARKETING' }), false);
  await assert.rejects(setConsent(user._id, consentInput({ noticeVersion: 'old' })), e => e.code === 'NOTICE_CHANGED');
});

test('concurrent first consent decisions have one winner and per-channel withdrawal is independent', async () => {
  const user = await customer();
  const results = await Promise.allSettled([setConsent(user._id, consentInput()), setConsent(user._id, consentInput({ status: 'WITHDRAWN' }))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  await setConsent(user._id, consentInput({ channel: 'EMAIL' }));
  await NotificationPreference.create({ _id: `CUSTOMER:${user._id}`, channels: { EMAIL: true, PUSH: false } });
  assert.equal(await communicationAllowed(user._id, { purpose: 'MARKETING', channel: 'EMAIL' }), true);
  assert.equal(await communicationAllowed(user._id, { purpose: 'MARKETING', channel: 'PUSH' }), false);
});

test('unverified and duplicated identities are not merged; verified claims do not contain phone plaintext', async () => {
  const phone = '+919123450001', user = await customer({ phone });
  assert.equal(verifiedContact(user, 'PHONE'), false);
  await assert.rejects(setConsent(user._id, consentInput({ purpose: 'ECOSYSTEM', channel: 'ALL' })), e => e.code === 'VERIFIED_MOBILE_REQUIRED');
  await recordVerifiedIdentity(user, 'PHONE', phone, 'MOBILE_OTP');
  assert.equal(verifiedContact(user, 'PHONE'), true);
  const claim = await IdentityClaim.findOne({ owner: user._id }).lean(); assert.ok(!JSON.stringify(claim).includes(phone));
  // Simulate pre-migration legacy duplicates without bypassing production auth.
  await ExternalUser.collection.insertOne({ fullName: 'Legacy', email: `${key()}@test.invalid`, phone, accountType: 'CUSTOMER', status: 'ACTIVE' });
  await assert.rejects(findPhoneIdentity(phone), e => e.code === 'IDENTITY_REVIEW_REQUIRED');
  await ExternalUser.collection.updateOne({ email: { $regex: '@test.invalid$' }, phone }, { $set: { phone: '+91 9123450001' } });
  await assert.rejects(findPhoneIdentity(phone), e => e.code === 'IDENTITY_REVIEW_REQUIRED');
});

test('new concurrent duplicate phone and vendor-owner identities are constrained at the database', async () => {
  const phone = '+919123450002';
  const results = await Promise.allSettled([customer({ phone }), customer({ phone })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const owner = id();
  const vendors = await Promise.allSettled([VendorOrganization.create({ owner, ownerIdentityKey: owner, businessName: 'A' }), VendorOrganization.create({ owner, ownerIdentityKey: owner, businessName: 'B' })]);
  assert.equal(vendors.filter(r => r.status === 'fulfilled').length, 1);
});

test('foundation endpoints deny missing/wrong roles, limit admin powers, and ignore a supplied customer ID', async () => {
  const a = await customer(), b = await customer(), access = await token(a), restricted = await admin(['customers.read']);
  await request(app).get('/api/customer/privacy/consents').expect(401);
  const saved = await request(app).put('/api/customer/privacy/consents').set(auth(access)).send({ ...consentInput(), customer: b._id }).expect(200);
  assert.equal(saved.body.consent.customer, String(a._id));
  await request(app).get('/api/admin/foundation/privacy/requests').set(auth(restricted.token)).expect(403);
  await request(app).get('/api/admin/foundation/customers/export?reason=Support').set(auth(restricted.token)).expect(403);
  const visible = await request(app).get('/api/admin/external-users/customers').set(auth(restricted.token)).expect(200);
  assert.equal(visible.body.customers.some(c => c.email || c.phone), false);
  await request(app).patch('/api/customer/profile').set(auth(access)).send({ phone: '+919123450099' }).expect(400);
});

test('session ownership mismatch is rejected in both identity domains', async () => {
  const a = await customer(), b = await customer();
  const session = await ExternalSession.create({ user: b._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  await request(app).get('/api/customer/me').set(auth(signExternalAccessToken(a, session._id))).expect(401);
  const x = await admin([]), y = await admin([]); const other = await AdminSession.findOne({ admin: y.user._id });
  await request(app).get('/api/admin/foundation/privacy/requests').set(auth(signAdminAccessToken(x.user, other._id))).expect(401);
});

test('production internal actions reject shared keys; authenticated admin permissions and actor determine authority', async () => {
  const prior = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try { await request(app).post(`/api/internal/ops/payments/${id()}/verify`).set('x-internal-key', 'anything').send({ operator: 'spoof' }).expect(401); }
  finally { if (prior === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prior; }
  const restricted = await admin(['operations.manage']);
  await request(app).post(`/api/internal/ops/payments/${id()}/verify`).set(auth(restricted.token)).send({ operator: 'spoof' }).expect(403);
});

test('critical audit failures propagate instead of reporting success', async t => {
  t.mock.method(AdminAuditLog, 'create', () => { throw new Error('audit unavailable'); });
  await assert.rejects(recordAudit({ action: 'TEST' }), /audit unavailable/);
});

test('deletion stops optional use immediately, requires a retention decision, respects holds and purges AI/session state while retaining contracts', async () => {
  const user = await customer(); await setConsent(user._id, consentInput());
  const row = await requestDeletion(user._id);
  assert.equal(await communicationAllowed(user._id, { purpose: 'MARKETING' }), false);
  await assert.rejects(processDeletion(row._id, id(), {}), e => e.code === 'RETENTION_DECISION_REQUIRED');
  await PrivacyRequest.updateOne({ _id: row._id }, { $set: { legalHold: true } });
  await assert.rejects(processDeletion(row._id, id(), {}), e => e.code === 'LEGAL_HOLD');
  await PrivacyRequest.updateOne({ _id: row._id }, { $set: { legalHold: false } });
  await token(user); await AuraSession.create({ _id: 'privacy-session', customer: user._id }); await AuraMessage.create({ session: 'privacy-session', role: 'user', content: 'private' });
  await processDeletion(row._id, id(), { retentionReason: 'Business record review', retainedUntil: new Date(Date.now() + 86400000).toISOString() });
  const deleted = await ExternalUser.findById(user._id); assert.equal(deleted.status, 'DISABLED'); assert.equal(deleted.fullName, 'Deleted customer');
  assert.equal(await AuraMessage.countDocuments({ session: 'privacy-session' }), 0);
  assert.equal(await ExternalSession.countDocuments({ user: user._id, revokedAt: null }), 0);
  assert.equal((await PrivacyRequest.findById(row._id)).status, 'COMPLETED');
});

test('deletion cannot anonymize accounts with active booking obligations', async () => {
  const f = await bookingFixture(); const row = await requestDeletion(f.user._id);
  await assert.rejects(processDeletion(row._id, id(), { retentionReason: 'Test', retainedUntil: new Date(Date.now() + 86400000).toISOString() }), e => e.code === 'ACTIVE_BOOKING_REVIEW');
});

test('external bookings retain immutable source, isolated receipts and audited lifecycle with expiring holds', async () => {
  const vendor = id(), actor = { id: id(), role: 'VENDOR' };
  const row = await saveCommitment(vendor, { date: '2027-10-01', recordType: 'EXTERNAL_COMMITMENT', idempotencyKey: key(), externalBooking: { acquisitionChannel: 'WHATSAPP', totalAmount: 1000, lifecycle: 'ON_HOLD', holdExpiresAt: new Date(Date.now() + 10000).toISOString() } }, actor);
  const receipt = { amount: 200, idempotencyKey: key(), method: 'UPI', receivedAt: new Date(Date.now() - 1000).toISOString(), reference: 'external-only' };
  await recordExternalReceipt(vendor, row._id, actor, receipt); await recordExternalReceipt(vendor, row._id, actor, receipt);
  assert.equal((await VendorBlockout.findById(row._id)).externalBooking.receipts.length, 1);
  assert.equal(await CoreBooking.countDocuments({ vendorId: vendor }), 0);
  await assert.rejects(recordExternalReceipt(id(), row._id, actor, receipt), e => e.statusCode === 404);
  await assert.rejects(recordExternalReceipt(vendor, row._id, actor, { ...receipt, amount: 300 }), e => e.code === 'IDEMPOTENCY_CONFLICT');
  await VendorBlockout.updateOne({ _id: row._id }, { $set: { 'externalBooking.holdExpiresAt': new Date(Date.now() - 1) } });
  assert.equal((await checkTrueAvailability({ vendorId: vendor, date: '2027-10-01', allDay: true })).feasible, true);
  await expireExternalHolds();
  const expired = await VendorBlockout.findById(row._id);
  assert.equal(expired.externalBooking.lifecycle, 'ENQUIRY'); assert.equal(expired.history.at(-1).action, 'TENTATIVE_HOLD_EXPIRED');
  await transitionExternalBooking(vendor, row._id, actor, { lifecycle: 'CONFIRMED', reason: 'Customer confirmed', idempotencyKey: key() });
  assert.equal((await checkTrueAvailability({ vendorId: vendor, date: '2027-10-01', allDay: true })).feasible, false);
});

test('marketing is suppressed at creation and queued push is cancelled after consent withdrawal', async () => {
  const user = await customer();
  const skipped = await notifyCustomer({ customerId: user._id, type: 'campaign', title: 'Optional marketing' }); assert.equal(skipped.skipped, true);
  await setConsent(user._id, consentInput());
  const binding = await PushSubscription.create({ installationId: key(), domain: 'external', ownerId: user._id, sessionId: id(), audienceId: user._id, surface: 'CUSTOMER', token: 'ExpoPushToken[testconsent]', bindingId: key(), boundAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
  const job = await PushJob.create({ subscription: binding._id, bindingId: binding.bindingId, sourceId: key(), type: 'campaign', purpose: 'MARKETING', lease: key(), expiresAt: new Date(Date.now() + 3600000) });
  await setConsent(user._id, consentInput({ status: 'WITHDRAWN', revision: 1 }));
  let sent = false; const result = await deliverOne(job.toObject(), { identity: async () => user, request: async () => { sent = true; return []; } });
  assert.equal(sent, false); assert.equal(result.lastError, 'CONSENT_WITHDRAWN');
});

test('real catalogue booking without a vendor quote creates an authoritative linked Core contract', async () => {
  const f = await bookingFixture();
  await Booking.deleteOne({ _id: f.booking._id });
  const vendorOwner = await customer({ accountType: 'VENDOR' });
  const vendor = await VendorOrganization.create({ _id: f.vendor, owner: vendorOwner._id, businessName: 'Ready photography', category: 'Photography', location: 'Pune', isProfileCompleted: true, isCommerciallyActive: true, activationReview: { status: 'APPROVED' } });
  const serviceId = new mongoose.Types.ObjectId(f.reservation.optionId.replace('vs_', ''));
  await VendorService.create({ _id: serviceId, vendor: vendor._id, name: 'Photography', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 1000 } });
  await VendorCapability.create({ vendor: vendor._id, vendorService: serviceId, teamSize: 2, simultaneousEventLimit: 1 });
  await VendorFinancialProfile.create({ vendor: vendor._id, pan: { verificationStatus: 'VERIFIED' }, bankAccount: { verificationStatus: 'VERIFIED' } });
  await OperatingLocation.create({ vendor: vendor._id, label: 'Studio', city: 'Pune', coordinates: { lat: 18.52, lng: 73.85 } });
  await ServiceCoverage.create({ vendor: vendor._id, vendorService: serviceId, coverageType: 'CITY', city: 'Pune' });
  await PortfolioItem.create({ vendor: vendor._id, mediaType: 'IMAGE', url: 'https://example.test/photo.jpg' });
  assert.equal((await evaluateVendorActivation(vendor._id)).matchingEligible, true);
  const booking = await confirmBookingFor(f.payment.toObject());
  assert.equal(booking.status, 'confirmed'); assert.equal(booking.coreSync.status, 'SYNCED');
  const core = await CoreBooking.findById(booking.coreBooking); assert.ok(core); assert.equal(core.reservationId.toString(), f.reservation._id.toString());
});

test('a pending Core sync continues reserving capacity after the original hold has expired', async () => {
  const f = await bookingFixture();
  await VendorService.create({ _id: new mongoose.Types.ObjectId(f.reservation.optionId.slice(3)), vendor: f.vendor, name: 'Photography', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 1000 } });
  await Reservation.updateOne({ _id: f.reservation._id }, { $set: { status: 'expired', expiresAt: new Date(0) } });
  const available = await checkTrueAvailability({ vendorId: f.vendor, date: f.event.eventDate, allDay: true });
  assert.equal(available.feasible, false);
});

test('linking requires proof of both verified accounts and both consents, remains reviewable, and transfers no ownership', async () => {
  const a = await customer({ phone: '+919123450010' }), b = await customer({ phone: '+919123450011' });
  await recordVerifiedIdentity(a, 'PHONE', a.phone, 'MOBILE_OTP'); await recordVerifiedIdentity(b, 'PHONE', b.phone, 'MOBILE_OTP');
  const aToken = await token(a), bToken = await token(b), reviewer = await admin(['identity.link']);
  await request(app).post('/api/customer/identity/link-requests').set(auth(aToken)).send({ otherAccessToken: bToken }).expect(403);
  await setConsent(a._id, consentInput({ purpose: 'ECOSYSTEM', channel: 'ALL' }));
  await setConsent(b._id, consentInput({ purpose: 'ECOSYSTEM', channel: 'ALL' }));
  const created = await request(app).post('/api/customer/identity/link-requests').set(auth(aToken)).send({ otherAccessToken: bToken }).expect(202);
  const linked = await request(app).post(`/api/admin/foundation/identity/link-requests/${created.body.request._id}/decision`).set(auth(reviewer.token)).send({ status: 'LINKED', reason: 'Both account owners proved access' }).expect(200);
  assert.equal(linked.body.request.status, 'LINKED');
  assert.equal(await ExternalUser.countDocuments({ _id: { $in: [a._id, b._id] } }), 2);
  await request(app).post(`/api/customer/identity/link-requests/${created.body.request._id}/revoke`).set(auth(bToken)).expect(200);
  assert.equal((await IdentityLink.findById(created.body.request._id)).status, 'REVOKED');
});

test('internal manual verification records authenticated admin identity rather than the supplied operator', async () => {
  const f = await bookingFixture(), finance = await admin(['payments.approve']);
  await Payment.updateOne({ _id: f.payment._id }, { $set: { status: 'processing' } });
  await request(app).post(`/api/internal/ops/payments/${f.payment._id}/verify`).set(auth(finance.token)).send({ operator: 'spoofed' }).expect(200);
  assert.equal((await Payment.findById(f.payment._id)).verifiedBy, `ops:${finance.user._id}`);
});

test('a real OTP challenge is consumed once under concurrency and development proof cannot authorize ecosystem linking', async () => {
  const user = await customer({ phone: '+919123450030' });
  await OtpVerification.create({ phone: user.phone, otp: '748265', expiresAt: new Date(Date.now() + 60000) });
  const attempts = await Promise.all([verifyMobileOtp(user.phone, '748265'), verifyMobileOtp(user.phone, '748265')]);
  assert.equal(attempts.filter(r => r.valid).length, 1);
  await recordVerifiedIdentity(user, 'PHONE', user.phone, 'DEVELOPMENT_OTP');
  assert.equal(verifiedContact(user, 'PHONE'), false);
  await assert.rejects(setConsent(user._id, consentInput({ purpose: 'ECOSYSTEM', channel: 'ALL' })), e => e.code === 'VERIFIED_MOBILE_REQUIRED');
});

test('Core payment verification cannot borrow another customer or another reservation receipt', async () => {
  const f = await bookingFixture(); await syncBookingTruth(f.booking._id);
  const ref = `verified-${key()}`;
  await Payment.updateOne({ _id: f.payment._id }, { $set: { providerRef: ref } });
  const foreign = await CoreBooking.create({ customerId: id(), vendorId: id(), serviceName: 'Other booking', eventDate: '2027-08-01', totalAmount: 1000 });
  await assert.rejects(verifyPaymentFromCore(foreign._id, { paymentId: ref }), e => e.code === 'PAYMENT_NOT_VERIFIED');
  const wrong = await CoreBooking.create({ customerId: f.user._id, vendorId: id(), serviceName: 'Different reservation', eventDate: '2027-08-01', totalAmount: 1000, reservationId: id() });
  await assert.rejects(verifyPaymentFromCore(wrong._id, { paymentId: ref }), e => e.code === 'PAYMENT_CONTEXT_MISMATCH');
});

test('started Core execution prevents self-service cancellation and cannot start a cancelled contract', async () => {
  const f = await bookingFixture(); await syncBookingTruth(f.booking._id);
  const core = await CoreBooking.findOne({ customerBookingId: f.booking._id });
  await startService(core._id, f.vendor);
  await assert.rejects(cancelOwnedBooking(f.user._id, f.booking._id), e => e.code === 'CANCELLATION_REQUIRES_REVIEW');
  const g = await bookingFixture(); await syncBookingTruth(g.booking._id); await cancelOwnedBooking(g.user._id, g.booking._id);
  await assert.rejects(startService(g.booking._id, g.vendor), e => e.code === 'BOOKING_NOT_EXECUTABLE');
});

test('migration preflight is read-only and ambiguous legacy links block apply; safe additive backfill is repeatable', async () => {
  // This suite uses only its two disposable in-memory databases.
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(m => m.deleteMany({})));
  const f = await bookingFixture();
  const first = await foundationMigration();
  assert.equal(first.status, 'REVIEW_REQUIRED'); assert.equal(first.applied, false);
  assert.equal((await Booking.findById(f.booking._id)).coreBooking, null);
  await syncBookingTruth(f.booking._id);
  await ExternalUser.collection.updateOne({ _id: f.user._id }, { $set: { phone: '+919123450012' }, $unset: { phoneIdentityKey: 1 } });
  const ready = await foundationMigration(); assert.equal(ready.status, 'READY');
  assert.equal((await ExternalUser.findById(f.user._id)).phoneIdentityKey, undefined);
  const applied = await foundationMigration({ apply: true }); assert.equal(applied.applied, true);
  assert.equal((await ExternalUser.findById(f.user._id)).phoneIdentityKey, '+919123450012');
  assert.equal((await foundationMigration({ apply: true })).applied, true);
  assert.equal(await IdentityClaim.countDocuments(), 0); assert.equal(await CustomerConsent.countDocuments(), 0);
});
