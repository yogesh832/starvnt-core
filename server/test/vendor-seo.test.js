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
import { VendorSeoWorkspace } from '../src/external/models/VendorSeoWorkspace.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { validateSeoWorkspace, generateSeoDraft, seoSummary } from '../src/common/vendorSeo.js';
import { SEO_DRAFT_FIELDS } from '../src/common/vendorSeoContract.js';

let app, mongo;
const date = () => new Date().toISOString().slice(0, 10);
const draft = () => Object.fromEntries(Object.keys(SEO_DRAFT_FIELDS).map(key => [key, '']));
const input = () => ({ revision: 0, evidence: [], records: [], draft: draft() });
function facts() { return Object.entries({ businessName: 'Actual Photo Studio', category: 'Photography', services: 'Wedding photography', serviceArea: 'Pune' }).map(([field, value]) => ({ id: randomUUID(), field, value, sourceUrl: 'https://example.com/business', observedAt: date(), identityConfirmed: true, publicUseApproved: true })); }
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('seo_test')), adminConn.openUri(mongo.getUri('seo_test_admin'))]);
  app = createApp();
  await VendorSeoWorkspace.init();
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); if (mongo) await mongo.stop(); });
async function fixture(type = 'VENDOR') {
  const owner = await ExternalUser.create({ fullName: 'Private owner', email: `${randomUUID()}@example.test`, accountType: type });
  const vendor = await VendorOrganization.create({ businessName: 'Actual Photo Studio', category: 'Photography', location: 'Pune', owner: owner._id, phone: 'PRIVATE_PHONE', verification: { notes: 'PRIVATE_VERIFICATION_NOTES' } });
  owner.vendorOrganization = vendor._id; await owner.save();
  const session = await ExternalSession.create({ user: owner._id, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
  return { owner, vendor, token: signExternalAccessToken(owner, session._id) };
}
const auth = f => ({ Authorization: `Bearer ${f.token}` });
const writable = workspace => ({ revision: workspace.revision, evidence: workspace.evidence, records: workspace.records, draft: workspace.draft });

test('SEO input rejects unsupported public facts, unsafe links, invalid dates and fabricated metrics', () => {
  for (const evidence of [
    [{ ...facts()[0], field: 'privatePhone' }],
    [{ ...facts()[0], sourceUrl: 'javascript:alert(1)' }],
    [{ ...facts()[0], sourceUrl: 'https://user:password@example.com' }],
    [{ ...facts()[0], observedAt: '2026-02-30' }],
    [{ ...facts()[0], identityConfirmed: false }],
  ]) assert.throws(() => validateSeoWorkspace({ ...input(), evidence }));
  assert.throws(() => validateSeoWorkspace({ ...input(), vendor: 'someone-else' }));
  const metric = { id: randomUUID(), kind: 'measurement', title: 'Organic clicks', basis: 'ESTIMATE', observedAt: date(), value: 99 };
  assert.throws(() => validateSeoWorkspace({ ...input(), records: [metric] }));
  const valid = validateSeoWorkspace({ ...input(), records: [{ ...metric, basis: 'OBSERVATION', sourceUrl: 'https://search.google.com/search-console', metric: 'Organic clicks', startDate: date(), endDate: date(), value: 0 }] });
  assert.equal(valid.records[0].value, 0);
  assert.throws(() => validateSeoWorkspace({ ...input(), evidence: [facts()[0], { ...facts()[0], id: 'same' }, { ...facts()[0], id: 'same' }] }));
});

test('drafts use only current confirmed evidence and never infer ratings, addresses or experience', () => {
  assert.throws(() => generateSeoDraft(input()), /evidence/);
  const evidence = facts();
  const generated = generateSeoDraft({ ...input(), evidence });
  assert.match(generated.title, /Actual Photo Studio/);
  assert.match(generated.description, /Wedding photography.*Pune/);
  const schema = JSON.parse(generated.structuredData);
  assert.equal(schema.name, 'Actual Photo Studio');
  for (const key of ['aggregateRating', 'review', 'address', 'foundingDate', 'telephone']) assert.equal(schema[key], undefined);
  assert.equal(generated.faqs, '');
  assert.throws(() => generateSeoDraft({ ...input(), evidence: evidence.map(item => ({ ...item, observedAt: '2020-01-01' })) }));
  const summary = seoSummary({ status: 'SUSPENDED', flagged: false }, { ...input(), evidence });
  assert.equal(summary.status, 'NEEDS_DATA');
  assert.equal(summary.measurements.connectionStatus, 'NOT_CONNECTED');
});

test('SEO is owner-only, tenant isolated, read-only on GET, and excludes private identity data', async () => {
  const a = await fixture(), b = await fixture(), customer = await fixture('CUSTOMER');
  await request(app).get('/api/vendor/seo').expect(401);
  await request(app).get('/api/vendor/seo').set(auth(customer)).expect(403);
  const result = await request(app).get(`/api/vendor/seo?vendor=${b.vendor._id}`).set(auth(a)).expect(200);
  assert.equal(result.body.profile.vendorId, String(a.vendor._id));
  assert.equal(result.body.summary.status, 'NEEDS_DATA');
  assert.equal(await VendorSeoWorkspace.countDocuments({ vendor: a.vendor._id }), 0);
  for (const privateValue of ['Private owner', 'PRIVATE_PHONE', 'PRIVATE_VERIFICATION_NOTES', a.owner.email]) assert.equal(JSON.stringify(result.body).includes(privateValue), false);
  a.owner.vendorOrganization = b.vendor._id; await a.owner.save();
  await request(app).get('/api/vendor/seo').set(auth(a)).expect(403);
});

test('save/review/export enforce revisions, revoke approvals after edits and never publish profiles', async () => {
  const f = await fixture(), other = await fixture();
  const originalOrg = await VendorOrganization.findById(f.vendor._id).lean();
  const content = { ...input(), evidence: facts() };
  const save = await request(app).put('/api/vendor/seo').set(auth(f)).send(content).expect(200);
  assert.equal(save.body.workspace.revision, 1);
  await request(app).put('/api/vendor/seo').set(auth(f)).send(content).expect(409);
  const generated = await request(app).post('/api/vendor/seo/generate').set(auth(f)).send({ revision: 1 }).expect(200);
  assert.equal(generated.body.published, false);
  assert.equal((await VendorSeoWorkspace.findOne({ vendor: f.vendor._id })).draft.title, '');
  const saved = await request(app).put('/api/vendor/seo').set(auth(f)).send({ ...writable(save.body.workspace), draft: generated.body.draft }).expect(200);
  const review = { revision: saved.body.workspace.revision, fingerprint: saved.body.summary.fingerprint, confirmed: true };
  await request(app).post('/api/vendor/seo/review').set(auth(f)).send({ ...review, confirmed: false }).expect(400);
  const reviewed = await request(app).post('/api/vendor/seo/review').set(auth(f)).send(review).expect(200);
  assert.equal(reviewed.body.summary.reviewed, true);
  await request(app).post('/api/vendor/seo/review').set(auth(f)).send(review).expect(409);
  const stranger = await request(app).get('/api/vendor/seo/export').set(auth(other)).expect(200);
  assert.equal(stranger.body.workspace.evidence.length, 0);
  const exported = await request(app).get('/api/vendor/seo/export').set(auth(f)).expect(200);
  assert.match(exported.headers['content-disposition'], /attachment/);
  assert.equal(exported.body.summary.publication, 'PRIVATE_WORKSPACE_ONLY');
  assert.equal(exported.body.growthPack.length, 20);
  assert.equal(exported.body.growthPack.find(section => section.id === 'competitor').status, 'NEEDS_DATA');
  assert.equal(exported.body.growthPack.find(section => section.id === 'metadata').status, 'RECORDED_REQUIRES_REVIEW');
  assert.deepEqual(await VendorOrganization.findById(f.vendor._id).lean(), originalOrg);
  await VendorOrganization.updateOne({ _id: f.vendor._id }, { $set: { location: 'Changed area' } });
  const invalidated = await request(app).get('/api/vendor/seo').set(auth(f)).expect(200);
  assert.equal(invalidated.body.summary.reviewed, false);
  await VendorOrganization.updateOne({ _id: f.vendor._id }, { $set: { location: originalOrg.location } });
  const edited = await request(app).put('/api/vendor/seo').set(auth(f)).send({ ...writable(reviewed.body.workspace), draft: { ...reviewed.body.workspace.draft, title: 'Edited draft' } }).expect(200);
  assert.equal(edited.body.workspace.review, null);
  assert.equal(edited.body.summary.reviewed, false);
  const finalOrg = await VendorOrganization.findById(f.vendor._id).lean();
  // The test itself changed and restored location, which advances updatedAt.
  assert.deepEqual({ ...finalOrg, updatedAt: null }, { ...originalOrg, updatedAt: null });
});

test('concurrent writes cannot overwrite a newer saved SEO workspace', async () => {
  const f = await fixture();
  const writes = await Promise.all(['First title', 'Second title'].map(title => request(app).put('/api/vendor/seo').set(auth(f)).send({ ...input(), draft: { ...draft(), title } })));
  assert.deepEqual(writes.map(r => r.status).sort(), [200, 409]);
  const stored = await VendorSeoWorkspace.findOne({ vendor: f.vendor._id }).lean();
  assert.equal(stored.revision, 1);
  assert.equal(stored.history.length, 1);
});
