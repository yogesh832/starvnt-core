import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { adminConn, externalConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorService } from '../src/external/models/VendorService.js';
import { Quote } from '../src/external/models/Quote.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { VendorReview } from '../src/external/models/VendorReview.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { LaunchpadObservation } from '../src/experience/launchpadEvidence.js';

let mongo, app;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([adminConn.openUri(mongo.getUri('launchpad_admin')), externalConn.openUri(mongo.getUri('launchpad_external'))]);
  app = createApp();
  await Promise.all([...Object.values(adminConn.models), ...Object.values(externalConn.models)].map(model => model.init()));
}, { timeout: 120000 });
after(async () => { await Promise.all([adminConn.close(), externalConn.close()]); await mongo?.stop(); });

async function fixture() {
  const owner = await ExternalUser.create({ fullName: 'Launchpad vendor', email: `${crypto.randomUUID()}@example.test`, accountType: 'VENDOR' });
  const vendor = await VendorOrganization.create({ owner: owner._id, businessName: 'Launchpad Studio', category: 'Photography' });
  owner.vendorOrganization = vendor._id; await owner.save();
  const session = await ExternalSession.create({ user: owner._id, accountType: 'VENDOR', refreshTokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
  return { owner, vendor, auth: { Authorization: `Bearer ${signExternalAccessToken(owner, session._id)}` } };
}

test('authenticated Launchpad loads for a new vendor without archived Proposal Studio models', async () => {
  const f = await fixture();
  const response = await request(app).get('/api/vendor/launchpad').set(f.auth).expect(200);
  const data = response.body;
  assert.equal(data.totalSteps, 9); assert.equal(data.phases.length, 4);
  assert.ok(data.steps.every(step => typeof step.completed === 'boolean'));
  assert.equal(data.steps.find(step => step.key === 'ADD_SERVICES').completed, false);
  assert.equal(data.steps.find(step => step.key === 'COMPLETE_VERIFICATION').completed, false);
  assert.equal(data.steps.find(step => step.key === 'FIRST_QUOTE').completed, false);
  assert.equal(data.steps.find(step => step.key === 'ADD_SERVICES').actionLink, '/vendor/services');
  assert.equal(data.steps.find(step => step.key === 'COMPLETE_VERIFICATION').actionLink, '/vendor/documents');
});

test('Launchpad counts the authenticated vendor\'s real services and sent quotes, not drafts or another vendor\'s records', async () => {
  const f = await fixture(), other = await fixture();
  const service = await VendorService.create({ vendor: f.vendor._id, name: 'Photo package', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 1000 } });
  const quote = await Quote.create({ vendor: f.vendor._id, customer: f.owner._id, vendorService: service._id, serviceName: service.name, eventDate: '2027-12-01', status: 'DRAFT', pricingBreakdown: { basePrice: 1000, totalAmount: 1000 } });
  let data = (await request(app).get('/api/vendor/launchpad').set(f.auth).expect(200)).body;
  assert.equal(data.steps.find(step => step.key === 'ADD_SERVICES').completed, true);
  assert.equal(data.steps.find(step => step.key === 'FIRST_QUOTE').completed, false);
  await Quote.updateOne({ _id: quote._id }, { $set: { status: 'SUBMITTED' } });
  data = (await request(app).get('/api/vendor/launchpad').set(f.auth).expect(200)).body;
  assert.equal(data.steps.find(step => step.key === 'FIRST_QUOTE').completed, true);
  const isolated = (await request(app).get(`/api/vendor/launchpad?vendorId=${f.vendor._id}`).set(other.auth).expect(200)).body;
  assert.equal(isolated.steps.find(step => step.key === 'FIRST_QUOTE').completed, false);
  assert.equal(isolated.steps.find(step => step.key === 'ADD_SERVICES').completed, false);
});

test('Launchpad endpoint still requires an authenticated Vendor session', async () => {
  await request(app).get('/api/vendor/launchpad').expect(401);
});

test('legacy missing timeline and unavailable history never manufacture dates or erase current source evidence', async t => {
  const f = await fixture();
  await VendorOrganization.collection.updateOne({ _id: f.vendor._id }, { $unset: { createdAt: '', foundingPartner: '' } });
  const load = () => request(app).get('/api/vendor/launchpad').set(f.auth).expect(200);
  let data = (await load()).body;
  assert.equal(data.timelineSource, 'UNKNOWN'); assert.equal(data.offerStartedAt, null); assert.equal(data.daysRemaining, null); assert.equal(data.cohort, null);
  t.mock.method(LaunchpadObservation, 'find', () => { throw new Error('Synthetic evidence history outage'); });
  data = (await load()).body;
  assert.equal(data.historyStatus, 'UNAVAILABLE');
  assert.equal(data.steps.find(step => step.key === 'BUILD_PROFILE').sourceStatus, 'READY');
  assert.ok(data.steps.every(step => step.completedAt === null && step.completionRecordedAt === null && step.history === null));
  assert.equal((await VendorOrganization.findById(f.vendor._id).lean()).createdAt, undefined);
});

test('elapsed days, unverified bookings and unverified published reviews cannot grant growth milestones', async () => {
  const f = await fixture();
  await VendorOrganization.updateOne({ _id: f.vendor._id }, { $set: { 'foundingPartner.offerStartedAt': new Date('2020-01-01'), 'foundingPartner.offerExpiresAt': new Date('2020-01-31') } });
  const booking = await CoreBooking.create({ vendorId: f.vendor._id, customerId: f.owner._id, serviceName: 'Fixture', eventDate: '2027-01-01', totalAmount: 100, bookingStatus: 'CONFIRMED', paymentStatus: 'PENDING' });
  const review = await VendorReview.create({ vendor: f.vendor._id, customerName: 'Fixture reviewer', rating: 5, reviewText: 'Fixture only', status: 'PUBLISHED', isVerified: false });
  let result = (await request(app).get('/api/vendor/launchpad').set(f.auth).expect(200)).body;
  assert.equal(result.daysRemaining, 0); assert.equal(result.isCompleted, false);
  assert.equal(result.steps.find(s => s.key === 'FIRST_BOOKING').completed, false);
  assert.equal(result.steps.find(s => s.key === 'FIRST_REVIEW').completed, false);
  booking.paymentStatus = 'PAYMENT_VERIFIED'; await booking.save();
  review.isVerified = true; await review.save();
  result = (await request(app).get('/api/vendor/launchpad').set(f.auth).expect(200)).body;
  assert.equal(result.steps.find(s => s.key === 'FIRST_BOOKING').completed, true);
  assert.equal(result.steps.find(s => s.key === 'FIRST_REVIEW').completed, true);
});

test('Launchpad retains observed evidence changes without rewriting history or treating unavailable sources as zero', async t => {
  const f = await fixture(), other = await fixture();
  const endpoint = '/api/vendor/launchpad';
  const load = () => request(app).get(endpoint).set(f.auth).expect(200);
  let data = (await load()).body;
  const initial = data.steps.find(s => s.key === 'ADD_SERVICES');
  assert.equal(initial.status, 'PENDING'); assert.equal(initial.history.length, 1);
  data = (await load()).body;
  assert.equal(data.steps.find(s => s.key === 'ADD_SERVICES').history.length, 1);
  const service = await VendorService.create({ vendor: f.vendor._id, name: 'Fixture priced service', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 1000 } });
  data = (await load()).body;
  const complete = data.steps.find(s => s.key === 'ADD_SERVICES');
  assert.equal(complete.status, 'COMPLETE'); assert.ok(complete.completionObservedAt); assert.equal(complete.completedAt, null);
  assert.equal(complete.completionRecordedAt, complete.completionObservedAt);
  assert.equal(complete.completionTimeSource, 'OBSERVED_FROM_RECORDED_EVIDENCE');
  await VendorService.updateOne({ _id: service._id }, { $set: { status: 'ARCHIVED' } });
  data = (await load()).body;
  const reverted = data.steps.find(s => s.key === 'ADD_SERVICES');
  assert.equal(reverted.status, 'PENDING'); assert.equal(reverted.history.length, 3);
  assert.equal(reverted.completionRecordedAt, null);
  assert.equal(reverted.completionObservedAt, complete.completionObservedAt);
  const isolated = (await request(app).get(`${endpoint}?vendorId=${f.vendor._id}`).set(other.auth).expect(200)).body;
  assert.equal(isolated.steps.find(s => s.key === 'ADD_SERVICES').history.length, 1);
  t.mock.method(CoreBooking, 'countDocuments', () => { throw new Error('Fixture evidence outage'); });
  const partial = (await load()).body;
  assert.equal(partial.partial, true); assert.equal(partial.progressPercent, null);
  const unavailable = partial.steps.find(s => s.key === 'FIRST_BOOKING');
  assert.equal(unavailable.completed, null); assert.equal(unavailable.status, 'UNKNOWN');
  assert.equal(partial.steps.find(s => s.key === 'ADD_SERVICES').sourceStatus, 'READY');
});
