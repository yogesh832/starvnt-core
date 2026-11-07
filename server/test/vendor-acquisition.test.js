import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { VendorAcquisition, observeVendorAcquisition, claimVendorAcquisition, authAcquisitionReceipt } from '../src/external/services/vendorAcquisition.service.js';
import { evaluateVendorActivation } from '../src/external/services/vendorActivation.service.js';
import { reviewActivation } from '../src/admin/services/vendorActivationReview.js';
import { VendorService } from '../src/external/models/VendorService.js';
import { VendorCapability } from '../src/external/models/VendorCapability.js';
import { VendorFinancialProfile } from '../src/external/models/VendorFinancialProfile.js';
import { OperatingLocation } from '../src/external/models/OperatingLocation.js';
import { ServiceCoverage } from '../src/external/models/ServiceCoverage.js';
import { PortfolioItem } from '../src/external/models/PortfolioItem.js';

let mongo, app;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('acquisition')), adminConn.openUri(mongo.getUri('acquisition_admin'))]);
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(m => m.init()));
  app = createApp();
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });
const signup = () => ({ fullName: 'Test Partner', email: `${randomUUID()}@example.test`, password: 'Strong!Password123', accountType: 'VENDOR', businessName: 'Test studio', category: 'Photography' });

test('successful registration, rejected requests, profile, portfolio, onboarding, submission and actual approval', async () => {
  const since = Date.now() - 1000, payload = signup();
  const registered = await request(app).post('/api/auth/register').send(payload).expect(201);
  assert.equal(registered.body.acquisition.name, 'CompleteRegistration');
  assert.match(registered.body.acquisition.eventId, /^[a-f0-9-]{36}$/);
  const token = registered.body.accessToken, auth = { Authorization: `Bearer ${token}` };
  const vendor = await VendorOrganization.findOne({ businessName: 'Test studio' });
  const claim = () => request(app).post('/api/vendor/acquisition-events/claim').set(auth).send({ consentSince: since }).expect(200);
  await request(app).post('/api/auth/register').send(payload).expect(409);
  await request(app).post('/api/auth/login').send({ ...payload, password: 'incorrect' }).expect(401);
  await request(app).put('/api/vendor/profile').set(auth).send({ category: ['Photography', 'Catering'] }).expect(400);
  let result = await claim();
  assert.deepEqual(result.body.events.map(e => e.name), ['CompleteRegistration']);
  assert.deepEqual((await claim()).body.events, []);
  const loggedIn = await request(app).post('/api/auth/login').send(payload).expect(200);
  assert.equal(loggedIn.body.acquisition.name, 'VendorLogin');
  const restored = await request(app).get('/api/auth/me').set(auth).expect(200);
  assert.equal(restored.body.acquisition, undefined);
  await request(app).put('/api/vendor/profile').set(auth).send({ city: 'Pune' }).expect(200);
  result = await claim();
  assert.deepEqual(new Set(result.body.events.map(e => e.name)), new Set(['VendorOnboardingStarted', 'VendorBusinessInformationAdded', 'VendorProfileCompleted']));
  await request(app).post('/api/vendor/activation-review').set(auth).send({}).expect(409);
  await request(app).post('/api/vendor/portfolio/item').set(auth).send({}).expect(400);
  assert.deepEqual((await claim()).body.events, []);
  // Real persisted operational evidence used by the production evaluator (no mocked success flags).
  const service = await VendorService.create({ vendor: vendor._id, name: 'Photography', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 1000 } });
  await VendorCapability.create({ vendor: vendor._id, vendorService: service._id, teamSize: 2, simultaneousEventLimit: 2 });
  await OperatingLocation.create({ vendor: vendor._id, label: 'Studio', city: 'Pune', coordinates: { lat: 18.52, lng: 73.85 } });
  await ServiceCoverage.create({ vendor: vendor._id, vendorService: service._id, coverageType: 'CITY', city: 'Pune' });
  await VendorFinancialProfile.create({ vendor: vendor._id, pan: { verificationStatus: 'VERIFIED' }, bankAccount: { verificationStatus: 'VERIFIED' } });
  await VendorOrganization.updateOne({ _id: vendor._id }, { $set: { 'workingHours.Mon': { isOpen: true, hours: '9am - 6pm' } } });
  await PortfolioItem.create({ vendor: vendor._id, mediaType: 'IMAGE', url: 'https://example.test/showcase.jpg', visibility: 'PUBLIC', status: 'PUBLISHED' });
  result = await claim();
  assert.deepEqual(new Set(result.body.events.map(e => e.name)), new Set(['VendorPortfolioUploaded', 'VendorOnboardingCompleted']));
  assert.equal((await evaluateVendorActivation(vendor._id)).matchingEligible, false);
  await request(app).post('/api/vendor/activation-review').set(auth).send({}).expect(200);
  await request(app).post('/api/vendor/activation-review').set(auth).send({}).expect(200);
  assert.deepEqual((await claim()).body.events.map(e => e.name), ['SubmitApplication']);
  const review = { action: 'APPROVE', reason: 'Evidence reviewed', idempotencyKey: randomUUID() };
  await reviewActivation(vendor._id, review, { id: vendor.owner, role: 'ADMIN' });
  await reviewActivation(vendor._id, review, { id: vendor.owner, role: 'ADMIN' });
  const parallel = await Promise.all([claim(), claim(), claim()]);
  assert.deepEqual(parallel.flatMap(r => r.body.events).map(e => e.name), ['VendorVerified']);
  assert.deepEqual((await claim()).body.events, []);
});

test('legacy accounts baseline without historical conversions, concurrent achievements and claims deduplicate globally', async () => {
  const owner = await ExternalUser.create({ fullName: 'Legacy partner', email: `${randomUUID()}@example.test`, accountType: 'VENDOR' });
  const vendor = await VendorOrganization.create({ owner: owner._id, businessName: 'Legacy', status: 'ACTIVE', activationReview: { status: 'APPROVED' } });
  assert.deepEqual(await observeVendorAcquisition(vendor, { VendorVerified: true, VendorProfileCompleted: true }), []);
  await Promise.all(Array.from({ length: 5 }, () => observeVendorAcquisition(vendor, { VendorVerified: true, VendorProfileCompleted: true, VendorPortfolioUploaded: true })));
  const journal = await VendorAcquisition.findOne({ vendor: vendor._id }).lean();
  assert.equal(journal.events.length, 1);
  assert.equal(journal.events[0].name, 'VendorPortfolioUploaded');
  const claims = await Promise.all(Array.from({ length: 5 }, () => claimVendorAcquisition(vendor._id, Date.now() - 10000)));
  assert.equal(claims.flat().length, 1);
  assert.deepEqual(await claimVendorAcquisition(vendor._id, Date.now() + 10000), []);
});

test('social and OTP receipts classify only actual new accounts; refresh/dev and customer flows are excluded', async () => {
  const owner = await ExternalUser.create({ fullName: 'Partner', email: `${randomUUID()}@example.test`, accountType: 'VENDOR' });
  const vendor = await VendorOrganization.create({ owner: owner._id, businessName: 'New studio' });
  owner.vendorOrganization = vendor._id;
  for (const path of ['/google', '/otp/verify', '/otp/widget-verify']) {
    const event = await authAcquisitionReceipt(owner, {}, { path, acquisitionCreated: true });
    assert.equal(event.name, 'CompleteRegistration');
    assert.equal((await authAcquisitionReceipt(owner, {}, { path })).name, 'VendorLogin');
  }
  for (const path of ['/refresh', '/me', '/dev-auth', '/switch-surface']) assert.equal(await authAcquisitionReceipt(owner, {}, { path }), undefined);
  assert.equal(await authAcquisitionReceipt({ ...owner.toObject(), accountType: 'CUSTOMER' }, {}, { path: '/register', acquisitionCreated: true }), undefined);
});

test('late observation uses persisted achievement times so pre-consent activity is not replayed', async () => {
  const owner = await ExternalUser.create({ fullName: 'Partner', email: `${randomUUID()}@example.test`, accountType: 'VENDOR' });
  const vendor = await VendorOrganization.create({ owner: owner._id, businessName: 'Past studio', category: 'Photography', location: 'Pune', isProfileCompleted: true });
  owner.vendorOrganization = vendor._id;
  await authAcquisitionReceipt(owner, {}, { path: '/register', acquisitionCreated: true });
  const old = new Date(Date.now() - 10000);
  await PortfolioItem.create({ vendor: vendor._id, mediaType: 'IMAGE', url: 'https://example.test/old.jpg', createdAt: old });
  const consentSince = Date.now() + 1;
  await new Promise(resolve => setTimeout(resolve, 5));
  const readiness = await evaluateVendorActivation(vendor._id);
  const portfolio = readiness.acquisitionEvents.find(e => e.name === 'VendorPortfolioUploaded');
  assert.equal(new Date(portfolio.occurredAt).getTime(), old.getTime());
  assert.deepEqual(await claimVendorAcquisition(vendor._id, consentSince), []);
});
