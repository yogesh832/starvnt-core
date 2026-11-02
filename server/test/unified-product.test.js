import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorService } from '../src/external/models/VendorService.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { VendorBlockout } from '../src/external/models/VendorBlockout.js';
import { Notification } from '../src/external/models/Notification.js';
import { VendorMessageThread } from '../src/external/models/VendorMessageThread.js';
import { VendorReview } from '../src/external/models/VendorReview.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { AdminSession } from '../src/admin/models/AdminSession.js';
import { signAdminAccessToken } from '../src/admin/utils/tokens.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { CustomerEvent, CustomerNotification } from '../src/customer/models/index.js';
import { saveCommitment } from '../src/external/services/commitments.service.js';
import { checkTrueAvailability, evaluateSchedule } from '../src/external/services/availability.service.js';
import { evaluateVendorActivation } from '../src/external/services/vendorActivation.service.js';
import { normaliseCommitment } from '../src/common/scheduleRules.js';
import { activationDecision } from '../src/common/activationPolicy.js';
import { notifyCustomer } from '../src/notifications/notification.service.js';
import { notificationDelivery, validateNotificationPolicy } from '../src/notifications/policy.js';
import { NotificationPreference, CustomerReminder } from '../src/notifications/preferences.models.js';
import { runReminderBatch } from '../src/notifications/reminders.worker.js';
import { PushJob, PushSubscription } from '../src/notifications/push.models.js';
import { deliverOne } from '../src/notifications/push.service.js';
import { VENDOR_SUPPORT } from '../../shared/vendorSupport.js';
import { VendorCapability } from '../src/external/models/VendorCapability.js';
import { VendorFinancialProfile } from '../src/external/models/VendorFinancialProfile.js';
import { OperatingLocation } from '../src/external/models/OperatingLocation.js';
import { ServiceCoverage } from '../src/external/models/ServiceCoverage.js';
import { PortfolioItem } from '../src/external/models/PortfolioItem.js';
import { VendorResource } from '../src/external/models/VendorResource.js';
import { Quote } from '../src/external/models/Quote.js';
import { transitionQuote } from '../src/external/services/quoteStateMachine.service.js';
import { EventRequirement } from '../src/customer/models/index.js';
import { applyServiceStatement } from '../src/customer/services/events.service.js';
import { AdminAuditLog } from '../src/admin/models/AdminAuditLog.js';
import { Payment, Booking, Reservation } from '../src/customer/models/index.js';
import { customerFinancialTruth, vendorFinancialTruth } from '../src/common/financialTruth.service.js';
import { VendorBookingSlot } from '../src/external/models/VendorBookingSlot.js';
import { VendorBusinessGoal } from '../src/external/models/VendorBusinessGoal.js';
import { executeAction } from '../src/external/aura/setupActions.js';
import { createQuote as createVendorQuote } from '../src/external/services/quoteStateMachine.service.js';
import { recordLifecycleEventMessage } from '../src/customer/services/circle.service.js';
import { EventMessage } from '../src/customer/models/index.js';
import { withVendorSchedule } from '../src/external/services/scheduleLock.js';
import { devToolsAllowed } from '../src/config.js';
import { CorePolicyRevision } from '../src/admin/models/CorePolicyRevision.js';
import { getCommercialPolicyForCategory } from '../src/common/policyResolver.js';
import { calculateEligibleAdvanceRefund } from '../src/common/policyResolver.js';
import { buildVendorRecommendations } from '../src/external/services/auraIntelligence.service.js';
import { listBookableServices, findBookableService } from '../src/customer/repositories/catalog.repo.js';

let mongo, app, vendor, customer, vendorToken, customerToken, adminToken, restrictedAdminToken, actor;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('unified_external_test')), adminConn.openUri(mongo.getUri('unified_admin_test'))]);
  app = createApp();
  await Promise.all(Object.values(externalConn.models).map(m => m.init()));
  await Promise.all(Object.values(adminConn.models).map(m => m.init()));
  const owner = await ExternalUser.create({ email: 'vendor@unified.test', fullName: 'Vendor', accountType: 'VENDOR' });
  customer = await ExternalUser.create({ email: 'customer@unified.test', fullName: 'Customer', accountType: 'CUSTOMER' });
  vendor = await VendorOrganization.create({ owner: owner._id, businessName: 'Unified Vendor', status: 'SUSPENDED', activationState: 'SUSPENDED' });
  owner.vendorOrganization = vendor._id; await owner.save();
  actor = { id: owner._id, role: 'VENDOR' };
  async function externalToken(user) {
    const session = await ExternalSession.create({ user: user._id, refreshTokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
    return signExternalAccessToken(user, session._id);
  }
  vendorToken = await externalToken(owner); customerToken = await externalToken(customer);
  async function adminTokenFor(role, permissions) {
    const admin = await AdminUser.create({ email: `${crypto.randomUUID()}@unified.test`, fullName: 'Admin', passwordHash: 'test-fixture-only', role, permissions });
    const session = await AdminSession.create({ admin: admin._id, refreshTokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
    return signAdminAccessToken(admin, session._id);
  }
  adminToken = await adminTokenFor('SUPER_ADMIN', []);
  restrictedAdminToken = await adminTokenFor('ADMIN', ['vendors.read']);
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); if (mongo) await mongo.stop(); });
const key = () => crypto.randomUUID();
const block = (date, extra = {}) => ({ date, allDay: true, reason: 'Personal / Vacation', idempotencyKey: key(), ...extra });
const auth = token => ({ Authorization: `Bearer ${token}` });

test('business dashboard validates periods, derives ownership from the session and redacts private records', async () => {
  await request(app).get('/api/vendor/dashboard').expect(401);
  await request(app).get('/api/vendor/dashboard').set(auth(customerToken)).expect(403);
  await request(app).get('/api/vendor/dashboard?periodDays=31').set(auth(vendorToken)).expect(400);
  await request(app).get('/api/vendor/dashboard?periodDays=7&periodDays=30').set(auth(vendorToken)).expect(400);
  const foreignOwner = await ExternalUser.create({ email: `dashboard-${key()}@unified.test`, fullName: 'Private vendor', accountType: 'VENDOR' });
  const foreignVendor = await VendorOrganization.create({ owner: foreignOwner._id, businessName: 'Private dashboard' });
  const privateBooking = await CoreBooking.create({ vendorId: foreignVendor._id, customerId: customer._id, serviceName: 'Private service', eventDate: '2099-01-01', totalAmount: 987654321, bookingStatus: 'CONFIRMED', createdAt: new Date(Date.now() - 86400000) });
  const own = await request(app).get('/api/vendor/dashboard?periodDays=30').set(auth(vendorToken)).expect(200);
  const tampered = await request(app).get(`/api/vendor/dashboard?periodDays=30&vendorId=${foreignVendor._id}`).set(auth(vendorToken)).expect(200);
  assert.equal(own.headers['cache-control'], 'private, no-store');
  assert.deepEqual(own.body.dashboard.snapshot, tampered.body.dashboard.snapshot);
  const json = JSON.stringify(tampered.body);
  for (const secret of [String(privateBooking._id), foreignOwner.email, 'Private service', 'Private dashboard']) assert.ok(!json.includes(secret));
  assert.equal(own.body.dashboard.timezone, 'Asia/Kolkata');
  assert.equal(own.body.dashboard.sourceStates.bookings, 'AVAILABLE');
  assert.equal(own.body.dashboard.snapshot.upcomingBookings, 0);
  assert.equal(own.body.dashboard.financial.bookingValue, 0);
});

test('dashboard review dependency failure does not become zero or break unrelated sections', async t => {
  const originalFind = VendorReview.find.bind(VendorReview);
  const mock = t.mock.method(VendorReview, 'find', (...args) => {
    const query = originalFind(...args);
    query.exec = async () => { throw new Error('Controlled test source outage'); };
    return query;
  });
  try {
    const response = await request(app).get('/api/vendor/dashboard').set(auth(vendorToken)).expect(200);
    assert.equal(response.body.dashboard.sourceStates.reviews, 'UNAVAILABLE');
    assert.equal(response.body.dashboard.quality.reviewCount, null);
    assert.equal(response.body.dashboard.quality.rating, null);
    assert.equal(response.body.dashboard.financial.available, true);
    assert.equal(response.body.dashboard.weekly.current.available, false);
    assert.ok(!JSON.stringify(response.body).includes('Controlled test source outage'));
  } finally { mock.mock.restore(); }
});

test('concurrent goal creation cannot exceed three active goals', async () => {
  const owner = await ExternalUser.create({ email: `goal-race-${key()}@unified.test`, fullName: 'Goal Race Vendor', accountType: 'VENDOR' });
  const organization = await VendorOrganization.create({ owner: owner._id, businessName: 'Goal cap test' });
  owner.vendorOrganization = organization._id; await owner.save();
  const session = await ExternalSession.create({ user: owner._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  const token = signExternalAccessToken(owner, session._id);
  const payload = { name: 'Concurrent count target', metric: 'CONFIRMED_BOOKINGS', targetValue: 2, startDate: '2026-10-01', endDate: '2026-10-31' };
  for (let i = 0; i < 2; i++) await request(app).post('/api/vendor/goals').set(auth(token)).send(payload).expect(201);
  const results = await Promise.all([0, 1, 2].map(() => request(app).post('/api/vendor/goals').set(auth(token)).send(payload)));
  assert.equal(results.filter(row => row.status === 201).length, 1);
  assert.ok(results.filter(row => row.status !== 201).every(row => row.status === 409));
  assert.equal(await VendorBusinessGoal.countDocuments({ vendor: organization._id, status: 'ACTIVE', deletedAt: null }), 3);
});

test('vendor mark-all-read clears unread notifications and conversations together', async () => {
  const notification = await Notification.create({ vendor: vendor._id, title: 'Unread test notice', message: 'Test only', type: 'MESSAGE', isRead: false });
  const conversation = await VendorMessageThread.create({ vendor: vendor._id, clientName: 'Read-state test', unreadVendorCount: 3, status: 'ACTIVE' });
  const blockedConversation = await VendorMessageThread.create({ vendor: vendor._id, clientName: 'Blocked test', unreadVendorCount: 2, status: 'BLOCKED' });

  const actionItems = await request(app).get('/api/vendor/badge-counts').set(auth(vendorToken)).expect(200);
  assert.equal(actionItems.body.messagesCount, 1);
  assert.deepEqual(actionItems.body.messageActionItems.map((item) => item.threadId), [String(conversation._id)]);
  assert.ok(!Object.hasOwn(actionItems.body.messageActionItems[0], 'clientName'));
  assert.ok(!Object.hasOwn(actionItems.body.messageActionItems[0], 'lastMessageText'));

  const response = await request(app).put('/api/vendor/notifications/read-all').set(auth(vendorToken)).expect(200);
  assert.equal(response.body.unread, 0);
  assert.equal((await Notification.findById(notification._id)).isRead, true);
  assert.equal((await VendorMessageThread.findById(conversation._id)).unreadVendorCount, 0);
  assert.equal((await VendorMessageThread.findById(blockedConversation._id)).unreadVendorCount, 2);
});

test('readiness never activates an unapproved, rejected or suspended profile', async () => {
  const ready = { hasProfile: true, isFinancialVerified: true, commercialReadiness: true };
  assert.equal(activationDecision({}, ready).activationState, 'DRAFT');
  assert.equal(activationDecision({ activationReview: { requestedAt: new Date() } }, ready).activationState, 'UNDER_REVIEW');
  assert.equal(activationDecision({ activationReview: { status: 'APPROVED' } }, ready).matchingEligible, true);
  for (const status of ['SUSPENDED', 'REJECTED']) assert.equal(activationDecision({ status, activationReview: { status: 'APPROVED' } }, ready).matchingEligible, false);
  const before = await VendorOrganization.findById(vendor._id).lean();
  const result = await evaluateVendorActivation(vendor._id);
  const after = await VendorOrganization.findById(vendor._id).lean();
  assert.equal(result.activationState, 'SUSPENDED');
  assert.equal(String(before.updatedAt), String(after.updatedAt));
  assert.equal(after.status, 'SUSPENDED');
});

test('activation requires Admin permission and complete verification', async () => {
  await request(app).post(`/api/admin/external-users/organizations/${vendor._id}/activation`).set(auth(restrictedAdminToken)).send({ action: 'APPROVE', reason: 'Review', idempotencyKey: key() }).expect(403);
  const denied = await request(app).post(`/api/admin/external-users/organizations/${vendor._id}/activation`).set(auth(adminToken)).send({ action: 'APPROVE', reason: 'Review', idempotencyKey: key() }).expect(409);
  assert.equal(denied.body.error, 'VENDOR_NOT_READY');
  assert.ok(await AdminAuditLog.exists({ action: 'VENDOR_ACTIVATION_DENIED', targetId: String(vendor._id) }));
});

test('complete profile needs separate activation approval; Admin decision reaches Vendor OS and survives reads', async () => {
  const owner = await ExternalUser.create({ email: 'complete-vendor@unified.test', fullName: 'Complete Vendor', accountType: 'VENDOR' });
  const complete = await VendorOrganization.create({ owner: owner._id, businessName: 'Ready Vendor', category: 'Photography', location: 'Pune', isProfileCompleted: true, manualReview: { status: 'APPROVED' } });
  const service = await VendorService.create({ vendor: complete._id, name: 'Photography', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 10000 } });
  await VendorCapability.create({ vendor: complete._id, vendorService: service._id, teamSize: 2, simultaneousEventLimit: 1 });
  await VendorFinancialProfile.create({ vendor: complete._id, pan: { verificationStatus: 'VERIFIED' }, bankAccount: { verificationStatus: 'VERIFIED' } });
  await OperatingLocation.create({ vendor: complete._id, label: 'Studio', city: 'Pune' });
  await ServiceCoverage.create({ vendor: complete._id, vendorService: service._id, coverageType: 'CITY', city: 'Pune' });
  await PortfolioItem.create({ vendor: complete._id, mediaType: 'IMAGE', url: 'https://example.test/photo.jpg' });
  assert.equal((await evaluateVendorActivation(complete._id)).activationState, 'DRAFT');
  owner.vendorOrganization = complete._id; await owner.save();
  const session = await ExternalSession.create({ user: owner._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  const token = signExternalAccessToken(owner, session._id);
  await request(app).post('/api/vendor/activation-review').set(auth(token)).send({}).expect(200);
  await request(app).post('/api/vendor/activation-review').set(auth(token)).send({}).expect(200);
  assert.equal((await request(app).get('/api/vendor/activation-status').set(auth(token)).expect(200)).body.status.activationState, 'UNDER_REVIEW');
  const payload = { action: 'APPROVE', reason: 'Identity and operational profile reviewed', idempotencyKey: key() };
  await request(app).post(`/api/admin/external-users/organizations/${complete._id}/activation`).set(auth(adminToken)).send(payload).expect(200);
  await request(app).post(`/api/admin/external-users/organizations/${complete._id}/activation`).set(auth(adminToken)).send(payload).expect(200);
  assert.equal((await evaluateVendorActivation(complete._id)).matchingEligible, true);
  const approved = await VendorOrganization.findById(complete._id);
  assert.equal(approved.activationHistory.filter(h => h.action === 'APPROVE').length, 1);
  assert.equal((await request(app).get('/api/vendor/activation-status').set(auth(token)).expect(200)).body.status.activationState, 'ACTIVE'); assert.equal(approved.status, 'ACTIVE');
  await request(app).post(`/api/admin/external-users/organizations/${complete._id}/activation`).set(auth(adminToken)).send({ action: 'SUSPEND', reason: 'Operational issue', idempotencyKey: key() }).expect(200);
  assert.equal((await evaluateVendorActivation(complete._id)).matchingEligible, false);
  assert.equal((await VendorOrganization.findById(complete._id)).status, 'SUSPENDED');
});

test('customer catalogue finds approved active services across Kapkote and Bageshwar with multiple coverage records', async () => {
  const owner = await ExternalUser.create({ email: `regional-${key()}@unified.test`, fullName: 'Regional Vendor', accountType: 'VENDOR' });
  const regionalVendor = await VendorOrganization.create({ businessName: 'Bageshwar Regional Vendor', category: 'Catering', location: 'Kapkot, Uttarakhand', owner: owner._id, isProfileCompleted: true, manualReview: { status: 'APPROVED' } });
  const service = await VendorService.create({ vendor: regionalVendor._id, name: 'Regional Catering', category: 'Catering', status: 'ACTIVE', pricing: { basePrice: 12000 } });
  await VendorCapability.create({ vendor: regionalVendor._id, vendorService: service._id, teamSize: 4, simultaneousEventLimit: 1 });
  await VendorFinancialProfile.create({ vendor: regionalVendor._id, pan: { verificationStatus: 'VERIFIED' }, bankAccount: { verificationStatus: 'VERIFIED' } });
  await OperatingLocation.create({ vendor: regionalVendor._id, label: 'Kapkot kitchen', city: 'Kapkot', state: 'Uttarakhand', isPrimary: true });
  await ServiceCoverage.create({ vendor: regionalVendor._id, vendorService: service._id, coverageType: 'DISTRICT', city: 'Bageshwar', state: 'Uttarakhand' });
  await ServiceCoverage.create({ vendor: regionalVendor._id, vendorService: service._id, coverageType: 'STATE', state: 'Uttarakhand' });
  await PortfolioItem.create({ vendor: regionalVendor._id, mediaType: 'IMAGE', url: 'https://example.test/regional-catering.jpg' });
  owner.vendorOrganization = regionalVendor._id;
  await owner.save();
  const session = await ExternalSession.create({ user: owner._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  const token = signExternalAccessToken(owner, session._id);
  await request(app).post('/api/vendor/activation-review').set(auth(token)).send({}).expect(200);
  await request(app).post(`/api/admin/external-users/organizations/${regionalVendor._id}/activation`).set(auth(adminToken)).send({ action: 'APPROVE', reason: 'Regional test vendor approved', idempotencyKey: key() }).expect(200);

  const rows = await listBookableServices({ city: 'Kapkote, Bageshwar' });
  assert.ok(rows.some(row => String(row.service._id) === String(service._id)));
  assert.equal((await findBookableService(service._id, { city: 'Bageshwar' }))?.service?._id.toString(), service._id.toString());
});

test('approving a quote does not manufacture a confirmed booking or verified payment', async () => {
  const service = await VendorService.create({ vendor: vendor._id, name: 'Quote test service', category: 'Photography', pricing: { basePrice: 5000 } });
  const quote = await Quote.create({ vendor: vendor._id, customer: customer._id, vendorService: service._id, serviceName: 'Quote test', eventDate: '2027-10-01', status: 'SUBMITTED', pricingBreakdown: { basePrice: 5000, totalAmount: 5000 } });
  await transitionQuote(quote._id, 'APPROVED', { actor: 'CUSTOMER', reason: 'Customer accepted' });
  assert.equal(await CoreBooking.countDocuments({ quoteId: String(quote._id) }), 0);
  assert.notEqual((await Quote.findById(quote._id)).advancePayment.status, 'VERIFIED');
});

test('deleting a service referenced by a quote archives it and retains its capability and coverage', async () => {
  const service = await VendorService.create({ vendor: vendor._id, name: 'Historical Photography', category: 'Photography', pricing: { basePrice: 1000 }, status: 'ACTIVE' });
  const capability = await VendorCapability.create({ vendor: vendor._id, vendorService: service._id, styles: ['Documentary'] });
  const coverage = await ServiceCoverage.create({ vendor: vendor._id, vendorService: service._id, coverageType: 'RADIUS', radiusKm: 20, city: 'Kolkata' });
  await Quote.create({ vendor: vendor._id, customer: customer._id, vendorService: service._id, serviceName: service.name, eventDate: '2027-12-10', pricingBreakdown: { basePrice: 1000, totalAmount: 1000 } });
  const response = await request(app).delete(`/api/vendor/services/${service._id}`).set(auth(vendorToken)).expect(200);
  assert.equal(response.body.archived, true);
  assert.equal((await VendorService.findById(service._id)).status, 'ARCHIVED');
  assert.ok(await VendorCapability.findById(capability._id));
  assert.ok(await ServiceCoverage.findById(coverage._id));
});

test('new vendor quotes snapshot the category advance policy and version', async () => {
  const service = await VendorService.create({ vendor: vendor._id, name: 'Policy Photo', category: 'Policy Category', pricing: { basePrice: 2000 }, status: 'DRAFT' });
  const author = await AdminUser.create({ email: 'policy-author@unified.test', fullName: 'Policy Author', passwordHash: 'fixture', role: 'ADMIN', permissions: [] });
  const approver = await AdminUser.create({ email: 'policy-approver@unified.test', fullName: 'Policy Approver', passwordHash: 'fixture', role: 'ADMIN', permissions: [] });
  const policy = await CorePolicyRevision.create({
    category: 'Policy Category', version: 1, status: 'APPROVED', values: { minimumReservationPercent: 42, vendorCancellationPenaltyPercent: 0, customerCancellationRefunds: { 30: 100 }, settlementCondition: 'EVENT_DATE_PASSED', settlementDelayDays: 3 },
    contentHash: 'fixture-hash', submittedHash: 'fixture-hash', effectiveFrom: new Date(Date.now() - 1000), reason: 'Test approved policy',
    createdBy: author._id, createdByEmail: author.email, approvedBy: approver._id, approvedByEmail: approver.email, approvedAt: new Date(),
  });
  const resolved = await getCommercialPolicyForCategory('Policy Category');
  const quote = await createVendorQuote({ vendorId: vendor._id, customerId: customer._id, vendorServiceId: service._id, serviceName: service.name, eventDate: '2027-12-12', pricingBreakdown: { basePrice: 2000, totalAmount: 2000 }, status: 'DRAFT', category: 'Policy Category', advancePolicy: resolved });
  assert.equal(quote.advancePayment.percentage, 42);
  assert.equal(quote.advancePayment.policySnapshot.version, policy.version);
  assert.equal(quote.advancePayment.policySnapshot.category, 'Policy Category');
  assert.equal(quote.advancePayment.policySnapshot.terms.settlementDelayDays, 3);
});

test('finance policy changes require immutable submission and a second admin approval', async () => {
  const legacy = await (await import('../src/admin/models/CorePolicy.js')).CorePolicy.create({ category: 'Legacy Only', minimumReservationPercent: 30 });
  const legacyResolved = await getCommercialPolicyForCategory(legacy.category);
  assert.equal(legacyResolved.policyActive, false);
  assert.equal(legacyResolved.minimumReservationPercent, null);
  async function tokenFor(email, permissions) {
    const admin = await AdminUser.create({ email, fullName: email, passwordHash: 'fixture', role: 'ADMIN', permissions });
    const session = await AdminSession.create({ admin: admin._id, refreshTokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
    return { admin, token: signAdminAccessToken(admin, session._id) };
  }
  const maker = await tokenFor('policy-maker@unified.test', ['financePolicies.read', 'financePolicies.update', 'financePolicies.approve']);
  const checker = await tokenFor('policy-checker@unified.test', ['financePolicies.read', 'financePolicies.update', 'financePolicies.approve']);
  const values = { minimumReservationPercent: 20, vendorCancellationPenaltyPercent: 0, customerCancellationRefunds: { 30: 100, 14: 50, 0: 25 }, settlementCondition: 'EVENT_DATE_PASSED', settlementDelayDays: 3, reason: 'Handbook proposal review' };
  const created = await request(app).post('/api/admin/policy/Global/drafts').set(auth(maker.token)).send(values).expect(201);
  const id = created.body.revision._id;
  assert.equal(created.body.revision.status, 'DRAFT');
  await request(app).post(`/api/admin/policy/revisions/${id}/submit`).set(auth(maker.token)).send({}).expect(200);
  await request(app).put(`/api/admin/policy/revisions/${id}`).set(auth(maker.token)).send(values).expect(409);
  await request(app).post(`/api/admin/policy/revisions/${id}/approve`).set(auth(maker.token)).send({}).expect(403);
  await request(app).post(`/api/admin/policy/revisions/${id}/approve`).set(auth(checker.token)).send({}).expect(200);
  const active = await getCommercialPolicyForCategory('Photography');
  assert.equal(active.policyActive, true);
  assert.equal(active.minimumReservationPercent, 20);
  assert.equal(active.settlementDelayDays, 3);
});

test('refund policy calculator applies the approved minimum-day tier to eligible advance only', () => {
  const tiers = { 30: 100, 14: 50, 0: 25 };
  assert.deepEqual(calculateEligibleAdvanceRefund({ eligibleAdvance: 10000, refundTiers: tiers, daysBeforeEvent: 30 }), { percent: 100, amount: 10000 });
  assert.deepEqual(calculateEligibleAdvanceRefund({ eligibleAdvance: 10000, refundTiers: tiers, daysBeforeEvent: 29 }), { percent: 50, amount: 5000 });
  assert.deepEqual(calculateEligibleAdvanceRefund({ eligibleAdvance: 10000, refundTiers: tiers, daysBeforeEvent: 14 }), { percent: 50, amount: 5000 });
  assert.deepEqual(calculateEligibleAdvanceRefund({ eligibleAdvance: 10000, refundTiers: tiers, daysBeforeEvent: 13 }), { percent: 25, amount: 2500 });
  assert.deepEqual(calculateEligibleAdvanceRefund({ eligibleAdvance: 10000, refundTiers: tiers, daysBeforeEvent: 13, alreadyRefunded: 2000 }), { percent: 25, amount: 500 });
  assert.equal(calculateEligibleAdvanceRefund({ eligibleAdvance: 10000, refundTiers: tiers, daysBeforeEvent: -1 }), null);
});

test('multi-day blocks persist once, detect idempotency misuse and retain cancellation history', async () => {
  const payload = block('2027-01-01', { endDate: '2027-01-03' });
  const first = await request(app).post('/api/vendor/availability/blockouts').set(auth(vendorToken)).send(payload).expect(201);
  const repeated = await request(app).post('/api/vendor/availability/blockouts').set(auth(vendorToken)).send(payload).expect(201);
  assert.equal(first.body.blockout._id, repeated.body.blockout._id);
  await request(app).post('/api/vendor/availability/blockouts').set(auth(vendorToken)).send({ ...payload, reason: 'Other' }).expect(409);
  assert.equal((await checkTrueAvailability({ vendorId: vendor._id, date: '2027-01-02' })).feasible, false);
  await request(app).delete(`/api/vendor/availability/blockouts/${first.body.blockout._id}`).set(auth(vendorToken)).send({ reason: 'Schedule reopened' }).expect(200);
  const retained = await VendorBlockout.findById(first.body.blockout._id);
  assert.equal(retained.status, 'CANCELLED'); assert.equal(retained.history.length, 2);
  assert.equal((await checkTrueAvailability({ vendorId: vendor._id, date: '2027-01-02' })).feasible, true);
});

test('availability edits are idempotent and cannot be applied by another vendor', async () => {
  const created = await saveCommitment(vendor._id, block('2027-01-20'), actor);
  const edit = { ...block('2027-01-21'), revision: created.revision };
  const endpoint = `/api/vendor/availability/blockouts/${created._id}`;
  await request(app).patch(endpoint).set(auth(vendorToken)).send(edit).expect(200);
  await request(app).patch(endpoint).set(auth(vendorToken)).send(edit).expect(200);
  assert.equal((await VendorBlockout.findById(created._id)).history.length, 2);
  const user = await ExternalUser.create({ email: 'other-vendor@unified.test', fullName: 'Other vendor', accountType: 'VENDOR' });
  const organization = await VendorOrganization.create({ owner: user._id, businessName: 'Other Vendor' });
  user.vendorOrganization = organization._id; await user.save();
  const session = await ExternalSession.create({ user: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  const token = signExternalAccessToken(user, session._id);
  await request(app).patch(endpoint).set(auth(token)).send({ ...edit, idempotencyKey: key() }).expect(404);
  await request(app).delete(endpoint).set(auth(token)).expect(404);
});

test('timezone conversion rejects nonexistent and ambiguous local times', () => {
  const row = normaliseCommitment(block('2027-01-01'));
  assert.equal(row.startAt.toISOString(), '2026-12-31T18:30:00.000Z');
  assert.throws(() => normaliseCommitment(block('2027-03-14', { allDay: false, timezone: 'America/New_York', startTime: '02:30', endTime: '04:00' })), { code: 'INVALID_LOCAL_TIME' });
  assert.throws(() => normaliseCommitment(block('2027-11-07', { allDay: false, timezone: 'America/New_York', startTime: '01:30', endTime: '04:00' })), { code: 'AMBIGUOUS_LOCAL_TIME' });
  assert.equal(normaliseCommitment(block('2027-02-03', { allDay: false, startTime: '22:00', endTime: '02:00' })).endDate, '2027-02-04');
});

test('all partial blocks and overnight boundaries are checked', async () => {
  await saveCommitment(vendor._id, block('2027-02-01', { allDay: false, startTime: '09:00', endTime: '10:00' }), actor);
  await saveCommitment(vendor._id, block('2027-02-01', { allDay: false, startTime: '15:00', endTime: '16:00' }), actor);
  assert.equal((await checkTrueAvailability({ vendorId: vendor._id, date: '2027-02-01', startTime: '15:30', endTime: '16:30' })).feasible, false);
  assert.equal((await checkTrueAvailability({ vendorId: vendor._id, date: '2027-02-01', startTime: '11:00', endTime: '12:00' })).feasible, true);
  await saveCommitment(vendor._id, block('2027-02-03', { allDay: false, startTime: '22:00', endTime: '02:00' }), actor);
  assert.equal((await checkTrueAvailability({ vendorId: vendor._id, date: '2027-02-04', startTime: '01:00', endTime: '03:00' })).feasible, false);
});

test('confirmed platform bookings reject overlapping blocks without being modified', async () => {
  const booking = await CoreBooking.create({ vendorId: vendor._id, customerId: customer._id, serviceName: 'Photography', eventDate: '2027-03-01', totalAmount: 10000, bookingStatus: 'CONFIRMED' });
  const result = await request(app).post('/api/vendor/availability/blockouts').set(auth(vendorToken)).send(block('2027-03-01')).expect(409);
  assert.equal(result.body.error, 'SCHEDULE_CONFLICT');
  assert.equal((await CoreBooking.findById(booking._id)).bookingStatus, 'CONFIRMED');
  await assert.rejects(() => executeAction(vendor, { kind: 'block_date', blockout: { date: '2027-03-01', allDay: true, reason: 'Unavailable' }, idempotencyKey: key() }), { code: 'SCHEDULE_CONFLICT' });
});

test('unapproved vendors cannot submit offers or access new enquiries', async () => {
  const service = await VendorService.findOne({ vendor: vendor._id });
  await assert.rejects(() => createVendorQuote({ vendorId: vendor._id, customerId: customer._id, vendorServiceId: service._id, eventDate: '2027-03-10', serviceName: 'Service', pricingBreakdown: { basePrice: 1000, totalAmount: 1000 }, status: 'SUBMITTED' }), { code: 'ACTIVATION_REQUIRED' });
  await request(app).get('/api/vendor/opportunities').set(auth(vendorToken)).expect(403);
});

test('overlapping concurrent requests cannot both commit', async () => {
  const results = await Promise.allSettled([saveCommitment(vendor._id, block('2027-04-01'), actor), saveCommitment(vendor._id, block('2027-04-01'), actor)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await VendorBlockout.countDocuments({ vendor: vendor._id, date: '2027-04-01' }), 1);
});

test('an expired schedule owner is not stolen while its writer could resume', async () => {
  await withVendorSchedule(vendor._id, async assertLease => {
    await externalConn.collection('vendorschedulelocks').updateOne({ _id: String(vendor._id) }, { $set: { expiresAt: new Date(0) } });
    await assert.rejects(() => withVendorSchedule(vendor._id, async () => {}), { code: 'SCHEDULE_BUSY' });
    await assert.rejects(assertLease, { code: 'SCHEDULE_LEASE_LOST' });
  });
  await withVendorSchedule(vendor._id, async assertLease => { await assertLease(); });
});

test('service-specific blocks leave unrelated services available', async () => {
  const sid = new mongoose.Types.ObjectId(), other = new mongoose.Types.ObjectId();
  const row = { _id: 'block', ...normaliseCommitment(block('2027-05-01', { scope: 'SERVICE', vendorService: sid })), kind: 'VENDOR_BLOCK' };
  assert.equal(evaluateSchedule({ date: '2027-05-01', vendorServiceId: other }, [row]).feasible, true);
  assert.equal(evaluateSchedule({ date: '2027-05-01', vendorServiceId: sid }, [row]).feasible, false);
});

test('resource blocks use declared dependencies and leave unrelated equipment/services available', async () => {
  const resource = await VendorResource.create({ vendor: vendor._id, name: 'Camera', type: 'EQUIPMENT' });
  const affected = await VendorService.create({ vendor: vendor._id, name: 'Camera service', category: 'Photography', pricing: { basePrice: 5000 }, requiredResourceIds: [resource._id] });
  const unrelated = await VendorService.create({ vendor: vendor._id, name: 'Other service', category: 'Photography', pricing: { basePrice: 1000 } });
  await saveCommitment(vendor._id, block('2027-05-05', { scope: 'RESOURCE', resourceIds: [String(resource._id)] }), actor);
  assert.equal((await checkTrueAvailability({ vendorId: vendor._id, vendorServiceId: affected._id, date: '2027-05-05' })).feasible, false);
  assert.equal((await checkTrueAvailability({ vendorId: vendor._id, vendorServiceId: unrelated._id, date: '2027-05-05' })).feasible, true);
});

test('shared equipment capacity counts simultaneous allocations rather than every job on the date', () => {
  const job = (id, startTime, endTime) => ({ _id: id, date: '2027-05-15', allDay: false, startTime, endTime, kind: 'EXTERNAL_COMMITMENT', resourceIds: ['kit'] });
  const request = { date: '2027-05-15', startTime: '09:00', endTime: '12:00', requestedResources: ['kit'], resourceCapacities: { kit: 2 } };
  assert.equal(evaluateSchedule(request, [job('a', '09:00', '10:00'), job('b', '11:00', '12:00')], 3).feasible, true);
  assert.equal(evaluateSchedule(request, [job('a', '09:00', '11:00'), job('b', '09:00', '11:00')], 3).feasible, false);
});

test('external commitment is reported, visible in Admin and contact-protected', async () => {
  const payload = block('2027-06-01', { recordType: 'EXTERNAL_COMMITMENT', external: { customerName: 'Private Customer', customerPhone: '+919876543210', eventType: 'Wedding', location: 'Pune' } });
  const created = await request(app).post('/api/vendor/availability/blockouts').set(auth(vendorToken)).send(payload).expect(201);
  assert.equal(created.body.blockout.verificationStatus, 'REPORTED');
  assert.equal(created.body.blockout.recordType, 'EXTERNAL_COMMITMENT');
  assert.equal(await CoreBooking.countDocuments({ eventDate: '2027-06-01' }), 0);
  const safe = await request(app).get(`/api/admin/availability?vendor=${vendor._id}`).set(auth(restrictedAdminToken)).expect(200);
  const row = safe.body.records.find(r => r._id === created.body.blockout._id);
  assert.equal(row.external.customerPhone, undefined); assert.equal(row.external.customerName, undefined);
  const privileged = await request(app).get(`/api/admin/availability?vendor=${vendor._id}`).set(auth(adminToken)).expect(200);
  assert.equal(privileged.body.records.find(r => r._id === row._id).external.customerPhone, '+919876543210');
  await request(app).get('/api/admin/availability').set(auth(customerToken)).expect(401);
  await request(app).get('/api/vendor/availability/blockouts').set(auth(customerToken)).expect(403);
});

test('external commitments allow optional customer contact details and validate a phone only when supplied', () => {
  const optional = normaliseCommitment(block('2027-06-03', { recordType: 'EXTERNAL_COMMITMENT', external: {} }));
  assert.equal(optional.external.customerName, '');
  assert.equal(optional.external.customerPhone, '');
  assert.throws(() => normaliseCommitment(block('2027-06-03', { recordType: 'EXTERNAL_COMMITMENT', external: { customerPhone: '12345' } })), { code: 'INVALID_EXTERNAL_PHONE' });
});

test('legacy commitments remain visible to Admin and cancel with an audit trail', async () => {
  const service = await VendorService.findOne({ vendor: vendor._id });
  const slot = await VendorBookingSlot.create({ vendor: vendor._id, vendorService: service._id, date: '2027-06-10', startTime: '09:00', endTime: '12:00', status: 'CONFIRMED' });
  const result = await request(app).get(`/api/admin/availability?vendor=${vendor._id}&recordType=EXTERNAL_COMMITMENT`).set(auth(adminToken)).expect(200);
  const row = result.body.records.find(r => r._id === String(slot._id));
  assert.equal(row.verificationStatus, 'REPORTED'); assert.equal(row.sourceModel, 'VendorBookingSlot');
  await request(app).post(`/api/admin/availability/${slot._id}/cancel`).set(auth(adminToken)).send({ reason: 'Vendor confirmed cancellation' }).expect(200);
  const retained = await VendorBookingSlot.findById(slot._id);
  assert.equal(retained.status, 'CANCELLED'); assert.equal(retained.history.length, 1);
});

test('unexpired pending holds prevent new blocks and expired holds do not reserve capacity', async () => {
  const service = await VendorService.findOne({ vendor: vendor._id });
  const event = await CustomerEvent.create({ customer: customer._id, eventType: 'wedding', eventDate: '2027-07-10', status: 'planning' });
  const reservation = await Reservation.create({ customer: customer._id, event: event._id, quote: new mongoose.Types.ObjectId(), quoteItem: new mongoose.Types.ObjectId(), requirement: new mongoose.Types.ObjectId(), category: 'photography', optionId: `vs_${service._id}`, vendorName: 'Vendor', packageName: 'Service', amount: 100, status: 'pending_payment', expiresAt: new Date(Date.now() + 3600000) });
  await assert.rejects(() => saveCommitment(vendor._id, block(event.eventDate), actor), { code: 'SCHEDULE_CONFLICT' });
  await Reservation.updateOne({ _id: reservation._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await checkTrueAvailability({ vendorId: vendor._id, date: event.eventDate })).feasible, true);
});

test('invalid ranges, resource ownership and stale edits are rejected', async () => {
  await request(app).post('/api/vendor/availability/blockouts').set(auth(vendorToken)).send(block('2027-02-30')).expect(400);
  await request(app).post('/api/vendor/availability/blockouts').set(auth(vendorToken)).send(block('2027-07-01', { scope: 'RESOURCE', resourceIds: [new mongoose.Types.ObjectId()] })).expect(403);
  const row = await saveCommitment(vendor._id, block('2027-07-02'), actor);
  await request(app).patch(`/api/vendor/availability/blockouts/${row._id}`).set(auth(vendorToken)).send({ ...block('2027-07-03'), revision: 9 }).expect(409);
});

test('dashboard reflects a real saved customer change and denies other customer data', async () => {
  const event = await CustomerEvent.create({ customer: customer._id, eventType: 'wedding', eventDate: '2027-08-01', city: 'Pune', guestCount: 100, status: 'draft' });
  const endpoint = `/api/customer/events/${event._id}`;
  let response = await request(app).get(`${endpoint}/dashboard`).set(auth(customerToken)).expect(200);
  assert.equal(response.body.event.guestCount, 100);
  await request(app).patch(endpoint).set(auth(customerToken)).send({ guestCount: 150 }).expect(200);
  response = await request(app).get(`${endpoint}/dashboard`).set(auth(customerToken)).expect(200);
  assert.equal(response.body.event.guestCount, 150);
  assert.ok(response.body.experience.risks.length);
  assert.equal(response.body.steps.find(s => s.key === 'payment').state === 'done', false);
  await request(app).get(`${endpoint}/dashboard`).set(auth(vendorToken)).expect(403);
});

test('Aura suggestions remain inferred until an explicit customer confirmation', async () => {
  const event = await CustomerEvent.create({ customer: customer._id, eventType: 'wedding', eventDate: '2027-08-10', city: 'Pune', status: 'draft' });
  await applyServiceStatement(customer._id, event._id, 'photography', { kind: 'provided', value: 'Family photographer' }, { actorType: 'aura' });
  let response = await request(app).get(`/api/customer/events/${event._id}/dashboard`).set(auth(customerToken)).expect(200);
  assert.equal(response.body.experience.proposedRequirements.length, 1);
  assert.equal(response.body.summary.progressPercent, 0);
  await request(app).post(`/api/customer/events/${event._id}/requirements/photography/confirm`).set(auth(customerToken)).send({}).expect(200);
  assert.equal((await EventRequirement.findOne({ event: event._id, category: 'photography' })).source, 'customer');
  response = await request(app).get(`/api/customer/events/${event._id}/dashboard`).set(auth(customerToken)).expect(200);
  assert.equal(response.body.experience.proposedRequirements.length, 0);
  assert.ok(response.body.summary.progressPercent > 0);
});

test('vendor recommendations cite only saved evidence and omit unsupported location or traffic claims', () => {
  const recommendations = buildVendorRecommendations({
    now: new Date('2026-10-29T12:00:00.000Z'),
    opportunities: [
      { _id: 'new-1', status: 'NEW', serviceName: 'Photography', createdAt: '2026-10-25T12:00:00.000Z', serviceLocation: { locality: 'Pune' } },
      { _id: 'other-1', status: 'RESPONDED', createdAt: '2026-10-26T12:00:00.000Z', serviceLocation: { locality: 'Pune' } },
      { _id: 'old-1', status: 'RESPONDED', createdAt: '2026-09-01T12:00:00.000Z', serviceLocation: { locality: 'Jaipur' } },
    ],
    bookings: [{ bookingStatus: 'CONFIRMED', serviceLocation: { locality: 'Mumbai' } }],
    coverages: [{ localities: ['Mumbai'] }],
  });
  const text = JSON.stringify(recommendations);
  assert.match(text, /Pune/);
  assert.match(text, /Mumbai/);
  assert.doesNotMatch(text, /Jaipur/);
  assert.doesNotMatch(text, /Kisan Palace|New Town|Barasat|peak traffic|45-min transit/);
  assert.doesNotMatch(text, /increases match ranking|High-Match|PORTFOLIO_GAP/);
  assert.equal(recommendations.find((item) => item.signal === 'NEW_ENQUIRY')?.targetId, 'new-1');
});

test('vendor financial truth separates settlement eligibility and holds from completion verification', async () => {
  const financialVendorId = new mongoose.Types.ObjectId();
  const booking = (settlementStatus, executionStatus, vendorPayable, bookingReference) => ({
    vendorId: financialVendorId,
    customerId: customer._id,
    serviceName: 'Finance test booking',
    eventDate: '2027-03-01',
    totalAmount: vendorPayable,
    bookingStatus: 'CONFIRMED',
    settlementStatus,
    executionStatus,
    taxSummary: { vendorPayable },
    bookingReference,
  });
  await CoreBooking.create([
    booking('SETTLEMENT_ELIGIBLE', 'COMPLETION_VERIFIED', 200, 'ELIGIBLE'),
    booking('SETTLEMENT_HOLD', 'COMPLETION_VERIFIED', 300, 'HELD'),
    booking('NOT_ELIGIBLE', 'COMPLETION_VERIFIED', 400, 'REVIEW_DELAY'),
    { ...booking('SETTLED', 'COMPLETION_VERIFIED', 500, 'SETTLED'), settlementDetails: { vendorPayable: 500 } },
  ]);
  const truth = await vendorFinancialTruth(financialVendorId, { now: new Date('2026-10-29T12:00:00.000Z') });
  assert.equal(truth.metrics.expectedSettlements, 200);
  assert.equal(truth.metrics.settlementHoldAmount, 300);
  assert.equal(truth.metrics.settledAmount, 500);
  assert.equal(truth.nextBestActions.filter((item) => item.type === 'settlement_ready').length, 1);
});

test('budget totals count verified money, exclude pending/cancelled contracts and deduplicate linked Core bookings', async () => {
  const event = await CustomerEvent.create({ customer: customer._id, eventType: 'wedding', eventDate: '2027-09-10', budget: 10000, status: 'draft' });
  const requirement = new mongoose.Types.ObjectId();
  const quote = new mongoose.Types.ObjectId();
  const reservation = await Reservation.create({ event: event._id, customer: customer._id, quote, quoteItem: new mongoose.Types.ObjectId(), requirement, category: 'photography', optionId: 'financial-test', vendorName: 'Vendor', packageName: 'Package', packageTotal: 5000, amount: 500, status: 'converted', expiresAt: new Date(Date.now() + 100000) });
  const payment = await Payment.create({ event: event._id, customer: customer._id, reservation: reservation._id, amount: 500, status: 'verified' });
  await Payment.create({ event: event._id, customer: customer._id, reservation: reservation._id, amount: 1000, status: 'paid' });
  await Booking.create({ event: event._id, customer: customer._id, requirement, category: 'photography', optionId: 'financial-test', vendorName: 'Vendor', packageName: 'Package', reservation: reservation._id, payment: payment._id, amount: 5000, paidAmount: 500, status: 'confirmed' });
  await CoreBooking.create({ vendorId: vendor._id, customerId: customer._id, customerEvent: event._id, quoteId: String(quote), serviceName: 'Linked photography', category: 'Photography', eventDate: event.eventDate, totalAmount: 5000, paymentStatus: 'PAYMENT_VERIFIED', paymentSummary: { paidAmount: 500 } });
  await CoreBooking.create({ vendorId: vendor._id, customerId: customer._id, customerEvent: event._id, quoteId: String(new mongoose.Types.ObjectId()), serviceName: 'Other category', category: 'Catering', eventDate: event.eventDate, totalAmount: 3000, paymentStatus: 'PAYMENT_VERIFIED', paymentSummary: { paidAmount: 700 } });
  await CoreBooking.create({ vendorId: vendor._id, customerId: customer._id, customerEvent: event._id, serviceName: 'Cancelled', eventDate: event.eventDate, totalAmount: 100000, bookingStatus: 'CANCELLED' });
  const truth = await customerFinancialTruth(customer._id, event._id);
  assert.equal(truth.metrics.paidAmount, 1200);
  assert.equal(truth.metrics.committedAmount, 8000);
  const dashboard = await request(app).get(`/api/customer/events/${event._id}/dashboard`).set(auth(customerToken)).expect(200);
  assert.equal(dashboard.body.summary.budget.paidAmount, truth.metrics.paidAmount);
  assert.equal(dashboard.body.summary.budget.committedCost, truth.metrics.committedAmount);
});

test('logical notifications deduplicate concurrent event delivery and link to the event', async () => {
  const payload = { customerId: customer._id, eventId: new mongoose.Types.ObjectId(), type: 'quote', title: 'A quote arrived', idempotencyKey: key() };
  await Promise.all([notifyCustomer(payload), notifyCustomer(payload)]);
  assert.equal(await CustomerNotification.countDocuments({ idempotencyKey: payload.idempotencyKey }), 1);
  assert.equal((await CustomerNotification.findOne({ idempotencyKey: payload.idempotencyKey })).actionUrl, `/customer/events/${payload.eventId}/quotes`);
});

test('replaying a lifecycle event does not duplicate messages or notifications', async () => {
  const event = await CustomerEvent.create({ customer: customer._id, eventType: 'wedding', status: 'planning' });
  const payload = { vendorId: vendor._id, customerId: customer._id, eventId: event._id, bookingId: new mongoose.Types.ObjectId(), sender: 'SYSTEM', type: 'booking', text: 'Your booking is confirmed.' };
  await recordLifecycleEventMessage(payload);
  await recordLifecycleEventMessage(payload);
  assert.equal(await EventMessage.countDocuments({ event: event._id }), 1);
  assert.equal(await CustomerNotification.countDocuments({ event: event._id }), 1);
  await recordLifecycleEventMessage({ ...payload, text: 'Your booking schedule has changed.' });
  assert.equal(await CustomerNotification.countDocuments({ event: event._id }), 2);
});

test('timezone quiet hours and opt-outs are enforced before push provider calls', async () => {
  const policy = validateNotificationPolicy({ timezone: 'Asia/Kolkata', quietHours: { enabled: true, start: '00:00', end: '00:00' } });
  assert.equal(notificationDelivery(policy, 'quote').allowed, false);
  assert.equal(notificationDelivery({ ...policy, quietHours: { ...policy.quietHours, enabled: false } }, 'quote').allowed, true);
  assert.equal(notificationDelivery({ ...policy, disabledTypes: ['quote'] }, 'quote').disabled, true);
  await NotificationPreference.create({ _id: `CUSTOMER:${customer._id}`, ...policy });
  const binding = await PushSubscription.create({ installationId: key(), domain: 'external', ownerId: customer._id, sessionId: new mongoose.Types.ObjectId(), audienceId: customer._id, surface: 'CUSTOMER', token: 'ExponentPushToken[test-fixture]', projectId: 'test', bindingId: key(), enabled: true, boundAt: new Date(), expiresAt: new Date(Date.now() + 86400000) });
  const job = await PushJob.create({ subscription: binding._id, bindingId: binding.bindingId, sourceId: key(), type: 'quote', title: 'Quote', lease: key(), status: 'SENDING', expiresAt: new Date(Date.now() + 86400000) });
  let providerCalls = 0;
  const result = await deliverOne(job.toObject(), { identity: async () => customer, request: async () => { providerCalls++; return [{ status: 'ok', id: 'ticket' }]; } });
  assert.equal(providerCalls, 0); assert.equal(result.lastError, 'QUIET_HOURS');
  await NotificationPreference.updateOne({ _id: `CUSTOMER:${customer._id}` }, { $set: { 'quietHours.enabled': false } });
  const sent = await deliverOne(job.toObject(), { identity: async () => customer, request: async () => { providerCalls++; return [{ status: 'ok', id: 'ticket' }]; } });
  assert.equal(providerCalls, 1); assert.equal(sent.status, 'RECEIPT');
});

test('customer reminders are owned, persisted and delivered once on retry', async () => {
  const event = await CustomerEvent.create({ customer: customer._id, eventType: 'wedding', title: 'My event', status: 'planning' });
  const row = await CustomerReminder.create({ customer: customer._id, event: event._id, title: 'Review photography', dueAt: new Date(Date.now() - 1000), idempotencyKey: key() });
  await runReminderBatch();
  await CustomerReminder.updateOne({ _id: row._id }, { $set: { status: 'PENDING' } });
  await runReminderBatch();
  assert.equal(await CustomerNotification.countDocuments({ idempotencyKey: `reminder:${row._id}` }), 1);
  assert.equal((await CustomerReminder.findById(row._id)).status, 'DELIVERED');
});

test('feedback and notification preferences are validated and product outcomes retain empty samples', async () => {
  const event = await CustomerEvent.create({ customer: customer._id, eventType: 'wedding', status: 'draft' });
  await request(app).post('/api/customer/feedback').set(auth(customerToken)).send({ kind: 'EVENT', reference: event._id, score: 4 }).expect(200);
  await request(app).post('/api/customer/feedback').set(auth(customerToken)).send({ kind: 'EVENT', reference: new mongoose.Types.ObjectId(), score: 4 }).expect(404);
  await request(app).put('/api/customer/notification-preferences').set(auth(customerToken)).send({ timezone: 'invalid/timezone' }).expect(400);
  const result = await request(app).get('/api/admin/reports/product-metrics').set(auth(adminToken)).expect(200);
  assert.equal(result.body.metrics.customerSatisfaction.meanScore, 4);
  assert.equal(result.body.metrics.supportLinkReportedOpenRate.percent, null);
  await request(app).get('/api/admin/reports/product-metrics').set(auth(restrictedAdminToken)).expect(403);
});

test('support actions consistently use the configured international number', () => {
  assert.equal(new URL(VENDOR_SUPPORT.whatsapp).pathname, '/919403891095');
  assert.equal(VENDOR_SUPPORT.phone, 'tel:+919403891095');
});

test('production hard-disables developer authentication even when explicitly enabled', async () => {
  assert.equal(devToolsAllowed({ NODE_ENV: 'production', ENABLE_DEV_TOOLS: 'true' }), false);
  const previousMode = process.env.NODE_ENV;
  const previousFlag = process.env.ENABLE_DEV_TOOLS;
  process.env.NODE_ENV = 'production';
  process.env.ENABLE_DEV_TOOLS = 'true';
  try {
    await request(app).post('/api/admin/auth/dev-auth').send({ email: 'admin@starvnt.com' }).expect(404);
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
    if (previousFlag === undefined) delete process.env.ENABLE_DEV_TOOLS; else process.env.ENABLE_DEV_TOOLS = previousFlag;
  }
});

test('Razorpay webhook requires a raw-body signature and deduplicates provider event IDs', async () => {
  const previousSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret-only';
  try {
    const rawBody = Buffer.from(JSON.stringify({
      id: 'evt-isolation-fixture',
      event: 'payment.captured',
      payload: { payment: { entity: { order_id: 'order-not-in-test-db', id: 'pay-test' } } },
    }));
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    const invalid = await request(app).post('/api/webhooks/razorpay').set('Content-Type', 'application/json').set('x-razorpay-signature', 'invalid').send(rawBody.toString('utf8')).expect(400);
    assert.equal(invalid.body.error, 'INVALID_SIGNATURE');

    const accepted = await request(app).post('/api/webhooks/razorpay').set('Content-Type', 'application/json').set('x-razorpay-signature', signature).set('x-razorpay-event-id', 'evt-isolation-fixture').send(rawBody.toString('utf8'));
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.ignored, true);
    const duplicate = await request(app).post('/api/webhooks/razorpay').set('Content-Type', 'application/json').set('x-razorpay-signature', signature).set('x-razorpay-event-id', 'evt-isolation-fixture').send(rawBody.toString('utf8')).expect(200);
    assert.equal(duplicate.body.duplicate, true);
  } finally {
    if (previousSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousSecret;
  }
});

test('vendor business goals are validated, capped, progress from Core truth, and isolated by owner', async () => {
  const badPeriod = await request(app).post('/api/vendor/goals').set(auth(vendorToken)).send({
    name: 'Complete bookings', metric: 'COMPLETED_BOOKINGS', targetValue: 2,
    startDate: '2026-02-30', endDate: '2026-03-10',
  }).expect(400);
  assert.equal(badPeriod.body.error, 'INVALID_GOAL_PERIOD');

  await CoreBooking.create({
    vendorId: vendor._id,
    customerId: customer._id,
    serviceName: 'Goal test booking',
    eventDate: '2026-10-15',
    totalAmount: 2500,
    bookingStatus: 'CONFIRMED',
    executionStatus: 'COMPLETION_VERIFIED',
    validationAudit: { verifiedBy: 'CORE_ADMIN', verifiedAt: new Date('2026-10-15T12:00:00.000Z'), notes: 'Fixture only' },
  });
  const goalService = await VendorService.create({ vendor: vendor._id, name: 'Goal quote service', category: 'Photography', pricing: { basePrice: 1000 } });
  await Quote.create({
    vendor: vendor._id,
    customer: customer._id,
    vendorService: goalService._id,
    serviceName: 'Goal quote',
    eventDate: '2026-10-20',
    status: 'REJECTED',
    pricingBreakdown: { basePrice: 1000, totalAmount: 1000 },
    history: [
      { fromStatus: 'DRAFT', toStatus: 'SUBMITTED', changedBy: 'VENDOR', timestamp: new Date('2026-10-10T12:00:00.000Z') },
      { fromStatus: 'SUBMITTED', toStatus: 'REJECTED', changedBy: 'CUSTOMER', timestamp: new Date('2026-10-11T12:00:00.000Z') },
    ],
  });

  const goalData = (name) => ({
    name, metric: 'COMPLETED_BOOKINGS', targetValue: 2,
    startDate: '2026-10-01', endDate: '2026-10-31',
  });
  const created = [];
  for (let i = 1; i <= 3; i++) {
    const response = await request(app).post('/api/vendor/goals').set(auth(vendorToken)).send(goalData(`Goal ${i}`)).expect(201);
    created.push(response.body.goal);
  }
  assert.equal(created[0].currentValue, 1);
  assert.equal(created[0].progressPercent, 50);
  await request(app).patch(`/api/vendor/goals/${created[0].id}`).set(auth(vendorToken)).send({ status: 'COMPLETED' }).expect(409);
  await request(app).post('/api/vendor/goals').set(auth(vendorToken)).send(goalData('Goal 4')).expect(409);

  await request(app).patch(`/api/vendor/goals/${created[0].id}`).set(auth(vendorToken)).send({ status: 'PAUSED' }).expect(200);
  const fourth = await request(app).post('/api/vendor/goals').set(auth(vendorToken)).send({ ...goalData('Goal 4'), metric: 'SUBMITTED_QUOTES', targetValue: 1 }).expect(201);
  assert.equal(fourth.body.goal.currentValue, 1);
  await request(app).patch(`/api/vendor/goals/${created[0].id}`).set(auth(vendorToken)).send({ status: 'ACTIVE' }).expect(409);

  const otherOwner = await ExternalUser.create({ email: `goal-owner-${key()}@unified.test`, fullName: 'Other Vendor', accountType: 'VENDOR' });
  const otherOrganization = await VendorOrganization.create({ owner: otherOwner._id, businessName: 'Other Vendor Organization' });
  otherOwner.vendorOrganization = otherOrganization._id;
  await otherOwner.save();
  const otherSession = await ExternalSession.create({ user: otherOwner._id, refreshTokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
  const otherToken = signExternalAccessToken(otherOwner, otherSession._id);
  const foreignGoal = await request(app).post('/api/vendor/goals').set(auth(otherToken)).send(goalData('Private goal')).expect(201);

  const ownGoals = await request(app).get('/api/vendor/goals').set(auth(vendorToken)).expect(200);
  assert.equal(ownGoals.body.goals.length, 4);
  assert.ok(!ownGoals.body.goals.some((goal) => goal.id === foreignGoal.body.goal.id));
  await request(app).patch(`/api/vendor/goals/${foreignGoal.body.goal.id}`).set(auth(vendorToken)).send({ status: 'PAUSED' }).expect(404);
  await request(app).delete(`/api/vendor/goals/${foreignGoal.body.goal.id}`).set(auth(vendorToken)).expect(404);

  await request(app).delete(`/api/vendor/goals/${fourth.body.goal.id}`).set(auth(vendorToken)).expect(200);
  const tombstone = await VendorBusinessGoal.findById(fourth.body.goal.id).lean();
  assert.ok(tombstone.deletedAt);
  assert.equal(tombstone.history.at(-1).action, 'DELETED');
  await request(app).get('/api/vendor/goals').set(auth(customerToken)).expect(403);
});

test('vendor APIs isolate another vendor quotes, bookings and enquiry mutations by owner', async () => {
  const otherOwner = await ExternalUser.create({ email: `isolation-${key()}@unified.test`, fullName: 'Isolation Vendor', accountType: 'VENDOR' });
  const otherOrganization = await VendorOrganization.create({ owner: otherOwner._id, businessName: 'Isolation Vendor Organization' });
  otherOwner.vendorOrganization = otherOrganization._id;
  await otherOwner.save();
  const otherSession = await ExternalSession.create({ user: otherOwner._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  const otherToken = signExternalAccessToken(otherOwner, otherSession._id);

  const service = await VendorService.create({ vendor: otherOrganization._id, name: 'Private service', category: 'Photography', pricing: { basePrice: 2500 } });
  const opportunity = await Opportunity.create({
    vendor: otherOrganization._id,
    customer: customer._id,
    vendorService: service._id,
    customerName: 'Private fixture',
    serviceName: service.name,
    eventDate: '2027-11-14',
    status: 'NEW',
  });
  const quote = await Quote.create({
    vendor: otherOrganization._id,
    customer: customer._id,
    vendorService: service._id,
    opportunity: opportunity._id,
    serviceName: service.name,
    eventDate: '2027-11-14',
    status: 'SUBMITTED',
    pricingBreakdown: { basePrice: 2500, totalAmount: 2500 },
  });
  const booking = await CoreBooking.create({
    vendorId: otherOrganization._id,
    customerId: customer._id,
    quoteId: String(quote._id),
    serviceName: service.name,
    eventDate: '2027-11-14',
    totalAmount: 2500,
    bookingStatus: 'CONFIRMED',
  });
  const review = await VendorReview.create({
    vendor: otherOrganization._id,
    customer: customer._id,
    customerName: 'Private review fixture',
    rating: 5,
    reviewText: 'Vendor B private review',
    status: 'PUBLISHED',
  });
  const thread = await VendorMessageThread.create({
    vendor: otherOrganization._id,
    customer: customer._id,
    clientName: 'Private message fixture',
    status: 'ACTIVE',
    unreadVendorCount: 1,
    messages: [{ sender: 'CLIENT', senderName: 'Customer', text: 'Private Vendor B message', isRead: false }],
  });

  const vendorQuotes = await request(app).get('/api/vendor/quotes').set(auth(vendorToken)).expect(200);
  assert.ok(!vendorQuotes.body.quotes.some((item) => String(item._id) === String(quote._id)));
  const genericQuotes = await request(app).get('/api/quotes').set(auth(vendorToken)).expect(200);
  assert.ok(!genericQuotes.body.quotes.some((item) => String(item._id) === String(quote._id)));
  await request(app).get(`/api/quotes/${quote._id}`).set(auth(vendorToken)).expect(404);
  await request(app).post(`/api/quotes/${quote._id}/transition`).set(auth(vendorToken)).send({ targetStatus: 'SUBMITTED' }).expect(404);
  const vendorBookings = await request(app).get('/api/vendor/bookings').set(auth(vendorToken)).expect(200);
  assert.ok(!vendorBookings.body.bookings.some((item) => String(item._id) === String(booking._id)));
  const vendorReviews = await request(app).get('/api/vendor/reviews').set(auth(vendorToken)).expect(200);
  assert.ok(!vendorReviews.body.reviews.some((item) => String(item._id) === String(review._id)));
  const vendorThreads = await request(app).get('/api/vendor/messages/threads').set(auth(vendorToken)).expect(200);
  assert.ok(!vendorThreads.body.threads.some((item) => String(item._id) === String(thread._id)));
  await request(app).get(`/api/vendor/messages/threads/${thread._id}`).set(auth(vendorToken)).expect(404);
  await request(app).post(`/api/vendor/messages/threads/${thread._id}`).set(auth(vendorToken)).send({ text: 'Unauthorized cross-vendor message' }).expect(404);
  await request(app).post(`/api/vendor/reviews/${review._id}/reply`).set(auth(vendorToken)).send({ text: 'Unauthorized cross-vendor reply' }).expect(404);

  await request(app).post(`/api/vendor/opportunities/${opportunity._id}/decline`).set(auth(vendorToken)).send({ reason: 'Wrong vendor scope fixture' }).expect(409);
  assert.equal((await Opportunity.findById(opportunity._id)).status, 'NEW');
  assert.equal((await Quote.findById(quote._id)).status, 'SUBMITTED');
  assert.equal((await CoreBooking.findById(booking._id)).bookingStatus, 'CONFIRMED');
  assert.equal((await VendorReview.findById(review._id)).vendorReply?.text, '');
  const unchangedThread = await VendorMessageThread.findById(thread._id).lean();
  assert.equal(unchangedThread.unreadVendorCount, 1);
  assert.equal(unchangedThread.messages.length, 1);

  assert.ok((await request(app).get('/api/vendor/quotes').set(auth(otherToken)).expect(200)).body.quotes.some((item) => String(item._id) === String(quote._id)));
  assert.ok((await request(app).get('/api/vendor/bookings').set(auth(otherToken)).expect(200)).body.bookings.some((item) => String(item._id) === String(booking._id)));
  assert.ok((await request(app).get('/api/vendor/reviews').set(auth(otherToken)).expect(200)).body.reviews.some((item) => String(item._id) === String(review._id)));
  assert.ok((await request(app).get('/api/vendor/messages/threads').set(auth(otherToken)).expect(200)).body.threads.some((item) => String(item._id) === String(thread._id)));
});

test('first-response dashboard metric is vendor-authenticated, period-bounded and omits message content', async () => {
  await request(app).get('/api/vendor/metrics/first-response?periodDays=31').set(auth(vendorToken)).expect(400);
  const response = await request(app).get('/api/vendor/metrics/first-response?periodDays=30').set(auth(vendorToken)).expect(200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.metrics.periodDays, 30);
  assert.ok(Object.hasOwn(response.body.metrics, 'averageFirstResponseMs'));
  assert.ok(!Object.hasOwn(response.body.metrics, 'messages'));
  assert.ok(!Object.hasOwn(response.body.metrics, 'customerName'));
});

test('vendor review replies are restricted to owned published reviews and cannot be duplicated', async () => {
  const published = await VendorReview.create({ vendor: vendor._id, customer: customer._id, customerName: 'Review fixture', rating: 5, reviewText: 'Good service', status: 'PUBLISHED' });
  const pending = await VendorReview.create({ vendor: vendor._id, customer: customer._id, customerName: 'Pending fixture', rating: 4, reviewText: 'Pending review', status: 'PENDING' });
  await request(app).post(`/api/vendor/reviews/${pending._id}/reply`).set(auth(vendorToken)).send({ text: 'Thanks' }).expect(404);
  const response = await request(app).post(`/api/vendor/reviews/${published._id}/reply`).set(auth(vendorToken)).send({ text: 'Thank you for your feedback.' }).expect(200);
  assert.equal(response.body.review.vendorReply.text, 'Thank you for your feedback.');
  await request(app).post(`/api/vendor/reviews/${published._id}/reply`).set(auth(vendorToken)).send({ text: 'Second reply' }).expect(409);
});

test('vendor opportunity declines require and persist an internal reason', async () => {
  const service = await VendorService.create({ vendor: vendor._id, name: 'Decline reason service', category: 'Photography', pricing: { basePrice: 1000 } });
  const opportunity = await Opportunity.create({
    vendor: vendor._id,
    customer: customer._id,
    vendorService: service._id,
    serviceName: service.name,
    eventDate: '2027-08-10',
    status: 'NEW',
  });
  const url = `/api/vendor/opportunities/${opportunity._id}/decline`;
  await request(app).post(url).set(auth(vendorToken)).send({}).expect(400);
  const response = await request(app).post(url).set(auth(vendorToken)).send({ reason: 'Unavailable on the event date.' }).expect(200);
  assert.equal(response.body.declineReason, 'Unavailable on the event date.');
  const saved = await Opportunity.findById(opportunity._id).lean();
  assert.equal(saved.status, 'DECLINED');
  assert.equal(saved.declineReason, 'Unavailable on the event date.');
  assert.ok(saved.declinedAt);
});
