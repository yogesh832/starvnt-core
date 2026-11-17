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
import { VendorFinancialProfile } from '../src/external/models/VendorFinancialProfile.js';
import { VendorDocument } from '../src/external/models/VendorDocument.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { identityOutcome } from '../src/common/verificationPolicy.js';
import { repeatBookingEvidence } from '../src/experience/repeatCustomer.js';
import { vendorDirectory } from '../src/experience/growth.service.js';
import { evaluateVendorActivation } from '../src/external/services/vendorActivation.service.js';
import { LearningLesson, LearningFeedback } from '../src/learning/models.js';
import { Quote } from '../src/external/models/Quote.js';
import { commercialSnapshot } from '../src/external/services/commercialSnapshot.service.js';
import { maskOpportunityCustomer } from '../src/external/services/opportunityPrivacy.service.js';
import { buildVendorContext } from '../src/external/aura/vendorContext.js';

const pan = 'AABPS1234D', legalName = 'Fixture Legal Business', oid = () => new mongoose.Types.ObjectId();
let mongo, app, originalConfig;
before(async () => {
  originalConfig = { panApiKey: config.panApiKey, panApiBaseUrl: config.panApiBaseUrl, panMockEnabled: config.panMockEnabled, gstinApiKey: config.gstinApiKey };
  Object.assign(config, { panApiKey: 'fixture-key', panApiBaseUrl: 'https://verification.example.test/pan', panMockEnabled: false, gstinApiKey: 'fixture-key' });
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('main17_external')), adminConn.openUri(mongo.getUri('main17_admin'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(model => model.init()));
}, { timeout: 120000 });
after(async () => { Object.assign(config, originalConfig); await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });
async function vendor() {
  const user = await ExternalUser.create({ fullName: 'Fixture owner', email: `${crypto.randomUUID()}@example.test`, accountType: 'VENDOR' });
  const organization = await VendorOrganization.create({ owner: user._id, businessName: 'Separate Storefront Brand' });
  user.vendorOrganization = organization._id; await user.save();
  const session = await ExternalSession.create({ user: user._id, refreshTokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
  return { organization, auth: { Authorization: `Bearer ${signExternalAccessToken(user, session._id)}` } };
}
const reply = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
test('only explicit provider proof and an exact legal-name match can verify identity', () => {
  assert.equal(identityOutcome({ ok: true, matched: true, confidence: 'EXACT' }), 'PROVIDER_ERROR');
  assert.equal(identityOutcome({ ok: true, providerVerified: true, matched: false, confidence: 'LOW' }), 'NAME_MISMATCH');
  assert.equal(identityOutcome({ ok: true, providerVerified: true, matched: true, confidence: 'MEDIUM' }), 'MANUAL_REVIEW_REQUIRED');
  assert.equal(identityOutcome({ ok: false, error: 'TimeoutError' }), 'PROVIDER_ERROR');
});
test('PAN form requires full legal name and verifies it independently of the storefront brand', async t => {
  const v = await vendor(); let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return reply({ legal_name: legalName, status: 'VALID', pan, privatePayload: 'fixture-private' }); });
  await request(app).post('/api/vendor/financial/pan').set(v.auth).send({ panNumber: pan }).expect(400);
  assert.equal(calls, 0);
  const result = await request(app).post('/api/vendor/financial/pan').set(v.auth).send({ panNumber: pan, fullLegalName: ` ${legalName} ` }).expect(200);
  assert.equal(result.body.pan.verificationStatus, 'VERIFIED');
  assert.equal(result.body.pan.submittedLegalName, legalName);
  assert.equal(JSON.stringify(result.body).includes(pan), false);
  assert.equal(JSON.stringify(result.body).includes('fixture-private'), false);
  assert.equal((await VendorOrganization.findById(v.organization._id)).businessName, 'Separate Storefront Brand');
  const profile = await request(app).get('/api/vendor/financial').set(v.auth).expect(200);
  assert.equal(profile.body.profile.pan.raw, undefined);
  assert.equal(profile.body.profile.pan.panNumber, '******234D');
  const documents = await request(app).get('/api/vendor/documents').set(v.auth).expect(200);
  assert.equal(JSON.stringify(documents.body).includes(pan), false);
});
test('name mismatch and provider timeout cannot borrow previous verified PAN document or bank eligibility', async t => {
  const v = await vendor();
  await VendorFinancialProfile.create({ vendor: v.organization._id, pan: { panNumber: pan, submittedLegalName: legalName, verificationStatus: 'VERIFIED' }, bankAccount: { verificationStatus: 'VERIFIED' }, isSettlementEligible: true });
  await VendorDocument.create({ vendor: v.organization._id, title: 'Fixture identity', type: 'PAN', documentNumber: pan, status: 'VERIFIED' });
  t.mock.method(globalThis, 'fetch', async () => reply({ legal_name: 'Unrelated Fixture Entity', status: 'VALID' }));
  const changed = await request(app).post('/api/vendor/financial/pan').set(v.auth).send({ panNumber: pan, fullLegalName: 'Changed Legal Name' }).expect(200);
  assert.equal(changed.body.pan.verificationStatus, 'NAME_MISMATCH');
  assert.equal(changed.body.isSettlementEligible, false);
  assert.equal(changed.body.activation.checklist.identityVerified, false);
  assert.equal(await VendorDocument.countDocuments({ vendor: v.organization._id, type: 'PAN', status: 'VERIFIED' }), 0);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Fixture timeout'); });
  const timeout = await request(app).post('/api/vendor/financial/pan').set(v.auth).send({ panNumber: pan, fullLegalName: legalName }).expect(200);
  assert.equal(timeout.body.pan.verificationStatus, 'PROVIDER_ERROR');
  assert.equal(timeout.body.verificationResult.error, 'VERIFICATION_PROVIDER_UNAVAILABLE');
});
test('successful GST provider lookup with a wrong name remains unverified and raw payload stays private', async t => {
  const v = await vendor();
  t.mock.method(globalThis, 'fetch', async () => reply({ data: { lgnm: 'Another Fixture Entity', sts: 'ACTIVE', privatePayload: 'fixture-private' } }));
  const result = await request(app).post('/api/vendor/financial/gst').set(v.auth).send({ isRegistered: true, gstin: '19AABPS1234D1Z5' }).expect(200);
  assert.equal(result.body.gst.verificationStatus, 'NAME_MISMATCH');
  assert.equal(result.body.gst.verifiedAt, null);
  assert.equal(JSON.stringify(result.body).includes('fixture-private'), false);
  assert.equal(JSON.stringify(result.body).includes(pan), false);
});
test('uncertain PAN legal-name formatting requires manual review rather than automatic verification', async t => {
  const v = await vendor();
  t.mock.method(globalThis, 'fetch', async () => reply({ legal_name: `${legalName} Limited`, status: 'VALID' }));
  const result = await request(app).post('/api/vendor/financial/pan').set(v.auth).send({ panNumber: pan, fullLegalName: legalName }).expect(200);
  assert.equal(result.body.pan.verificationStatus, 'MANUAL_REVIEW_REQUIRED');
});
test('ordinary vendor identity APIs cannot access another vendor financial profile', async () => {
  const a = await vendor(), b = await vendor();
  await VendorFinancialProfile.create({ vendor: b.organization._id, pan: { panNumber: pan, submittedLegalName: 'Other identity', verificationStatus: 'VERIFIED' } });
  const response = await request(app).get(`/api/vendor/financial?vendorId=${b.organization._id}`).set(a.auth).expect(200);
  assert.equal(response.body.profile.pan?.submittedLegalName || '', '');
});
const completed = extra => ({ _id: oid(), source: 'STARVNT', bookingStatus: 'CONFIRMED', executionStatus: 'COMPLETION_VERIFIED', paymentStatus: 'PAYMENT_VERIFIED', ...extra });
test('repeat evidence excludes unverified/cancelled/refunded/external work and deduplicates service records', () => {
  const quoteId = String(oid());
  const good = completed({ quoteId });
  const rows = [good, completed({ quoteId }), completed({ bookingStatus: 'CANCELLED' }), completed({ executionStatus: 'SERVICE_STARTED' }), completed({ paymentStatus: 'PENDING' }), completed({ paymentStatus: 'REFUNDED' }), completed({ source: 'VENDOR_PRIVATE' }), completed({ financeOperations: [{ kind: 'REFUND', status: 'CONFIRMED', amount: 1 }] })];
  assert.equal(repeatBookingEvidence(rows).length, 1);
  assert.equal(repeatBookingEvidence([...rows, completed()]).length, 2);
  assert.equal(repeatBookingEvidence([good, completed({ quoteId, paymentStatus: 'REFUNDED' })]).length, 0);
});
test('vendor directory returns qualifying Core evidence, and another vendor cannot contribute a repeat', async () => {
  const a = await vendor(), b = await vendor(), customerId = oid();
  const base = { customerId, vendorId: a.organization._id, serviceName: 'Fixture service', eventDate: '2026-01-01', totalAmount: 1000 };
  await CoreBooking.create({ ...base, ...completed() });
  await CoreBooking.create({ ...base, ...completed({ vendorId: b.organization._id }) });
  await CoreBooking.create({ ...base, ...completed({ paymentStatus: 'REFUNDED' }) });
  let directory = await vendorDirectory(a.organization._id);
  assert.equal(directory.customers[0].repeatCustomer, false);
  await CoreBooking.create({ ...base, ...completed() });
  directory = await vendorDirectory(a.organization._id);
  assert.equal(directory.customers[0].repeatCustomer, true);
  assert.equal(directory.customers[0].repeatCustomerEvidence.qualifyingBookingCount, 2);
});
test('global search is owned, literal, projected and distinguishes an unavailable source from empty', async t => {
  const a = await vendor(), b = await vendor();
  const title = `Search-${crypto.randomUUID()}`;
  const own = await CoreBooking.create({ vendorId: a.organization._id, customerId: oid(), serviceName: title, eventDate: '2026-01-01', totalAmount: 1000 });
  const other = await CoreBooking.create({ vendorId: b.organization._id, customerId: oid(), serviceName: title, eventDate: '2026-01-01', totalAmount: 1000 });
  await VendorDocument.create({ vendor: a.organization._id, title, type: 'PAN', documentNumber: pan });
  const result = await request(app).get('/api/vendor/search').query({ q: title, vendorId: String(b.organization._id) }).set(a.auth).expect(200);
  const bookings = result.body.sections.find(s => s.type === 'bookings');
  assert.deepEqual(bookings.results.map(x => x.id), [String(own._id)]);
  assert.equal(JSON.stringify(result.body).includes(String(other._id)), false);
  assert.equal(JSON.stringify(result.body).includes(pan), false);
  assert.equal(result.body.sections.find(s => s.type === 'documents').results.length, 0);
  const literal = await request(app).get('/api/vendor/search').query({ q: '[.*', type: 'bookings' }).set(a.auth).expect(200);
  assert.equal(literal.body.sections[0].status, 'READY'); assert.deepEqual(literal.body.sections[0].results, []);
  await request(app).get('/api/vendor/search?q[$ne]=x').set(a.auth).expect(400);
  t.mock.method(CoreBooking, 'find', () => { throw new Error('Fixture source outage'); });
  const partial = await request(app).get('/api/vendor/search').query({ q: title }).set(a.auth).expect(200);
  assert.equal(partial.body.sections.find(s => s.type === 'bookings').status, 'UNAVAILABLE');
  assert.equal(partial.body.sections.find(s => s.type === 'bookings').results, null);
  assert.equal(partial.body.sections.find(s => s.type === 'services').status, 'READY');
});

test('readiness has ten independently defined metrics from the canonical evaluator without raw identity', async () => {
  const v = await vendor();
  const value = await evaluateVendorActivation(v.organization._id);
  assert.equal(value.metrics.length, 10);
  assert.equal(new Set(value.metrics.map(m => m.label)).size, 10);
  const profile = value.metrics.find(m => m.key === 'BUSINESS_PROFILE');
  assert.equal(profile.value, value.profileCompletion);
  assert.equal(value.metrics.find(m => m.key === 'ONBOARDING').value, value.completionPercentage);
  assert.equal(value.metrics.find(m => m.key === 'MATCHING').value, value.matchingEligible ? 'ELIGIBLE' : 'LOCKED');
  assert.equal(value.metrics.find(m => m.key === 'GST').value, 'DECLARATION_REQUIRED');
  assert.ok(value.metrics.every(m => m.definition && m.source.length && m.contributingFields.length && m.computedAt === value.computedAt && m.calculationVersion === value.calculationVersion));
  assert.equal(JSON.stringify(value.metrics).includes(pan), false);
});

test('a new non-registered GST declaration revokes old GST proof without pretending to verify identity', async () => {
  const v = await vendor();
  await VendorFinancialProfile.create({ vendor: v.organization._id, gst: { isRegistered: true, gstin: '19AABPS1234D1Z5', verificationStatus: 'VERIFIED' }, bankAccount: { verificationStatus: 'VERIFIED' }, isSettlementEligible: true });
  await VendorDocument.create({ vendor: v.organization._id, title: 'Fixture GST', type: 'GST', status: 'VERIFIED' });
  await request(app).post('/api/vendor/financial/gst').set(v.auth).send({ isRegistered: 'anything' }).expect(400);
  const result = await request(app).post('/api/vendor/financial/gst').set(v.auth).send({ isRegistered: false }).expect(200);
  assert.equal(result.body.activation.checklist.identityVerified, false);
  assert.equal(result.body.activation.metrics.find(m => m.key === 'GST').value, 'DECLARED_NOT_REGISTERED');
  assert.equal((await VendorFinancialProfile.findOne({ vendor: v.organization._id })).isSettlementEligible, false);
  assert.equal(await VendorDocument.countDocuments({ vendor: v.organization._id, type: 'GST', status: 'VERIFIED' }), 0);
});

test('Academy feedback is private, version-bound, validated and replay-safe', async () => {
  const a = await vendor(), b = await vendor();
  const lesson = await LearningLesson.create({ title: 'Fixture lesson', category: 'Getting Started', objective: 'Fixture objective', content: 'Synthetic content', createdBy: 'fixture-admin', requestKey: crypto.randomUUID(), requestHash: 'fixture-hash', publishAt: new Date(Date.now() - 1000), rightsReference: 'fixture-rights' });
  const path = `/api/vendor/academy/${lesson._id}`;
  const payload = { rating: 4, comment: 'Synthetic private feedback', contentVersion: 1, requestKey: crypto.randomUUID(), vendorId: String(b.organization._id) };
  await request(app).post(`${path}/feedback`).set(a.auth).send({ ...payload, rating: 6 }).expect(400);
  await request(app).post(`${path}/feedback`).set(a.auth).send({ ...payload, contentVersion: 0 }).expect(409);
  const first = await request(app).post(`${path}/feedback`).set(a.auth).send(payload).expect(200);
  const replay = await request(app).post(`${path}/feedback`).set(a.auth).send(payload).expect(200);
  assert.equal(first.body.feedback.createdAt, replay.body.feedback.createdAt);
  assert.equal(await LearningFeedback.countDocuments({ lesson: lesson._id }), 1);
  await request(app).post(`${path}/feedback`).set(a.auth).send({ ...payload, rating: 1 }).expect(409);
  const own = await request(app).get(path).set(a.auth).expect(200);
  const other = await request(app).get(path).set(b.auth).expect(200);
  assert.equal(own.body.feedback.comment, payload.comment); assert.equal(other.body.feedback, null);
  await LearningLesson.updateOne({ _id: lesson._id }, { $inc: { contentVersion: 1 } });
  assert.equal((await request(app).get(path).set(a.auth).expect(200)).body.feedback, null);
  await request(app).post(`${path}/feedback`).set(a.auth).send(payload).expect(409);
  await LearningLesson.updateOne({ _id: lesson._id }, { $unset: { publishAt: 1 } });
  await request(app).post(`${path}/feedback`).set(a.auth).send({ ...payload, contentVersion: 2 }).expect(404);
});

test('submitted commercial revisions retain exact prior amounts and scope without overwriting a version', async () => {
  const quote = new Quote({ vendor: oid(), customer: oid(), vendorService: oid(), serviceName: 'Fixture versioned quote', eventDate: '2027-01-01', notes: 'Original scope', pricingBreakdown: { basePrice: 100, totalAmount: 100 }, status: 'SUBMITTED' });
  quote.commercialSnapshot = commercialSnapshot(quote, quote.pricingBreakdown, 1); await quote.save();
  const original = quote.commercialVersions[0].toObject();
  quote.pricingBreakdown = { basePrice: 200, totalAmount: 200 }; quote.notes = 'Revised scope';
  quote.commercialSnapshot = commercialSnapshot(quote, quote.pricingBreakdown, 1);
  await assert.rejects(quote.save(), error => error.code === 'IMMUTABLE_QUOTE_VERSION');
  quote.commercialSnapshot = commercialSnapshot(quote, quote.pricingBreakdown, 2); await quote.save();
  const saved = await Quote.findById(quote._id).lean();
  assert.equal(saved.commercialVersions.length, 2);
  assert.equal(saved.commercialVersions[0].contentHash, original.contentHash);
  assert.equal(saved.commercialVersions[0].content.notes, 'Original scope');
  assert.equal(saved.commercialVersions[0].content.pricingBreakdown.totalAmount, 100);
  assert.equal(saved.commercialVersions[1].content.pricingBreakdown.totalAmount, 200);
  assert.notEqual(saved.commercialVersions[1].contentHash, original.contentHash);
  const projected = maskOpportunityCustomer({ ...saved, commercialVersions: [{ ...saved.commercialVersions[0], content: { ...saved.commercialVersions[0].content, serviceLocation: { address: 'Synthetic private venue' }, notes: 'Synthetic private scope' } }] }, false);
  assert.equal(projected.commercialVersions[0].content.serviceLocation, undefined);
  assert.equal(JSON.stringify(projected.commercialVersions).includes('Synthetic private'), false);
  assert.equal(projected.commercialVersions[0].content.pricingBreakdown.totalAmount, 100);
  const tampered = await Quote.findById(quote._id);
  tampered.commercialVersions[0].content = { notes: 'Overwritten history' };
  await assert.rejects(tampered.save(), error => error.code === 'IMMUTABLE_QUOTE_VERSION');
  const unversioned = await Quote.findById(quote._id);
  unversioned.notes = 'Unversioned changed scope';
  await assert.rejects(unversioned.save(), error => error.code === 'IMMUTABLE_QUOTE_VERSION');
  const cleared = await Quote.findById(quote._id); cleared.commercialSnapshot = null;
  await assert.rejects(cleared.save(), error => error.code === 'IMMUTABLE_QUOTE_VERSION');
  const contenders = await Promise.all([Quote.findById(quote._id), Quote.findById(quote._id)]);
  contenders.forEach((candidate, index) => {
    candidate.pricingBreakdown = { basePrice: 300 + index * 100, totalAmount: 300 + index * 100 };
    candidate.commercialSnapshot = commercialSnapshot(candidate, candidate.pricingBreakdown, 3);
  });
  const results = await Promise.allSettled(contenders.map(candidate => candidate.save()));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const winner = await Quote.findById(quote._id).lean();
  assert.equal(winner.commercialVersions.length, 3);
  assert.equal(winner.commercialVersions[0].contentHash, original.contentHash);
});

test('Aura quote context uses current contact permissions and distinct readiness denominators', async () => {
  const v = await vendor();
  const customer = await ExternalUser.create({ fullName: 'Synthetic Private Recipient', email: `${crypto.randomUUID()}@example.test`, accountType: 'CUSTOMER' });
  await Quote.create({ vendor: v.organization._id, customer: customer._id, vendorService: oid(), serviceName: 'Synthetic service', eventDate: '2027-01-01', pricingBreakdown: { basePrice: 100, totalAmount: 100 } });
  const context = await buildVendorContext(v.organization);
  assert.equal(context.quotes.latest[0].customer, 'Customer');
  assert.equal(JSON.stringify(context.quotes).includes('Synthetic Private Recipient'), false);
  assert.equal(context.quotes.latest[0].commercialVersion, 0);
  const readiness = await evaluateVendorActivation(v.organization._id);
  assert.equal(context.business.profileCompletePercent, readiness.profileCompletion);
  assert.equal(context.business.onboardingCompletionPercent, readiness.completionPercentage);
});
