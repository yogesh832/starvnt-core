import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { PartnerOfferRequest } from '../src/external/models/PartnerOfferRequest.js';
import { VendorAuraPromotion } from '../src/external/models/VendorAuraPromotion.js';
import { VendorSeoWorkspace } from '../src/external/models/VendorSeoWorkspace.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { PARTNER_OFFER_NOTICE_VERSION, addCalendarMonths, validatePartnerPromo } from '../src/common/partnerProgram.js';
import { partnerMarketingSuggestions } from '../src/common/partnerMarketing.js';
import { validateSeoWorkspace } from '../src/common/vendorSeo.js';
import { SEO_DRAFT_FIELDS } from '../src/common/vendorSeoContract.js';

let app, mongo;
before(async () => { mongo = await MongoMemoryServer.create(); await Promise.all([externalConn.openUri(mongo.getUri('partner_program')), adminConn.openUri(mongo.getUri('partner_program_admin'))]); app = createApp(); await Promise.all([PartnerOfferRequest.init(), VendorAuraPromotion.init()]); }, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });
async function fixture(accountType = 'VENDOR') {
  const owner = await ExternalUser.create({ fullName: 'Private Owner', email: `${randomUUID()}@example.test`, accountType });
  const vendor = await VendorOrganization.create({ owner: owner._id, businessName: 'Example Studio', category: 'Photography', location: 'Pune', phone: 'PRIVATE_PHONE' });
  owner.vendorOrganization = vendor._id; await owner.save();
  const session = await ExternalSession.create({ user: owner._id, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
  return { owner, vendor, token: signExternalAccessToken(owner, session._id) };
}
const auth = f => ({ Authorization: `Bearer ${f.token}` });
const claim = (revision = 0) => ({ code: ' aura6months ', acknowledged: true, noticeVersion: PARTNER_OFFER_NOTICE_VERSION, revision });
const emptyDraft = () => Object.fromEntries(Object.keys(SEO_DRAFT_FIELDS).map(key => [key, '']));
const evidence = () => Object.entries({ businessName: 'Example Studio', category: 'Photography', services: 'Wedding photographs', serviceArea: 'Pune' }).map(([field, value]) => ({ id: randomUUID(), field, value, sourceUrl: 'https://example.com/business', observedAt: new Date().toISOString().slice(0, 10), identityConfirmed: true, publicUseApproved: true }));

test('promo rules normalize the code, reject expired/unknown codes and never promise paid renewal', () => {
  const known = validatePartnerPromo(' aura6months ');
  assert.equal(known.durationMonths, 6); assert.equal(known.autoRenewsToPaid, false); assert.equal(known.status, 'AVAILABLE');
  assert.equal(validatePartnerPromo('AURA2025').status, 'EXPIRED');
  assert.equal(validatePartnerPromo('madeup').recognized, false);
  assert.throws(() => validatePartnerPromo({ code: 'AURA6MONTHS' }));
});
test('six calendar months clamp month-end dates', () => {
  assert.equal(addCalendarMonths('2026-08-31T12:00:00.000Z', 6).toISOString(), '2027-02-28T12:00:00.000Z');
});
test('vendor redeems Aura once, sees dates, and cannot extend by replaying the code', async () => {
  const vendor = await fixture(), other = await fixture();
  await request(app).post('/api/vendor/partner-program/redeem').set(auth(vendor)).send({ code: 'WRONG' }).expect(400);
  const result = await request(app).post('/api/vendor/partner-program/redeem').set(auth(vendor)).send({ code: ' aura6months ', vendor: String(other.vendor._id), durationMonths: 99 }).expect(201);
  assert.equal(result.body.entitlement.status, 'ACTIVE');
  assert.equal(result.body.entitlement.autoRenewsToPaid, false);
  const started = new Date(result.body.entitlement.startedAt);
  assert.equal(result.body.entitlement.expiresAt, addCalendarMonths(started, 6).toISOString());
  const replay = await request(app).post('/api/vendor/partner-program/redeem').set(auth(vendor)).send({ code: 'AURA6MONTHS' }).expect(200);
  assert.equal(replay.body.replay, true);
  assert.equal(replay.body.entitlement.expiresAt, result.body.entitlement.expiresAt);
  assert.equal(await VendorAuraPromotion.countDocuments({ vendor: vendor.vendor._id }), 1);
  const view = await request(app).get('/api/vendor/partner-program').set(auth(vendor)).expect(200);
  assert.equal(view.body.entitlement.status, 'ACTIVE');
  const isolated = await request(app).get('/api/vendor/partner-program').set(auth(other)).expect(200);
  assert.equal(isolated.body.entitlement, null);
  await VendorAuraPromotion.collection.updateOne({ vendor: vendor.vendor._id }, { $set: { expiresAt: new Date('2020-01-01') } });
  const expired = await request(app).get('/api/vendor/partner-program').set(auth(vendor)).expect(200);
  assert.equal(expired.body.entitlement.status, 'EXPIRED');
  assert.equal((await request(app).post('/api/vendor/partner-program/redeem').set(auth(vendor)).send({ code: 'AURA6MONTHS' }).expect(200)).body.entitlement.status, 'EXPIRED');
});
test('program and draft legal documents require vendor ownership; drafts do not become active terms', async () => {
  const a = await fixture(), b = await fixture('CUSTOMER');
  await request(app).get('/api/vendor/partner-program').expect(401);
  await request(app).get('/api/vendor/partner-program').set(auth(b)).expect(403);
  const response = await request(app).get('/api/vendor/partner-program').set(auth(a)).expect(200);
  assert.match(response.headers['cache-control'], /no-store/);
  assert.equal(Object.keys(response.body.legal.documents).length, 4);
  for (const doc of Object.values(response.body.legal.documents)) { assert.equal(doc.status, 'DRAFT_PENDING_REVIEW'); assert.ok(doc.clauses.length > 0); }
  assert.match(response.body.legal.documents.terms.effectiveDate, /APPROVED/);
  assert.equal(JSON.stringify(response.body).includes('PRIVATE_PHONE'), false);
  assert.equal(await PartnerOfferRequest.countDocuments(), 0);
  a.owner.vendorOrganization = b.vendor._id; await a.owner.save();
  await request(app).get('/api/vendor/partner-program').set(auth(a)).expect(403);
});
test('offer requests are persistent, isolated, replay safe and withdrawable without modifying billing or activation', async () => {
  const f = await fixture(), other = await fixture();
  const original = await VendorOrganization.findById(f.vendor._id).lean();
  await request(app).post('/api/vendor/partner-program/request').set(auth(f)).send({ ...claim(), acknowledged: false }).expect(409);
  await request(app).post('/api/vendor/partner-program/request').set(auth(f)).send({ ...claim(), noticeVersion: 'old' }).expect(409);
  await request(app).post('/api/vendor/partner-program/request').set(auth(f)).send({ ...claim(), code: 'UNKNOWN' }).expect(400);
  const result = await request(app).post('/api/vendor/partner-program/request').set(auth(f)).send({ ...claim(), vendor: String(other.vendor._id), durationMonths: 999, subscriptionActivated: true }).expect(201);
  assert.equal(result.body.subscriptionActivated, false); assert.equal(result.body.request.status, 'REQUESTED'); assert.equal(result.body.request.revision, 1);
  const replay = await request(app).post('/api/vendor/partner-program/request').set(auth(f)).send(claim()).expect(200);
  assert.equal(replay.body.replay, true); assert.equal(replay.body.request.history.length, 1);
  const untouched = await request(app).get('/api/vendor/partner-program').set(auth(other)).expect(200);
  assert.equal(untouched.body.request, null);
  await request(app).post('/api/vendor/partner-program/withdraw').set(auth(f)).send({ revision: 9 }).expect(409);
  const withdrawn = await request(app).post('/api/vendor/partner-program/withdraw').set(auth(f)).send({ revision: 1 }).expect(200);
  assert.equal(withdrawn.body.request.status, 'WITHDRAWN');
  await request(app).post('/api/vendor/partner-program/request').set(auth(f)).send(claim()).expect(409);
  const again = await request(app).post('/api/vendor/partner-program/request').set(auth(f)).send(claim(2)).expect(200);
  assert.equal(again.body.request.history.length, 3);
  assert.deepEqual(await VendorOrganization.findById(f.vendor._id).lean(), original);
});
test('restricted organizations cannot request offers', async () => { const f = await fixture(); await VendorOrganization.updateOne({ _id: f.vendor._id }, { $set: { isRestricted: true } }); await request(app).post('/api/vendor/partner-program/request').set(auth(f)).send(claim()).expect(403); });
test('restricted organizations cannot redeem Aura', async () => { const f = await fixture(); await VendorOrganization.updateOne({ _id: f.vendor._id }, { $set: { isRestricted: true } }); await request(app).post('/api/vendor/partner-program/redeem').set(auth(f)).send({ code: 'AURA6MONTHS' }).expect(403); });
test('marketing templates require current public-use evidence and return reviewable, schema-valid private records', () => {
  assert.throws(() => partnerMarketingSuggestions({ evidence: [] }));
  const input = { revision: 0, evidence: evidence(), draft: emptyDraft(), records: [] };
  const result = partnerMarketingSuggestions(input);
  assert.equal(result.published, false); assert.equal(result.records.length, 9);
  assert.ok(result.records.every(r => r.basis === 'RECOMMENDATION'));
  assert.equal(validateSeoWorkspace({ ...input, records: result.records }).records.length, 9);
  const text = JSON.stringify(result); assert.match(text, /Pune/); assert.equal(text.includes('West Bengal'), false); assert.equal(text.includes('29994'), false);
  assert.throws(() => partnerMarketingSuggestions({ ...input, evidence: input.evidence.map(e => ({ ...e, publicUseApproved: false })) }));
});
test('growth suggestions use only the authenticated workspace and are not persisted or published automatically', async () => {
  const f = await fixture();
  const saved = await request(app).put('/api/vendor/seo').set(auth(f)).send({ revision: 0, evidence: evidence(), records: [], draft: emptyDraft() }).expect(200);
  const suggestion = await request(app).post('/api/vendor/seo/suggestions').set(auth(f)).send({ revision: saved.body.workspace.revision }).expect(200);
  assert.equal(suggestion.body.records.length, 9);
  assert.equal((await VendorSeoWorkspace.findOne({ vendor: f.vendor._id }).lean()).records.length, 0);
  await request(app).post('/api/vendor/seo/suggestions').set(auth(f)).send({ revision: 0 }).expect(409);
});
