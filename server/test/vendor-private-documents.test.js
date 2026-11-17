import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorDocument } from '../src/external/models/VendorDocument.js';
import { VendorFinancialProfile } from '../src/external/models/VendorFinancialProfile.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { AdminSession } from '../src/admin/models/AdminSession.js';
import { BusinessAuditLog } from '../src/admin/models/BusinessAuditLog.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { signAdminAccessToken } from '../src/admin/utils/tokens.js';
import { config } from '../src/config.js';

let mongo, app;
const pan = 'AABPS1234D'; // Synthetic format fixture, never a real identity.
const bytes = Buffer.from('%PDF-1.7\nSynthetic private vendor evidence.');
const dataUrl = `data:application/pdf;base64,${bytes.toString('base64')}`;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('private_document_external')), adminConn.openUri(mongo.getUri('private_document_admin'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(model => model.init()));
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });
async function vendor() {
  const owner = await ExternalUser.create({ fullName: 'Synthetic owner', email: `${crypto.randomUUID()}@example.test`, accountType: 'VENDOR' });
  const organization = await VendorOrganization.create({ owner: owner._id, businessName: 'Synthetic vendor' });
  owner.vendorOrganization = organization._id; await owner.save();
  const session = await ExternalSession.create({ user: owner._id, refreshTokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
  return { organization, auth: { Authorization: `Bearer ${signExternalAccessToken(owner, session._id)}` } };
}
async function admin(permissions) {
  const actor = await AdminUser.create({ fullName: 'Synthetic reviewer', email: `${crypto.randomUUID()}@example.test`, passwordHash: 'fixture', role: 'ADMIN', permissions });
  const session = await AdminSession.create({ admin: actor._id, refreshTokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
  return { Authorization: `Bearer ${signAdminAccessToken(actor, session._id)}` };
}
const upload = (v, fields = {}) => request(app).post('/api/vendor/documents').set(v.auth).send({ title: `PAN ${pan}`, type: 'PAN', documentNumber: pan, fileName: `identity-${pan}.pdf`, notes: `Synthetic ${pan}`, fileUrl: dataUrl, ...fields });

test('private PDF bytes are stored and retrieved only through owned audited content access', async () => {
  const v = await vendor(), other = await vendor();
  const created = await upload(v).expect(201), document = created.body.document;
  assert.equal(document.status, 'SUBMITTED'); assert.equal(document.contentAccess, 'AVAILABLE');
  assert.equal(document.privateContent, undefined); assert.equal(document.fileUrl, undefined);
  assert.equal(JSON.stringify(created.body).includes(pan), false);
  assert.equal(JSON.stringify(created.body).includes(dataUrl), false);
  const stored = await VendorDocument.findById(document._id);
  assert.equal(stored.privateContent, undefined); assert.equal(stored.fileUrl, '');
  const content = `/api/vendor/documents/${document._id}/content`;
  await request(app).get(content).expect(401);
  await request(app).get(content).set(other.auth).expect(404);
  const read = await request(app).get(content).set(v.auth).expect(200);
  assert.deepEqual(read.body, bytes); assert.equal(read.headers['cache-control'], 'private, no-store');
  assert.equal(read.headers['x-content-type-options'], 'nosniff'); assert.equal(read.headers['content-disposition'].includes(pan), false);
  const readonly = await admin(['vendors.read']), sensitive = await admin(['vendors.read', 'vendorIdentity.readSensitive']);
  const adminPath = `/api/admin/external-users/organizations/${v.organization._id}/documents/${document._id}/content`;
  await request(app).get(adminPath).set(readonly).expect(403);
  assert.deepEqual((await request(app).get(adminPath).set(sensitive).expect(200)).body, bytes);
  assert.equal(await BusinessAuditLog.countDocuments({ resourceId: document._id, action: 'VENDOR_PRIVATE_DOCUMENT_READ' }), 2);
});

test('invalid or external content is rejected; legacy inline content is private without a data rewrite', async () => {
  const v = await vendor();
  await upload(v, { fileUrl: 'https://example.test/sensitive.pdf' }).expect(400);
  await upload(v, { fileUrl: `data:image/png;base64,${Buffer.from('<script>fixture</script>').toString('base64')}` }).expect(400);
  const legacy = await VendorDocument.create({ vendor: v.organization._id, title: 'Legacy fixture', type: 'PAN', documentNumber: pan, fileUrl: dataUrl });
  const external = await VendorDocument.create({ vendor: v.organization._id, title: 'Legacy external fixture', type: 'PAN', fileUrl: 'https://example.test/legacy-private.pdf' });
  const list = await request(app).get('/api/vendor/documents').set(v.auth).expect(200);
  assert.equal(JSON.stringify(list.body).includes('data:application/pdf'), false);
  assert.equal(JSON.stringify(list.body).includes('legacy-private.pdf'), false);
  assert.deepEqual((await request(app).get(`/api/vendor/documents/${legacy._id}/content`).set(v.auth).expect(200)).body, bytes);
  await request(app).get(`/api/vendor/documents/${external._id}/content`).set(v.auth).expect(409);
  assert.equal((await VendorDocument.findById(legacy._id)).fileUrl, dataUrl);
});

test('provider verification evidence cannot overwrite or authenticate the uploaded PAN file', async t => {
  const v = await vendor();
  const old = { panApiKey: config.panApiKey, panApiBaseUrl: config.panApiBaseUrl, panMockEnabled: config.panMockEnabled };
  Object.assign(config, { panApiKey: 'fixture', panApiBaseUrl: 'https://provider.example.test/pan', panMockEnabled: false });
  t.after(() => Object.assign(config, old));
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ legal_name: 'Synthetic Legal Name', status: 'VALID' }), { headers: { 'Content-Type': 'application/json' } }));
  const uploaded = (await upload(v).expect(201)).body.document;
  await request(app).post('/api/vendor/financial/pan').set(v.auth).send({ panNumber: pan, fullLegalName: 'Synthetic Legal Name' }).expect(200);
  const rows = await VendorDocument.find({ vendor: v.organization._id, type: 'PAN' }).lean();
  assert.equal(rows.length, 2);
  const file = rows.find(row => String(row._id) === uploaded._id);
  assert.equal(file.status, 'SUBMITTED'); assert.ok(file.contentHash);
  assert.equal(rows.find(row => row.status === 'VERIFIED').contentHash, undefined);
});

test('document approval requires explicit current evidence, sensitive access and an audited read', async () => {
  const v = await vendor();
  const document = (await upload(v, { type: 'BUSINESS_REG', documentNumber: '', title: 'Synthetic registration' }).expect(201)).body.document;
  const allowed = await admin(['vendors.read', 'vendors.approve', 'vendorIdentity.readSensitive']);
  const restricted = await admin(['vendors.read', 'vendors.approve']);
  const path = `/api/admin/external-users/organizations/${v.organization._id}/verification`;
  const decision = { approved: true, documentId: document._id, expectedDocumentVersion: 0, notes: 'Synthetic authorized evidence review' };
  await request(app).post(path).set(allowed).send({}).expect(400);
  await request(app).post(path).set(allowed).send({ ...decision, notes: '' }).expect(400);
  await request(app).post(path).set(allowed).send({ ...decision, expectedDocumentVersion: 2 }).expect(409);
  await request(app).post(path).set(restricted).send(decision).expect(403);
  const unopened = await request(app).post(path).set(allowed).send(decision).expect(409);
  assert.equal(unopened.body.error, 'EVIDENCE_READ_REQUIRED');
  await request(app).get(`/api/admin/external-users/organizations/${v.organization._id}/documents/${document._id}/content`).set(allowed).expect(200);
  const approved = await request(app).post(path).set(allowed).send(decision).expect(200);
  assert.equal(approved.body.document.status, 'VERIFIED'); assert.equal(approved.body.document.reviewHistory.length, 1);
  await request(app).post(path).set(allowed).send(decision).expect(409);
  const rejected = await request(app).post(path).set(allowed).send({ ...decision, approved: false, expectedDocumentVersion: 1, notes: 'Synthetic subsequent review finding' }).expect(200);
  assert.deepEqual(rejected.body.document.reviewHistory.map(row => row.decision), ['APPROVED', 'REJECTED']);
  assert.equal(rejected.body.document.verifiedAt, null);
});

test('document review cannot promote an uncertain identity provider result into verified PAN', async () => {
  const v = await vendor();
  await VendorFinancialProfile.create({ vendor: v.organization._id, identityReviewRequired: true, pan: { panNumber: pan, submittedLegalName: 'Synthetic Legal Name', verificationStatus: 'MANUAL_REVIEW_REQUIRED', raw: { providerVerified: true, confidence: 'HIGH' } } });
  const document = (await upload(v).expect(201)).body.document;
  const reviewer = await admin(['vendors.read', 'vendors.approve', 'vendorIdentity.readSensitive']);
  await request(app).get(`/api/admin/external-users/organizations/${v.organization._id}/documents/${document._id}/content`).set(reviewer).expect(200);
  const result = await request(app).post(`/api/admin/external-users/organizations/${v.organization._id}/verification`).set(reviewer).send({ approved: true, documentId: document._id, expectedDocumentVersion: 0, notes: 'Synthetic document review' }).expect(409);
  assert.equal(result.body.error, 'MANUAL_IDENTITY_POLICY_REQUIRED');
  assert.equal((await VendorFinancialProfile.findOne({ vendor: v.organization._id })).pan.verificationStatus, 'MANUAL_REVIEW_REQUIRED');
  assert.equal((await VendorDocument.findById(document._id)).status, 'SUBMITTED');
});

test('a changed stored file fails integrity review without issuing a successful read grant', async () => {
  const v = await vendor(), document = (await upload(v).expect(201)).body.document;
  await VendorDocument.updateOne({ _id: document._id }, { $set: { privateContent: Buffer.from('%PDF-1.7\nChanged synthetic content') } });
  const read = await request(app).get(`/api/vendor/documents/${document._id}/content`).set(v.auth).expect(409);
  assert.equal(read.body.error, 'DOCUMENT_INTEGRITY_REVIEW_REQUIRED');
  assert.equal(await BusinessAuditLog.countDocuments({ resourceId: document._id, action: 'VENDOR_PRIVATE_DOCUMENT_READ' }), 0);
});
