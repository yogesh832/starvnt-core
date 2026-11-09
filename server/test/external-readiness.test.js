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
import { VendorService } from '../src/external/models/VendorService.js';
import { VendorCapability } from '../src/external/models/VendorCapability.js';
import { VendorAuraSession, VendorAuraMessage } from '../src/external/models/VendorAura.js';
import { registerLlmAdapter } from '../src/external/aura/llmAdapter.js';
import { VendorResource } from '../src/external/models/VendorResource.js';
import { VendorFinancialProfile } from '../src/external/models/VendorFinancialProfile.js';
import { OperatingLocation } from '../src/external/models/OperatingLocation.js';
import { ServiceCoverage } from '../src/external/models/ServiceCoverage.js';
import { PortfolioItem } from '../src/external/models/PortfolioItem.js';
import { VendorBlockout } from '../src/external/models/VendorBlockout.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { evaluateVendorActivation } from '../src/external/services/vendorActivation.service.js';
import { listBookableServices, findBookableService } from '../src/customer/repositories/catalog.repo.js';
import { serviceMatchingEligible } from '../src/common/vendorReadiness.js';
import { validateExternalAttachment } from '../src/external/routes/externalBookings.routes.js';
import { checkTrueAvailability } from '../src/external/services/availability.service.js';
import { distanceEvidence } from '../src/external/utils/geo.js';
import { calculateValidatedTotalCost } from '../src/external/services/totalCost.service.js';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { sanitizeDiscoveryVideo } from '../src/experience/discoveryMedia.js';
import { DiscoveryProject, DiscoveryPreference, DiscoveryInteraction, VendorRewardRule, VendorAchievement, VendorBenefit, VendorRedemption, VendorChallenge, VendorChallengeAward } from '../src/experience/discoveryRewards.models.js';
import { runDiscoveryNotificationBatch } from '../src/experience/discoveryNotifications.worker.js';
import { setConsent, CUSTOMER_NOTICE } from '../src/foundation/consent.service.js';
import { CustomerNotification, CustomerEvent } from '../src/customer/models/index.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { NotificationPreference } from '../src/notifications/preferences.models.js';
import { Notification } from '../src/external/models/Notification.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { AdminSession } from '../src/admin/models/AdminSession.js';
import { signAdminAccessToken } from '../src/admin/utils/tokens.js';

import { GrowthMeeting, MeetingParticipation } from '../src/learning/meetingModels.js';

let app, mongo;
const id = () => new mongoose.Types.ObjectId(), key = () => crypto.randomUUID();
const auth = token => ({ Authorization: `Bearer ${token}` });
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('external_readiness')), adminConn.openUri(mongo.getUri('external_readiness_admin'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(m => m.init()));
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); if (mongo) await mongo.stop(); });
async function fixture() {
  const owner = await ExternalUser.create({ fullName: 'Vendor owner', email: `${key()}@example.test`, accountType: 'VENDOR' });
  const vendor = await VendorOrganization.create({ owner: owner._id, ownerIdentityKey: owner._id, businessName: `Business ${key()}`, category: 'Photography', location: 'Pune', isProfileCompleted: true, status: 'ACTIVE', isCommerciallyActive: true, activationReview: { status: 'APPROVED' } });
  owner.vendorOrganization = vendor._id; await owner.save();
  const session = await ExternalSession.create({ user: owner._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  const token = signExternalAccessToken(owner, session._id);
  const resource = await VendorResource.create({ vendor: vendor._id, name: 'Camera pool', type: 'EQUIPMENT', capacityUnits: 3 });
  const service = await VendorService.create({ vendor: vendor._id, name: 'Event photos', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 1000 }, requiredResourceIds: [resource._id] });
  await VendorCapability.create({ vendor: vendor._id, vendorService: service._id, teamSize: 3, simultaneousEventLimit: 5 });
  const location = await OperatingLocation.create({ vendor: vendor._id, label: 'Private home base', address: 'Sensitive home address', city: 'Pune', coordinates: { lat: 18.52, lng: 73.85 }, isPrimary: true });
  await ServiceCoverage.create({ vendor: vendor._id, vendorService: service._id, coverageType: 'CITY', city: 'Pune' });
  await VendorFinancialProfile.create({ vendor: vendor._id, pan: { verificationStatus: 'VERIFIED', legalName: 'Verified Legal Name' }, bankAccount: { verificationStatus: 'VERIFIED' } });
  await PortfolioItem.create({ vendor: vendor._id, mediaType: 'IMAGE', url: 'https://example.test/public.jpg', status: 'PUBLISHED', visibility: 'PUBLIC' });
  return { owner, vendor, service, resource, location, token };
}
function body(f, extra = {}) {
  return { date: '2027-08-01', allDay: false, startTime: '10:00', endTime: '12:00', timezone: 'Asia/Kolkata', scope: 'SERVICE', vendorService: String(f.service._id), reason: 'External customer booking', idempotencyKey: key(), external: { customerName: 'Private client', customerPhone: '+919987650000', location: 'Client venue' },
    externalBooking: { acquisitionChannel: 'WHATSAPP', lifecycle: 'CONFIRMED', totalAmount: 1000, lineItems: [{ service: String(f.service._id), name: 'Snapshot', quantity: 1, unitPrice: 1000 }], nextPaymentDueAt: new Date(Date.now() - 3600000).toISOString() }, ...extra };
}
async function create(f, data = body(f)) {
  const res = await request(app).post('/api/vendor/external-bookings').set(auth(f.token)).send(data).expect(201);
  return res.body.booking;
}

test('Vendor Aura carries a standalone team size into the Hindi equipment reply and saves only after confirmation', async () => {
  const f = await fixture();
  const sessionId = key();
  const send = message => request(app).post('/api/vendor/aura/chat').set(auth(f.token)).send({ sessionId, message }).expect(200);
  const read = () => VendorCapability.findOne({ vendor: f.vendor._id, vendorService: f.service._id }).lean();
  const first = await send('Complete capacity, resources and coverage for the same active service');
  assert.match(first.body.reply, /team size/i);
  await send('you add this');
  const team = await send('15');
  assert.match(team.body.reply, /15/);
  assert.match(team.body.reply, /equipment/i);
  assert.equal(team.body.pending, null);
  const gear = await send('मेरे पास मेरा दो Sony के कैमरे हैं।');
  assert.equal(gear.body.pending.kind, 'capability');
  assert.match(gear.body.pending.summary, /15.*दो Sony के कैमरे/);
  assert.equal((await read()).teamSize, 3);
  const saved = await send('हाँ');
  assert.equal(saved.body.pending, null);
  assert.equal((await read()).teamSize, 15);
  assert.equal((await read()).simultaneousEventLimit, 5);
  assert.deepEqual((await read()).equipment, ['दो Sony के कैमरे']);
});

test('Vendor Aura resumes the repeated-team-size exchange and asks which active service to update', async () => {
  const f = await fixture();
  const second = await VendorService.create({
    vendor: f.vendor._id, name: 'Studio portraits', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 1000 },
  });
  await VendorResource.updateOne({ _id: f.resource._id }, { $set: { status: 'MAINTENANCE' } });
  const sessionId = key();
  await VendorAuraSession.create({ _id: sessionId, vendor: f.vendor._id, user: f.owner._id, language: 'hi' });
  await VendorAuraMessage.insertMany([
    ['model', 'Please tell me your team size and equipment details so I can set them up for you.'],
    ['user', '15'],
    ['model', 'Got it, team size is 15. What equipment do you use for your photography services?'],
    ['user', 'और ये देखवा के'],
    ['model', 'मैंने 15 सदस्यों की टीम नोट कर ली है। अब कृपया अपने मुख्य उपकरण (Equipment) जैसे कैमरे, ड्रोन या लेंस की जानकारी दें। अभी your team size चाहिए। कृपया बताइए।'],
    ['user', 'मेरे पास मेरा दो Sony के कैमरे हैं।'],
    ['model', 'समझ गई। अभी your team size चाहिए। कृपया बताइए।'],
  ].map(([role, content], index) => ({ session: sessionId, role, content, createdAt: new Date(1000 + index) })));
  const send = message => request(app).post('/api/vendor/aura/chat').set(auth(f.token)).send({ sessionId, message }).expect(200);
  const response = await send('15 मैंने पहले ही बता दिया।');
  assert.equal(response.body.pending, null);
  assert.match(response.body.reply, /Event photos.*Studio portraits|Studio portraits.*Event photos/);
  const selected = await send('Studio portraits');
  assert.match(selected.body.pending.summary, /Studio portraits.*15.*Sony/);
  const confirmed = await send('yes');
  assert.equal(confirmed.body.actions.some(action => action.to === '/vendor/readiness'), true);
  const other = await VendorCapability.findOne({ vendor: f.vendor._id, vendorService: second._id }).lean();
  assert.equal(other.teamSize, 15);
  assert.deepEqual(other.equipment, ['दो Sony के कैमरे']);
  assert.equal((await VendorCapability.findOne({ vendorService: f.service._id }).lean()).teamSize, 3);
});

test('Vendor Aura understands shorthand and uses AI to interpret service choices in the vendor’s language', async t => {
  const f = await fixture();
  const wedding = 'Wedding Photography & Cinematic Video';
  const preWedding = 'Pre-Wedding & Pahadi Concept Shoot';
  await VendorService.updateOne({ _id: f.service._id }, { $set: { name: wedding } });
  const second = await VendorService.create({
    vendor: f.vendor._id, name: preWedding, category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 1000 },
  });
  const inactive = await VendorService.create({
    vendor: f.vendor._id, name: 'Wedding ceremony archive', category: 'Photography', status: 'PAUSED', pricing: { basePrice: 1000 },
  });
  const interpreted = [];
  registerLlmAdapter({
    async chat({ message }) {
      const choice = JSON.parse(message);
      interpreted.push(choice);
      const serviceName = choice.reply === 'शादी की रस्मों वाला' ? wedding : inactive.name;
      return { setupAction: { kind: 'capability', capability: { serviceName, teamSize: 99, equipment: ['Unverified gear'] } } };
    },
  });
  t.after(() => registerLlmAdapter(null));

  const start = async ({ legacyPrompt = false } = {}) => {
    const sessionId = key();
    const send = message => request(app).post('/api/vendor/aura/chat').set(auth(f.token)).send({ sessionId, message }).expect(200);
    await send('Complete capacity, resources and coverage for the same active service');
    await send('15');
    const choice = await send('मेरे पास मेरा दो Sony के कैमरे हैं।');
    assert.equal(choice.body.pending, null);
    assert.ok(choice.body.reply.includes(wedding));
    assert.ok(choice.body.reply.includes(preWedding));
    if (legacyPrompt) {
      await VendorAuraMessage.updateOne(
        { session: sessionId, role: 'model', content: choice.body.reply },
        { $set: { content: 'समझ गई। अभी the active service name चाहिए। कृपया बताइए।' } },
      );
    }
    return send;
  };

  for (const reply of ['photography', 'wedding photography', 'Film cinematic video वाली।']) {
    const send = await start({ legacyPrompt: reply.startsWith('Film') });
    const selected = await send(reply);
    assert.equal(selected.body.pending.kind, 'capability');
    assert.match(selected.body.pending.summary, /Wedding Photography & Cinematic Video.*15.*Sony/);
  }
  assert.deepEqual(interpreted, []);

  const send = await start();
  const ambiguous = await send('wedding');
  assert.equal(ambiguous.body.pending, null);
  const invalid = await send('पुरानी रस्मों वाला');
  assert.equal(invalid.body.pending, null);
  assert.equal(interpreted[0].reply, 'पुरानी रस्मों वाला');
  assert.deepEqual(interpreted[0].choices.map(choice => choice.name).sort(), [wedding, preWedding].sort());
  const selected = await send('शादी की रस्मों वाला');
  assert.equal(selected.body.pending.kind, 'capability');
  assert.match(selected.body.pending.summary, /Wedding Photography & Cinematic Video.*15.*Sony/);
  assert.equal(interpreted[1].reply, 'शादी की रस्मों वाला');
  assert.equal((await VendorCapability.findOne({ vendorService: f.service._id }).lean()).teamSize, 3);
  assert.equal(await VendorCapability.countDocuments({ vendorService: second._id }), 0);
  await send('हाँ');
  const saved = await VendorCapability.findOne({ vendorService: f.service._id }).lean();
  assert.equal(saved.teamSize, 15);
  assert.deepEqual(saved.equipment, ['दो Sony के कैमरे']);
});

test('external intake persists private source, service quantities, overdue contract balance and server actor, without a Core contract', async () => {
  const f = await fixture(), input = body(f);
  input.externalBooking.acquisitionChannel = 'JUSTDIAL'; input.externalBooking.eventName = 'Client celebration'; input.vendor = id(); input.actor = 'spoofed';
  const row = await create(f, input);
  assert.equal(row.vendor, String(f.vendor._id)); assert.equal(row.externalBooking.acquisitionChannel, 'JUSTDIAL'); assert.equal(row.externalBooking.lineItems[0].name, f.service.name);
  assert.equal(row.financials.overdue, true); assert.equal(row.history[0].actor, String(f.owner._id));
  assert.equal(await CoreBooking.countDocuments({ vendorId: f.vendor._id }), 0);
  const replay = await create(f, input); assert.equal(replay._id, row._id);
  await request(app).post('/api/vendor/external-bookings').set(auth(f.token)).send({ ...input, externalBooking: { ...input.externalBooking, totalAmount: 2000 } }).expect(409);
});

test('external create/list/detail/money/attachments are tenant isolated and require vendor authentication', async () => {
  const f = await fixture(), other = await fixture(), row = await create(f);
  await request(app).get('/api/vendor/external-bookings').expect(401);
  await request(app).get(`/api/vendor/external-bookings/${row._id}`).set(auth(other.token)).expect(404);
  await request(app).post(`/api/vendor/external-bookings/${row._id}/refunds`).set(auth(other.token)).send({ amount: 1, method: 'CASH', receivedAt: new Date().toISOString(), reason: 'Test', idempotencyKey: key() }).expect(404);
  const list = await request(app).get('/api/vendor/external-bookings').set(auth(other.token)).expect(200); assert.equal(list.body.bookings.length, 0);
});

test('receipts and refunds are replay-safe, cent-accurate, bounded and excluded from STARVNT financial truth', async () => {
  const f = await fixture(), row = await create(f);
  const receipt = { amount: 300.25, method: 'UPI', receivedAt: new Date(Date.now() - 1000).toISOString(), reference: 'Direct receipt', idempotencyKey: key() };
  await request(app).post(`/api/vendor/external-bookings/${row._id}/receipts`).set(auth(f.token)).send(receipt).expect(200);
  await request(app).post(`/api/vendor/external-bookings/${row._id}/receipts`).set(auth(f.token)).send(receipt).expect(200);
  const refund = { ...receipt, amount: 100.10, reason: 'Scope reduced', idempotencyKey: key() };
  const r = await request(app).post(`/api/vendor/external-bookings/${row._id}/refunds`).set(auth(f.token)).send(refund).expect(200);
  assert.equal(r.body.booking.financials.netReceivedAmount, 200.15); assert.equal(r.body.booking.financials.outstandingAmount, 799.85);
  await request(app).post(`/api/vendor/external-bookings/${row._id}/refunds`).set(auth(f.token)).send({ ...refund, amount: 500, idempotencyKey: key() }).expect(409);
  await request(app).post(`/api/vendor/external-bookings/${row._id}/receipts`).set(auth(f.token)).send({ ...receipt, amount: 800, idempotencyKey: key() }).expect(409);
  const summary = await request(app).get('/api/vendor/external-bookings/financial-summary').set(auth(f.token)).expect(200);
  assert.equal(summary.body.reportedReceivedAmount, 300.25); assert.equal(summary.body.refundedAmount, 100.10); assert.equal(summary.body.excludedFromStarvntRevenue, true);
});

test('contract edits preserve receipts and source, reject stale versions, and rescheduling is audited', async () => {
  const f = await fixture(), row = await create(f);
  const updated = await request(app).patch(`/api/vendor/external-bookings/${row._id}`).set(auth(f.token)).send({ date: '2027-08-02', endDate: '2027-08-02', revision: row.revision, idempotencyKey: key(), externalBooking: { totalAmount: 1500 } }).expect(200);
  assert.equal(updated.body.booking.history.at(-1).action, 'RESCHEDULED'); assert.equal(updated.body.booking.externalBooking.totalAmount, 1500);
  await request(app).patch(`/api/vendor/external-bookings/${row._id}`).set(auth(f.token)).send({ revision: 0, idempotencyKey: key(), externalBooking: { totalAmount: 1600 } }).expect(409);
  await request(app).patch(`/api/vendor/external-bookings/${row._id}`).set(auth(f.token)).send({ revision: 1, idempotencyKey: key(), externalBooking: { acquisitionChannel: 'DIRECT' } }).expect(409);
});

test('resource allocation counts units and catalogue dependencies, not just booking count', async () => {
  const f = await fixture();
  const input = body(f); input.externalBooking.lineItems[0].quantity = 2;
  const row = await create(f, input); assert.equal(row.externalBooking.allocations[0].units, 2);
  const input2 = body(f); input2.externalBooking.lineItems[0].quantity = 2;
  await request(app).post('/api/vendor/external-bookings').set(auth(f.token)).send(input2).expect(409);
  assert.equal((await checkTrueAvailability({ vendorId: f.vendor._id, vendorServiceId: f.service._id, date: '2027-08-01', allDay: false, startTime: '10:30', endTime: '11:00' })).feasible, true);
});

test('setup/teardown/travel buffers reserve capacity and confirmation cannot override a platform booking', async () => {
  const f = await fixture(), input = body(f); input.externalBooking.buffers = { setupMinutes: 30, teardownMinutes: 10, travelBeforeMinutes: 0, travelAfterMinutes: 20 };
  await create(f, input);
  const before = await checkTrueAvailability({ vendorId: f.vendor._id, vendorServiceId: f.service._id, date: '2027-08-01', allDay: false, startTime: '09:40', endTime: '09:50', requestedResources: [f.resource._id], requestedResourceUnits: { [f.resource._id]: 3 } });
  assert.equal(before.feasible, false);
  await VendorCapability.updateOne({ vendor: f.vendor._id }, { $set: { simultaneousEventLimit: 1 } });
  await CoreBooking.create({ vendorId: f.vendor._id, vendorService: f.service._id, customerId: id(), serviceName: 'Platform contract', eventDate: '2027-08-03', totalAmount: 1000, bookingStatus: 'CONFIRMED', paymentStatus: 'PAYMENT_VERIFIED' });
  const enquiry = await create(f, body(f, { date: '2027-08-03', externalBooking: { ...body(f).externalBooking, lifecycle: 'ENQUIRY' } }));
  await request(app).post(`/api/vendor/external-bookings/${enquiry._id}/lifecycle`).set(auth(f.token)).send({ lifecycle: 'CONFIRMED', revision: enquiry.revision, reason: 'Client confirmed', idempotencyKey: key() }).expect(409);
});

test('full enquiry-to-completion lifecycle persists and completed work does not reserve future capacity', async () => {
  const f = await fixture(); let row = await create(f, body(f, { externalBooking: { ...body(f).externalBooking, lifecycle: 'ENQUIRY' } }));
  for (const lifecycle of ['NEGOTIATION', 'QUOTE_SENT', 'ON_HOLD', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED']) {
    const response = await request(app).post(`/api/vendor/external-bookings/${row._id}/lifecycle`).set(auth(f.token)).send({ lifecycle, revision: row.revision, reason: `Move to ${lifecycle}`, idempotencyKey: key(), ...(lifecycle === 'ON_HOLD' ? { holdExpiresAt: new Date(Date.now() + 60000).toISOString() } : {}) }).expect(200);
    row = response.body.booking;
  }
  assert.equal((await checkTrueAvailability({ vendorId: f.vendor._id, date: '2027-08-01', allDay: true })).feasible, true);
  await request(app).patch(`/api/vendor/external-bookings/${row._id}`).set(auth(f.token)).send({ date: '2027-08-02', endDate: '2027-08-02', revision: row.revision, idempotencyKey: key() }).expect(409);
});

test('attachment validation rejects executable/mismatched content and private uploads return only account-bound download metadata', async t => {
  assert.throws(() => validateExternalAttachment({ mimetype: 'application/pdf', buffer: Buffer.from('not a PDF') }, 'INVOICE'));
  const f = await fixture(), other = await fixture(), row = await create(f);
  const old = Object.fromEntries(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].map(k => [k, process.env[k]]));
  Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: 'test-only', CLOUDINARY_API_KEY: 'test-only', CLOUDINARY_API_SECRET: 'test-only' });
  t.after(() => { for (const [k, v] of Object.entries(old)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  let calls = 0;
  t.mock.method(cloudinary.uploader, 'upload', async (_data, options) => { calls++; assert.equal(options.type, 'authenticated'); return { public_id: options.public_id, resource_type: 'raw', format: 'pdf' }; });
  const upload = () => request(app).post(`/api/vendor/external-bookings/${row._id}/attachments`).set(auth(f.token)).field('kind', 'INVOICE').field('idempotencyKey', 'attachment-test-key').attach('file', Buffer.from('%PDF-1.7\nTest'), { filename: 'invoice.pdf', contentType: 'application/pdf' });
  const first = await upload().expect(201); await upload().expect(201); assert.equal(calls, 1);
  const attachment = first.body.booking.externalBooking.attachments[0]; assert.equal(attachment.publicId, undefined);
  await request(app).get(`/api/vendor/external-bookings/${row._id}/attachments/${attachment._id}/download`).set(auth(other.token)).expect(404);
  const download = await request(app).get(`/api/vendor/external-bookings/${row._id}/attachments/${attachment._id}/download`).set(auth(f.token)).expect(200);
  assert.ok(download.body.url.includes('signature=')); assert.ok(new Date(download.body.expiresAt) > new Date());
});

test('readiness keeps profile, verification, operations, activation and marketing separate', async () => {
  const f = await fixture(); let ready = await evaluateVendorActivation(f.vendor._id);
  assert.equal(ready.profileCompletion, 100); assert.equal(ready.operatingReadiness, 'READY'); assert.equal(ready.matchingEligible, true); assert.equal(ready.marketingEligible, false);
  await VendorFinancialProfile.updateOne({ vendor: f.vendor._id }, { $set: { 'bankAccount.verificationStatus': 'NOT_VERIFIED' } });
  ready = await evaluateVendorActivation(f.vendor._id);
  assert.equal(ready.profileCompletion, 100); assert.equal(ready.operatingReadiness, 'READY'); assert.equal(ready.matchingEligible, false); assert.equal(ready.readiness.verificationStatus, 'UNDER_REVIEW');
});

test('growth milestones derive from owned evidence and never confer XP, credits or matching approval', async () => {
  const f = await fixture(), other = await fixture();
  const result = await request(app).get('/api/vendor/growth/evidence').set(auth(f.token)).expect(200);
  assert.equal(result.body.milestones.find(m => m.key === 'COMPLETION').complete, false);
  assert.equal(result.body.xp, null); assert.equal(result.body.credits, null); assert.equal(result.body.rewardsAvailable, false);
  await CoreBooking.create({ vendorId: other.vendor._id, customerId: id(), serviceName: 'Private service', eventDate: '2027-08-01', totalAmount: 1000, bookingStatus: 'CONFIRMED', executionStatus: 'COMPLETION_VERIFIED' });
  assert.equal((await request(app).get('/api/vendor/growth/evidence').set(auth(f.token)).expect(200)).body.completedCoreBookings, 0);
});

test('anonymous discovery only exposes approved sanitized images and withdrawal immediately revokes delivery', async () => {
  const f = await fixture();
  const user = await ExternalUser.create({ fullName: 'Customer', email: `${key()}@example.test`, accountType: 'CUSTOMER' });
  const session = await ExternalSession.create({ user: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  const customerToken = signExternalAccessToken(user, session._id);
  const portfolio = await PortfolioItem.findOne({ vendor: f.vendor._id, visibility: 'PUBLIC' });
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ff0000' } }).jpeg().withMetadata({ exif: { IFD0: { Artist: 'Private vendor' } } }).toBuffer();
  const uploadKey = key();
  const upload = (style = 'Classic') => request(app).post('/api/vendor/discovery/projects').set(auth(f.token)).field('portfolioId', String(portfolio._id)).field('lat', '18.52').field('lng', '73.85').field('category', 'Wedding').field('style', style).field('permission', 'true').field('idempotencyKey', uploadKey).attach('file', image, { filename: 'private-name.jpg', contentType: 'image/jpeg' });
  const submitted = await upload().expect(201); assert.equal((await upload().expect(201)).body.project._id, submitted.body.project._id); await upload('Modern').expect(409);
  await request(app).put('/api/customer/discovery/preferences').set(auth(customerToken)).send({ lat: 18.52, lng: 73.85, radiusKm: 25, place: 'Pune' }).expect(200);
  assert.equal((await request(app).get('/api/customer/discovery/feed').set(auth(customerToken)).expect(200)).body.projects.length, 0);
  const admin = await AdminUser.create({ fullName: 'Media Reviewer', email: `${key()}@example.test`, passwordHash: 'fixture', role: 'ADMIN', permissions: ['discovery.review', 'analytics.read'] });
  const adminSession = await AdminSession.create({ admin: admin._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  const adminToken = signAdminAccessToken(admin, adminSession._id);
  const review = { status: 'APPROVED', reason: 'Rights and visible identity reviewed', identityAndRightsReviewed: true };
  await request(app).post(`/api/admin/discovery-rewards/projects/${submitted.body.project._id}/review`).set(auth(f.token)).send(review).expect(401);
  await request(app).post(`/api/admin/discovery-rewards/projects/${submitted.body.project._id}/review`).set(auth(adminToken)).send({ ...review, identityAndRightsReviewed: false }).expect(400);
  await request(app).post(`/api/admin/discovery-rewards/projects/${submitted.body.project._id}/review`).set(auth(adminToken)).send(review).expect(200);
  const feed = (await request(app).get('/api/customer/discovery/feed').set(auth(customerToken)).expect(200)).body;
  assert.equal(feed.projects.length, 1); assert.equal(JSON.stringify(feed).includes(String(f.vendor._id)), false); assert.equal(JSON.stringify(feed).includes(String(portfolio._id)), false);
  assert.equal(await DiscoveryInteraction.countDocuments({ customer: user._id }), 0);
  await setConsent(user._id, { purpose: 'PERSONALIZATION', channel: 'ALL', status: 'GRANTED', noticeVersion: CUSTOMER_NOTICE.version, revision: 0, idempotencyKey: key() });
  await request(app).get('/api/customer/discovery/feed').set(auth(customerToken)).expect(200);
  await request(app).get('/api/customer/discovery/feed').set(auth(customerToken)).expect(200);
  assert.equal(await DiscoveryInteraction.countDocuments({ customer: user._id, kind: 'VIEW' }), 1);
  const event = await CustomerEvent.create({ customer: user._id, title: 'Inspired event' });
  await request(app).post('/api/customer/discovery/conversions').set(auth(customerToken)).send({ token: feed.projects[0].token, eventId: event._id }).expect(200);
  await Opportunity.create({ vendor: f.vendor._id, customer: user._id, vendorService: f.service._id, customerEvent: event._id, serviceName: 'Photos', eventDate: '2027-08-01' });
  await CoreBooking.create({ vendorId: f.vendor._id, customerId: user._id, customerEvent: event._id, serviceName: 'Photos', eventDate: '2027-08-01', totalAmount: 1000, bookingStatus: 'CONFIRMED' });
  const analytics = (await request(app).get('/api/admin/discovery-rewards/analytics').set(auth(adminToken)).expect(200)).body;
  assert.equal(analytics.metrics.find(m => m.kind === 'VIEW').count, 1); assert.equal(analytics.conversions.eventsWithEnquiry, 1); assert.equal(analytics.conversions.eventsWithConfirmedCoreBooking, 1);
  await setConsent(user._id, { purpose: 'PERSONALIZATION', channel: 'ALL', status: 'WITHDRAWN', noticeVersion: CUSTOMER_NOTICE.version, revision: 1, idempotencyKey: key() });
  assert.equal((await request(app).get('/api/admin/discovery-rewards/analytics').set(auth(adminToken)).expect(200)).body.metrics.some(m => m.kind === 'VIEW'), false);
  assert.equal((await request(app).get('/api/admin/discovery-rewards/analytics').set(auth(adminToken)).expect(200)).body.conversions.attributedEvents, 0);
  const publicToken = feed.projects[0].token;
  const download = await request(app).get(`/api/customer/discovery/media/${publicToken}`).set(auth(customerToken)).expect(200);
  const metadata = await sharp(download.body).metadata(); assert.equal(metadata.exif, undefined);
  await request(app).post(`/api/admin/discovery-rewards/projects/${submitted.body.project._id}/suspend`).set(auth(adminToken)).send({ reason: 'Privacy concern' }).expect(200);
  await request(app).get(`/api/customer/discovery/media/${publicToken}`).set(auth(customerToken)).expect(404);
  await request(app).post(`/api/vendor/discovery/projects/${submitted.body.project._id}/withdraw`).set(auth(f.token)).send({}).expect(200);
  await request(app).get(`/api/customer/discovery/media/${publicToken}`).set(auth(customerToken)).expect(404);
});

test('discovery video re-encodes MP4, strips metadata and audio, and rejects invalid files', async t => {
  if (spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status !== 0 || spawnSync('ffprobe', ['-version'], { windowsHide: true }).status !== 0) return t.skip('ffmpeg and ffprobe are required for the video integration test');
  const generated = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=32x32:r=2:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-metadata', 'title=Private vendor identity', '-c:v', 'libx264', '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(generated.status, 0);
  const sanitized = await sanitizeDiscoveryVideo(generated.stdout);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', 'pipe:0'], { windowsHide: true, input: sanitized });
  assert.equal(probe.status, 0); const metadata = JSON.parse(probe.stdout.toString());
  assert.equal(metadata.streams.some(s => s.codec_type === 'audio'), false); assert.equal(JSON.stringify(metadata).includes('Private vendor identity'), false);
  await assert.rejects(() => sanitizeDiscoveryVideo(Buffer.from('invalid mp4')));
});

test('vendor XP uses active versioned rules, is idempotent, tenant scoped and reverses when evidence disappears', async () => {
  const f = await fixture(), other = await fixture();
  await VendorRewardRule.updateMany({}, { $set: { active: false } });
  await VendorRewardRule.create({ version: key(), values: { VERIFICATION: 20 }, active: true });
  const one = await request(app).get('/api/vendor/rewards').set(auth(f.token)).expect(200);
  assert.equal(one.body.xp, 20); assert.equal(one.body.credits, 0);
  await request(app).get('/api/vendor/rewards').set(auth(f.token)).expect(200);
  assert.equal(await VendorAchievement.countDocuments({ vendor: f.vendor._id, milestone: 'VERIFICATION' }), 1);
  assert.equal(await Notification.countDocuments({ vendor: f.vendor._id, title: 'Achievement earned' }), 1);
  await VendorFinancialProfile.updateOne({ vendor: f.vendor._id }, { $set: { 'bankAccount.verificationStatus': 'NOT_VERIFIED' } });
  assert.equal((await request(app).get('/api/vendor/rewards').set(auth(f.token)).expect(200)).body.xp, 0);
  assert.equal(await VendorAchievement.countDocuments({ vendor: other.vendor._id }), 0);
});

test('nearby inspiration notifications require consent and opt-in, honor frequency and avoid duplicate sends', async () => {
  const f = await fixture(), user = await ExternalUser.create({ fullName: 'Customer', email: `${key()}@example.test`, accountType: 'CUSTOMER' });
  const portfolio = await PortfolioItem.findOne({ vendor: f.vendor._id, visibility: 'PUBLIC' });
  await DiscoveryProject.create({ vendor: f.vendor._id, portfolio: portfolio._id, publicToken: key(), category: 'Wedding', style: 'Classic', point: { type: 'Point', coordinates: [73.85, 18.52] }, image: Buffer.from('fixture'), status: 'APPROVED', consentAt: new Date() });
  const preference = await DiscoveryPreference.create({ customer: user._id, point: { type: 'Point', coordinates: [73.85, 18.52] }, radiusKm: 25, notificationsEnabled: true, notificationCategories: ['Wedding'] });
  assert.equal((await runDiscoveryNotificationBatch()).sent, 0);
  await setConsent(user._id, { purpose: 'PERSONALIZATION', channel: 'ALL', status: 'GRANTED', noticeVersion: CUSTOMER_NOTICE.version, revision: 0, idempotencyKey: key() });
  await NotificationPreference.create({ _id: `CUSTOMER:${user._id}`, timezone: 'Asia/Kolkata', quietHours: { enabled: true, start: '00:00', end: '00:00' } });
  assert.equal((await runDiscoveryNotificationBatch()).sent, 0);
  await NotificationPreference.updateOne({ _id: `CUSTOMER:${user._id}` }, { $set: { 'quietHours.enabled': false } });
  assert.equal((await runDiscoveryNotificationBatch()).sent, 1);
  assert.equal((await runDiscoveryNotificationBatch()).sent, 0);
  assert.equal(await CustomerNotification.countDocuments({ customer: user._id, type: 'personalization' }), 1);
  await DiscoveryPreference.updateOne({ _id: preference._id }, { $set: { notificationsEnabled: false } });
  assert.equal((await runDiscoveryNotificationBatch({ now: new Date(Date.now() + 8 * 86400000) })).sent, 0);
});

test('benefit requests enforce eligibility, deduplicate and require authorized admin review', async () => {
  const f = await fixture(); await VendorRewardRule.updateMany({}, { $set: { active: false } });
  await VendorRewardRule.create({ version: key(), values: { VERIFICATION: 20 }, active: true });
  const benefit = await VendorBenefit.create({ name: 'Portfolio review', minimumXp: 20, active: true });
  await request(app).post(`/api/vendor/rewards/benefits/${benefit._id}/request`).set(auth(f.token)).send({}).expect(202);
  await request(app).post(`/api/vendor/rewards/benefits/${benefit._id}/request`).set(auth(f.token)).send({}).expect(202);
  const redemption = await VendorRedemption.findOne({ vendor: f.vendor._id, benefit: benefit._id }); assert.equal(await VendorRedemption.countDocuments({ vendor: f.vendor._id }), 1);
  const admin = await AdminUser.create({ fullName: 'Reviewer', email: `${key()}@example.test`, passwordHash: 'fixture', role: 'ADMIN', permissions: ['growth.manage'] });
  const session = await AdminSession.create({ admin: admin._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  const adminToken = signAdminAccessToken(admin, session._id);
  await request(app).post(`/api/admin/discovery-rewards/redemptions/${redemption._id}/review`).set(auth(f.token)).send({ status: 'APPROVED', reason: 'Eligible' }).expect(401);
  await VendorFinancialProfile.updateOne({ vendor: f.vendor._id }, { $set: { 'bankAccount.verificationStatus': 'NOT_VERIFIED' } });
  await request(app).post(`/api/admin/discovery-rewards/redemptions/${redemption._id}/review`).set(auth(adminToken)).send({ status: 'APPROVED', reason: 'Eligible' }).expect(409);
  assert.equal((await VendorRedemption.findById(redemption._id)).status, 'REQUESTED');
});

test('challenge XP requires a dated Core verification, does not reuse a booking and reverses on cancellation', async () => {
  const f = await fixture(); await VendorRewardRule.updateMany({}, { $set: { active: false } });
  const start = new Date(Date.now() - 60000), end = new Date(Date.now() + 60000);
  const challenge = await VendorChallenge.create({ name: 'Verified event', start, end, xp: 10 });
  const second = await VendorChallenge.create({ name: 'Another event', start, end, xp: 10 });
  const check = c => request(app).post(`/api/vendor/rewards/challenges/${c._id}/check`).set(auth(f.token)).send({});
  await check(challenge).expect(409);
  const booking = await CoreBooking.create({ vendorId: f.vendor._id, customerId: id(), serviceName: 'Photos', eventDate: '2027-08-01', totalAmount: 1000, bookingStatus: 'CONFIRMED', executionStatus: 'COMPLETION_VERIFIED', validationAudit: { verifiedAt: new Date(), verifiedBy: 'CORE' } });
  assert.equal((await check(challenge).expect(200)).body.xp, 10); await check(challenge).expect(200); await check(second).expect(409);
  assert.equal(await VendorChallengeAward.countDocuments({ vendor: f.vendor._id }), 1);
  await CoreBooking.updateOne({ _id: booking._id }, { $set: { bookingStatus: 'CANCELLED' } });
  const rewards = await request(app).get('/api/vendor/rewards').set(auth(f.token)).expect(200);
  assert.equal(rewards.body.xp, 0); assert.equal(rewards.body.challengeAwards[0].state, 'REVERSED');
});

test('capacity on one service and coverage on another cannot manufacture operating readiness', async () => {
  const f = await fixture();
  await ServiceCoverage.deleteMany({ vendor: f.vendor._id });
  const second = await VendorService.create({ vendor: f.vendor._id, name: 'Video', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 1000 } });
  await ServiceCoverage.create({ vendor: f.vendor._id, vendorService: second._id, coverageType: 'CITY', city: 'Pune' });
  const ready = await evaluateVendorActivation(f.vendor._id);
  assert.equal(ready.operatingReadiness, 'INCOMPLETE'); assert.equal(ready.matchingEligible, false); assert.equal(ready.commercialReadiness, false);
});

test('an incomplete second service is excluded even when the vendor has another fully ready service', async () => {
  const f = await fixture();
  const second = await VendorService.create({ vendor: f.vendor._id, name: 'Incomplete second service', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 500 } });
  const ready = await evaluateVendorActivation(f.vendor._id); assert.equal(ready.matchingEligible, true); assert.equal(serviceMatchingEligible(ready, second._id), false);
  assert.equal(await findBookableService(second._id), null);
  const catalogue = await listBookableServices({ city: 'Pune' }); assert.equal(catalogue.some(r => String(r.service._id) === String(second._id)), false);
});

test('disabled owners, invalid resource dependencies and inactive locations cannot pass matching', async () => {
  const f = await fixture();
  await ExternalUser.updateOne({ _id: f.owner._id }, { $set: { status: 'DISABLED' } });
  assert.equal((await evaluateVendorActivation(f.vendor._id)).matchingEligible, false);
  await ExternalUser.updateOne({ _id: f.owner._id }, { $set: { status: 'ACTIVE' } });
  await VendorResource.updateOne({ _id: f.resource._id }, { $set: { status: 'MAINTENANCE' } });
  assert.equal((await evaluateVendorActivation(f.vendor._id)).operatingReadiness, 'INCOMPLETE');
  await VendorResource.updateOne({ _id: f.resource._id }, { $set: { status: 'AVAILABLE' } });
  await OperatingLocation.updateOne({ _id: f.location._id }, { $set: { operatingStatus: 'INACTIVE' } });
  assert.equal((await evaluateVendorActivation(f.vendor._id)).matchingEligible, false);
});

test('missing map coordinates and explicitly closed hours cannot pass operating readiness', async () => {
  const f = await fixture();
  await OperatingLocation.updateOne({ _id: f.location._id }, { $set: { coordinates: { lat: 0, lng: 0 } } });
  assert.equal((await evaluateVendorActivation(f.vendor._id)).operatingReadiness, 'INCOMPLETE');
  await OperatingLocation.updateOne({ _id: f.location._id }, { $set: { coordinates: { lat: 18.52, lng: 73.85 } } });
  await VendorOrganization.updateOne({ _id: f.vendor._id }, { $set: { workingHours: { Monday: { isOpen: false, hours: '9 AM - 7 PM' } } } });
  assert.equal((await evaluateVendorActivation(f.vendor._id)).matchingEligible, false);
});

test('retired equipment does not prevent closing historical external work and releasing its capacity', async () => {
  const f = await fixture(); let row = await create(f);
  await VendorResource.updateOne({ _id: f.resource._id }, { $set: { status: 'MAINTENANCE' } });
  const res = await request(app).post(`/api/vendor/external-bookings/${row._id}/lifecycle`).set(auth(f.token)).send({ lifecycle: 'CANCELLED', revision: row.revision, reason: 'Customer cancelled', idempotencyKey: key() }).expect(200);
  assert.equal(res.body.booking.externalBooking.lifecycle, 'CANCELLED');
  assert.equal((await checkTrueAvailability({ vendorId: f.vendor._id, date: row.date, allDay: true })).feasible, true);
});

test('public catalogue hides private base coordinates, address and private portfolio while owner can explicitly share an exact base', async () => {
  const f = await fixture();
  await PortfolioItem.create({ vendor: f.vendor._id, mediaType: 'IMAGE', visibility: 'PRIVATE', status: 'PUBLISHED', url: 'https://example.test/private-asset.jpg' });
  const found = await findBookableService(f.service._id); assert.equal(found.matchedLocation.address, ''); assert.equal(found.matchedLocation.coordinates, null);
  const catalogue = await listBookableServices({ city: 'Pune' }); const own = catalogue.find(r => String(r.service._id) === String(f.service._id));
  assert.equal(JSON.stringify(own).includes('private-asset'), false); assert.equal(JSON.stringify(own).includes('Sensitive home address'), false);
  await request(app).put(`/api/vendor/locations/${f.location._id}`).set(auth(f.token)).send({ publicVisibility: 'EXACT', actor: 'spoofed' }).expect(200);
  assert.equal((await findBookableService(f.service._id)).matchedLocation.address, 'Sensitive home address');
  const stored = await OperatingLocation.findById(f.location._id); assert.equal(stored.history.at(-1).actor, String(f.owner._id));
});

test('anonymous portfolio returns only published public items even with visibility and status overrides', async () => {
  const f = await fixture();
  const rows = await PortfolioItem.create([
    { visibility: 'PRIVATE', status: 'PUBLISHED' },
    { visibility: 'UNLISTED', status: 'PUBLISHED' },
    { visibility: 'PUBLIC', status: 'VENDOR_REVIEW' },
  ].map((record, index) => ({
    ...record, vendor: f.vendor._id, mediaType: 'IMAGE', url: `https://example.test/restricted-${index}.jpg`,
  })));
  const response = await request(app).get(`/api/vendors/${f.vendor._id}/portfolio`)
    .query({ visibility: 'PRIVATE', status: 'VENDOR_REVIEW' }).expect(200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.body.items.map(item => item.url), ['https://example.test/public.jpg']);
  const owned = await request(app).get('/api/vendor/portfolio').set(auth(f.token)).expect(200);
  assert.ok(rows.every(row => owned.body.items.some(item => item._id === String(row._id))));
  await PortfolioItem.updateMany({ vendor: f.vendor._id, visibility: 'PUBLIC' }, { $set: { visibility: 'PRIVATE' } });
  const withdrawn = await request(app).get(`/api/vendors/${f.vendor._id}/portfolio`).expect(200);
  assert.equal(withdrawn.body.count, 0);
});

test('public vendor identity is owner-scoped and share QR follows current publication', async t => {
  const origin = process.env.STARVNT_VENDOR_PUBLIC_ORIGIN;
  process.env.STARVNT_VENDOR_PUBLIC_ORIGIN = 'https://starvnt.example';
  t.after(() => {
    if (origin === undefined) delete process.env.STARVNT_VENDOR_PUBLIC_ORIGIN;
    else process.env.STARVNT_VENDOR_PUBLIC_ORIGIN = origin;
  });
  const f = await fixture();
  const other = await fixture();
  const endpoint = '/api/vendor/profile/social-links';
  const profile = `/api/vendors/${f.vendor._id}/public-profile`;
  const update = (value, token = f.token) => request(app).put(endpoint).set(auth(token)).send(value);
  const shareQr = () => request(app).post('/api/vendor/profile/share-qr').set(auth(f.token));
  await request(app).get(profile).expect(404);
  await request(app).get(endpoint).expect(401);
  await shareQr().expect(404);
  for (const url of ['javascript:alert(1)', 'https://instagram.com.evil.test/cedar', 'https://instagram.com@evil.test/cedar', 'https://instagram.com/p/abc', 'https://instagram.com/acc%6funts']) {
    await update({ revision: 0, publishProfile: false, links: [{ platform: 'instagram', url, public: true }] }).expect(400);
  }
  const instagram = 'https://www.instagram.com/cedar.studio/?igsh=fixture';
  const links = [
    { platform: 'instagram', url: instagram, public: true },
    { platform: 'youtube', url: 'https://www.youtube.com/@cedar-studio', public: false },
  ];
  await update({ revision: 0, publishProfile: true, links, vendorId: other.vendor._id }).expect(200);
  const otherSettings = await request(app).get(endpoint).set(auth(other.token)).expect(200);
  assert.deepEqual(otherSettings.body.links, []);
  await update({ revision: 0, publishProfile: false, links: [] }).expect(409);
  const result = await request(app).get(profile).expect(200);
  assert.deepEqual(result.body, {
    name: f.vendor.businessName, category: 'Photography',
    socialLinks: [{ platform: 'instagram', label: 'Instagram', url: instagram }],
  });
  const qr = await shareQr().expect(200);
  assert.equal(qr.body.url, `https://starvnt.example/vendors/${f.vendor._id}`);
  assert.match(qr.body.qrDataUrl, /^data:image\/png;base64,/);
  await ExternalUser.updateOne({ _id: f.owner._id }, { $set: { status: 'SUSPENDED' } });
  await request(app).get(profile).expect(404);
  await ExternalUser.updateOne({ _id: f.owner._id }, { $set: { status: 'ACTIVE' } });
  await update({ revision: 1, publishProfile: false, links }).expect(200);
  await request(app).get(profile).expect(404);
  await shareQr().expect(404);
});

test('portfolio editors cannot transfer media or assign Core verification', async () => {
  const f = await fixture();
  const other = await fixture();
  const row = await PortfolioItem.findOne({ vendor: f.vendor._id });
  const publish = bulkUpdates => request(app).post('/api/vendor/portfolio/publish').set(auth(f.token))
    .send({ itemIds: [row._id], bulkUpdates });
  await publish({ vendor: other.vendor._id }).expect(400);
  const unverified = await publish({ status: 'VERIFIED' }).expect(200);
  assert.equal(unverified.body.publishedCount, 0);
  await request(app).post('/api/vendor/portfolio/project').set(auth(f.token))
    .send({ projectName: 'Unapproved verification', status: 'BOOKING_PROVEN' }).expect(400);
  const edited = await publish({ title: 'Updated title', status: 'PUBLISHED' }).expect(200);
  assert.equal(edited.body.items[0].title, 'Updated title');
  assert.equal(String((await PortfolioItem.findById(row._id)).vendor), String(f.vendor._id));
});

test('Academy enforces draft and rights boundaries and preserves vendor-scoped revisioned progress', async t => {
  const vendor = await fixture();
  const other = await fixture();
  async function staff(permissions) {
    const user = await AdminUser.create({ email: `${key()}@example.test`, fullName: 'Academy staff', passwordHash: 'fixture', role: 'ADMIN', permissions });
    const session = await AdminSession.create({ admin: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
    return auth(signAdminAccessToken(user, session._id));
  }
  const editor = await staff(['academy.edit']);
  const publisher = await staff(['academy.publish']);
  const draft = { title: 'Write a scoped quote', category: 'Quotation & Sales', objective: 'Define what the quote covers', content: 'Record the scope, exclusions and timeline.', requestKey: key() };
  const create = value => request(app).post('/api/admin/academy').set(editor).send(value);
  const created = (await create(draft).expect(201)).body.lesson;
  assert.equal((await create(draft).expect(201)).body.lesson.id, created.id);
  await create({ ...draft, title: 'Different title' }).expect(409);
  const publicPath = `/api/vendor/academy/${created.id}`;
  const adminPath = `/api/admin/academy/${created.id}`;
  const read = () => request(app).get(publicPath).set(auth(vendor.token));
  const publication = (actor, body) => request(app).post(`${adminPath}/publication`).set(actor).send(body);
  await read().expect(404);
  await request(app).get(publicPath).expect(401);
  await publication(editor, { revision: 1, action: 'PUBLISH', reason: 'No publishing authority' }).expect(403);
  await publication(publisher, { revision: 1, action: 'PUBLISH', reason: 'Missing approval evidence' }).expect(400);
  await publication(publisher, { revision: 1, action: 'PUBLISH', reason: 'Approved', rightsReference: 'LEGAL-FIXTURE', rightsExpiresAt: '2020-01-01T00:00:00Z' }).expect(400);
  const scheduled = (await publication(publisher, { revision: 1, action: 'PUBLISH', reason: 'Approved for schedule', rightsReference: 'LEGAL-FIXTURE', publishAt: new Date(Date.now() + 3600000).toISOString() }).expect(200)).body.lesson;
  await read().expect(404);
  const withdrawn = (await publication(publisher, { revision: scheduled.revision, action: 'WITHDRAW', reason: 'Schedule changed' }).expect(200)).body.lesson;
  const published = (await publication(publisher, { revision: withdrawn.revision, action: 'PUBLISH', reason: 'Approved for immediate release', rightsReference: 'LEGAL-FIXTURE' }).expect(200)).body.lesson;
  const details = (await read().expect(200)).body.lesson;
  assert.equal(details.content, draft.content);
  assert.equal(details.rightsReference, undefined);
  assert.equal(details.videoId, undefined);
  const finish = () => request(app).put(`${publicPath}/progress`).set(auth(vendor.token)).send({ positionSeconds: 0, complete: true, contentVersion: 1 });
  const complete = (await finish().expect(200)).body;
  assert.ok(complete.completedAt);
  assert.equal((await finish().expect(200)).body.completedAt, complete.completedAt);
  const otherList = (await request(app).get('/api/vendor/academy').set(auth(other.token)).expect(200)).body.lessons;
  assert.equal(otherList.find(row => row.id === created.id).completedAt, null);
  await publication(publisher, { revision: published.revision, action: 'WITHDRAW', reason: 'Rights withdrawn' }).expect(200);
  await read().expect(404);
  await finish().expect(404);
  const updated = (await request(app).put(adminPath).set(editor).send({ ...draft, revision: published.revision + 1, title: 'Revised quote lesson' }).expect(200)).body.lesson;
  await publication(publisher, { revision: updated.revision, action: 'PUBLISH', reason: 'New version approved', rightsReference: 'LEGAL-FIXTURE-2' }).expect(200);
  await finish().expect(409);
  const owned = (await request(app).get('/api/vendor/academy').set(auth(vendor.token)).expect(200)).body.lessons.find(row => row.id === created.id);
  assert.equal(owned.contentVersion, 2);
  assert.equal(owned.completedAt, null);

  const previousConfig = { ...cloudinary.config() };
  cloudinary.config({ cloud_name: 'fixture', api_key: 'fixture', api_secret: 'fixture' });
  t.after(() => { cloudinary.config(true); cloudinary.config(previousConfig); });
  const videoId = 'starvnt_private/academy/quote-fixture';
  let type = 'upload';
  t.mock.method(cloudinary.api, 'resource', async (id, options) => {
    assert.equal(id, videoId);
    assert.deepEqual(options, { type: 'authenticated', resource_type: 'video' });
    return { public_id: id, type, resource_type: 'video', format: 'mp4' };
  });
  const video = (await create({
    ...draft, requestKey: key(), videoId, durationSeconds: 30,
    captions: 'WEBVTT\n\n00:00.000 --> 00:03.000\nStart with the agreed scope.',
  }).expect(201)).body.lesson;
  const videoAdmin = `/api/admin/academy/${video.id}/publication`;
  const playback = () => request(app).post(`/api/vendor/academy/${video.id}/playback`).set(auth(vendor.token));
  const rightsExpiresAt = new Date(Date.now() + 120000).toISOString();
  const approval = { revision: 1, action: 'PUBLISH', reason: 'Approved authenticated asset', rightsReference: 'VIDEO-RIGHTS-FIXTURE', rightsExpiresAt };
  await request(app).post(videoAdmin).set(publisher).send(approval).expect(409);
  type = 'authenticated';
  await request(app).post(videoAdmin).set(publisher).send(approval).expect(200);
  const grant = await playback().expect(200);
  assert.equal(grant.headers['cache-control'], 'no-store');
  assert.ok(new Date(grant.body.expiresAt) <= new Date(rightsExpiresAt));
  assert.match(grant.body.url, /\/video\/download\?/);
  await request(app).post(videoAdmin).set(publisher).send({ revision: 2, action: 'WITHDRAW', reason: 'Withdraw video rights' }).expect(200);
  await playback().expect(404);
});

test('Growth Meetings protect invite-only access, RSVP revisions, join links and post-meeting records', async () => {
  const invited = await fixture();
  const outside = await fixture();
  async function staff(permissions) {
    const user = await AdminUser.create({ email: `${key()}@example.test`, fullName: 'Meeting staff', passwordHash: 'fixture', role: 'ADMIN', permissions });
    const session = await AdminSession.create({ admin: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
    return auth(signAdminAccessToken(user, session._id));
  }
  const scheduler = await staff(['growthMeetings.schedule']);
  const operator = await staff(['growthMeetings.run']);
  const adminPath = '/api/admin/growth-meetings';
  const vendorPath = '/api/vendor/growth-meetings';
  const start = Date.now() + 3600000;
  const schedule = {
    title: 'Better event scopes', agenda: 'Review quote examples', startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + 3600000).toISOString(), timezone: 'Asia/Kolkata',
    meetUrl: 'https://meet.google.com/abc-defg-hij', audience: 'INVITED', invitees: [String(invited.vendor._id)],
    requestKey: key(), reason: 'Schedule learning session',
  };
  const create = (body, actor = scheduler) => request(app).post(adminPath).set(actor).send(body);
  await create(schedule, operator).expect(403);
  await create({ ...schedule, startsAt: '2028-02-31T09:00:00+05:30' }).expect(400);
  await create({ ...schedule, meetUrl: 'https://meet.google.com.evil.test/abc-defg-hij' }).expect(400);
  await create({ ...schedule, agenda: schedule.meetUrl }).expect(400);
  const lookup = await request(app).get(`${adminPath}/invitees`).set(scheduler).query({ q: invited.vendor.businessName }).expect(200);
  assert.deepEqual(lookup.body.vendors, [{ id: String(invited.vendor._id), name: invited.vendor.businessName }]);
  const { meeting } = (await create(schedule).expect(201)).body;
  assert.equal((await create(schedule).expect(201)).body.meeting.id, meeting.id);
  await create({ ...schedule, title: 'Changed on retry' }).expect(409);
  const admin = `${adminPath}/${meeting.id}`;
  const vendor = `${vendorPath}/${meeting.id}`;
  const list = token => request(app).get(vendorPath).set(auth(token));
  const rsvp = (token, scheduleVersion) => request(app).put(`${vendor}/rsvp`).set(auth(token)).send({ rsvp: 'GOING', scheduleVersion });
  const join = (token, scheduleVersion) => request(app).post(`${vendor}/join`).set(auth(token)).send({ scheduleVersion });
  const operatorView = (await request(app).get(adminPath).set(operator).expect(200)).body.meetings.find(row => row.id === meeting.id);
  assert.equal(operatorView.meetUrl, undefined);
  const listed = (await list(invited.token).expect(200)).body.meetings.find(row => row.id === meeting.id);
  assert.equal(listed.meetUrl, undefined);
  assert.equal(listed.invitees, undefined);
  assert.equal((await list(outside.token).expect(200)).body.meetings.some(row => row.id === meeting.id), false);
  assert.equal((await request(app).get(`${vendorPath}/next`).set(auth(outside.token)).expect(200)).body.meeting, null);
  const next = (await request(app).get(`${vendorPath}/next`).set(auth(invited.token)).expect(200)).body.meeting;
  assert.equal(next.id, meeting.id);
  assert.equal(next.meetUrl, undefined);
  await join(outside.token, 1).expect(404);
  await join(invited.token, 1).expect(409);
  await rsvp(invited.token, 1).expect(200);
  const newStart = Date.now() + 5 * 60000;
  const revised = (await request(app).put(`${admin}/schedule`).set(scheduler).send({
    ...schedule, startsAt: new Date(newStart).toISOString(), endsAt: new Date(newStart + 3600000).toISOString(),
    meetUrl: 'https://meet.google.com/jkl-mnop-qrs', revision: 1, scheduleVersion: 1,
  }).expect(200)).body.meeting;
  assert.equal(revised.scheduleVersion, 2);
  await rsvp(invited.token, 1).expect(409);
  await join(invited.token, 1).expect(409);
  const reloaded = (await list(invited.token).expect(200)).body.meetings.find(row => row.id === meeting.id);
  assert.equal(reloaded.rsvp, null);
  assert.equal((await join(invited.token, 2).expect(200)).body.url, revised.meetUrl);
  await join(outside.token, 2).expect(404);
  await rsvp(invited.token, 2).expect(200);
  await rsvp(invited.token, 2).expect(200);
  assert.equal(await MeetingParticipation.countDocuments({ meeting: meeting.id, vendor: invited.vendor._id }), 2);
  await request(app).post(`${admin}/cancel`).set(scheduler).send({ revision: 1, reason: 'Stale cancellation' }).expect(409);

  const second = (await create({ ...schedule, requestKey: key() }).expect(201)).body.meeting;
  await request(app).post(`${adminPath}/${second.id}/cancel`).set(scheduler).send({ revision: 1, reason: 'Facilitator unavailable' }).expect(200);
  await request(app).post(`${vendorPath}/${second.id}/join`).set(auth(invited.token)).send({ scheduleVersion: 1 }).expect(409);
  assert.equal((await list(invited.token).expect(200)).body.meetings.find(row => row.id === second.id).status, 'CANCELLED');

  await GrowthMeeting.updateOne({ _id: meeting.id }, { $set: { startsAt: new Date(Date.now() - 7200000), endsAt: new Date(Date.now() - 3600000) } });
  await join(invited.token, 2).expect(409);
  const feedback = () => request(app).put(`${vendor}/feedback`).set(auth(invited.token)).send({ scheduleVersion: 2, feedback: 'Useful examples.' });
  await feedback().expect(403);
  const attendance = vendorId => request(app).put(`${admin}/attendance`).set(operator).send({ vendorId, attended: true, scheduleVersion: 2 });
  await attendance(outside.vendor._id).expect(403);
  await attendance(invited.vendor._id).expect(200);
  await feedback().expect(200);
  await request(app).put(`${admin}/summary`).set(operator).send({
    revision: revised.revision, summary: 'We discussed quote inclusions.', resources: 'Use a scope checklist.', reason: 'Reviewed after the session',
  }).expect(200);
  await request(app).get(`${admin}/participation`).set(scheduler).expect(403);
  const records = (await request(app).get(`${admin}/participation`).set(operator).expect(200)).body.participants;
  assert.deepEqual(records.map(row => [row.vendorId, row.rsvp, row.attended, row.feedback]), [[String(invited.vendor._id), 'GOING', true, 'Useful examples.']]);
  const after = (await list(invited.token).expect(200)).body.meetings.find(row => row.id === meeting.id);
  assert.equal(after.summary, 'We discussed quote inclusions.');
  assert.equal(after.attended, true);

  const open = (await create({ ...schedule, audience: 'ACTIVE', invitees: [], requestKey: key() }).expect(201)).body.meeting;
  assert.equal((await list(outside.token).expect(200)).body.meetings.some(row => row.id === open.id), true);
  await VendorOrganization.updateOne({ _id: outside.vendor._id }, { $set: { status: 'SUSPENDED' } });
  await list(outside.token).expect(403);
});

test('location archival preserves history and invalid create cannot unset the current primary', async () => {
  const f = await fixture();
  await request(app).post('/api/vendor/locations').set(auth(f.token)).send({ label: 'Invalid new base', city: 'Pune', type: 'INVALID', isPrimary: true }).expect(400);
  assert.equal((await OperatingLocation.findById(f.location._id)).isPrimary, true);
  await request(app).put(`/api/vendor/locations/${f.location._id}`).set(auth(f.token)).send({ coordinates: { lat: 999, lng: 3 } }).expect(400);
  await request(app).delete(`/api/vendor/locations/${f.location._id}`).set(auth(f.token)).expect(200);
  const loc = await OperatingLocation.findById(f.location._id); assert.equal(loc.operatingStatus, 'INACTIVE'); assert.equal(loc.history.at(-1).action, 'ARCHIVED');
});

test('marketing opt-in is auditable, reversible and does not change STARVNT or Google ratings', async () => {
  const f = await fixture(), input = { marketingOptIn: true, idempotencyKey: key() };
  const r = await request(app).put('/api/vendor/growth-preferences').set(auth(f.token)).send(input).expect(200); assert.equal(r.body.status.marketingEligible, true);
  await request(app).put('/api/vendor/growth-preferences').set(auth(f.token)).send(input).expect(200);
  assert.equal((await VendorOrganization.findById(f.vendor._id)).growthPreferences.history.length, 1);
  const no = await request(app).put('/api/vendor/growth-preferences').set(auth(f.token)).send({ marketingOptIn: false, idempotencyKey: key() }).expect(200); assert.equal(no.body.status.marketingEligible, false);
  const org = await VendorOrganization.findById(f.vendor._id); assert.equal(org.rating.count, 0);
});

test('Google sync snapshots provider data separately and cannot claim listing ownership or alter legal identity and internal ratings', async t => {
  const f = await fixture(), placeId = 'ChIJ_test_listing';
  await VendorOrganization.updateOne({ _id: f.vendor._id }, { $set: { googlePlaceId: placeId } });
  const old = process.env.GOOGLE_PLACES_API_KEY; process.env.GOOGLE_PLACES_API_KEY = 'test-only';
  t.after(() => { if (old === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = old; });
  let providerCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { providerCalls++; return new Response(JSON.stringify({ id: placeId, displayName: { text: 'Google business name' }, rating: 4.6, userRatingCount: 41, googleMapsUri: 'https://maps.google.com/test' })); });
  const res = await request(app).post('/api/vendor/google-business/sync').set(auth(f.token)).send({ rating: 5 }).expect(200);
  assert.equal(res.body.ownershipVerified, false); assert.equal(res.body.googleBusiness.rating, 4.6);
  const org = await VendorOrganization.findById(f.vendor._id); assert.equal(org.rating.count, 0); assert.notEqual(org.businessName, 'Google business name');
  const profile = await request(app).get('/api/vendor/profile?skipGoogle=1').set(auth(f.token)).expect(200);
  assert.equal(profile.body.vendor.googleBusiness.rating, 4.6); assert.equal(providerCalls, 1);
});

test('travel quotes disclose coordinate versus fallback estimation and never expose a private base label', async () => {
  const f = await fixture();
  const evidence = distanceEvidence(f.location.toObject(), { coordinates: { lat: 18.6, lng: 73.9 } }); assert.equal(evidence.source, 'COORDINATE_ROAD_ESTIMATE');
  assert.equal(distanceEvidence({}, {}).source, 'ASSUMED_DISTANCE');
  const cost = await calculateValidatedTotalCost({ vendorId: f.vendor._id, vendorServiceId: f.service._id, serviceLocation: { coordinates: { lat: 18.6, lng: 73.9 } } });
  assert.equal(cost.costStatus, 'ESTIMATE_REQUIRES_VENDOR_CONFIRMATION'); assert.equal(cost.originPoint.includes('Private home'), false);
});
