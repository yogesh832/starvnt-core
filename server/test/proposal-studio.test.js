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
import { Quote } from '../src/external/models/Quote.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { AdminSession } from '../src/admin/models/AdminSession.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { CustomerEvent, EventRequirement, Reservation, Booking, Payment } from '../src/customer/models/index.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { signAdminAccessToken } from '../src/admin/utils/tokens.js';
import { VendorAgreement, ProposalVersion, ProposalAccessLog } from '../src/proposals/models.js';
import { renderProposalVersion, browserPath, closeRenderer, readStoredPdf, pdfText, INTERNAL_KEYS, findKeys } from '../src/proposals/render.service.js';
import { recordRenderResult } from '../src/proposals/proposal.service.js';
import { composeProposalHtml, PRELIMINARY_WATERMARK, orderedServices } from '../src/proposals/composer.js';

let app, mongo;
const key = () => crypto.randomUUID();
const DAY = 86400000;
const future = (days) => new Date(Date.now() + days * DAY).toISOString();
const HAS_BROWSER = Boolean(browserPath());

// Internal figures that must never reach a customer surface.
const VENDOR_PRICES = { catering: 200000, decor: 60000, photography: 30000 };
const MARGIN = 77777;
const PACKAGE_TOTAL = 412777;
const FORBIDDEN_TEXT = ['2,00,000', '200000', '60,000', '60000', '77,777', '77777'];

before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('proposal_studio')), adminConn.openUri(mongo.getUri('proposal_studio_admin'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map((m) => m.init()));
}, { timeout: 120000 });
after(async () => { await closeRenderer(); await Promise.all([externalConn.close(), adminConn.close()]); if (mongo) await mongo.stop(); });

const auth = (token) => ({ Authorization: `Bearer ${token}` });
async function adminToken(permissions) {
  const user = await AdminUser.create({ fullName: 'Studio Admin', email: `${key()}@example.test`, passwordHash: 'fixture', role: 'ADMIN', permissions });
  const session = await AdminSession.create({ admin: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  return signAdminAccessToken(user, session._id);
}
async function externalToken(user) {
  const session = await ExternalSession.create({ user: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  return signExternalAccessToken(user, session._id);
}
async function customer(name = 'Sudipta Chatterjee') {
  const user = await ExternalUser.create({ fullName: name, email: `${key()}@example.test`, accountType: 'CUSTOMER' });
  return { user, token: await externalToken(user) };
}
async function vendor(category) {
  const owner = await ExternalUser.create({ fullName: `${category} owner`, email: `${key()}@example.test`, accountType: 'VENDOR' });
  const org = await VendorOrganization.create({ owner: owner._id, ownerIdentityKey: owner._id, businessName: `${category} Co ${key().slice(0, 6)}`, category, location: 'Kolkata' });
  owner.vendorOrganization = org._id; await owner.save();
  return { org, token: await externalToken(owner) };
}
async function weddingEvent(customerId, extra = {}) {
  const event = await CustomerEvent.create({ customer: customerId, eventType: 'wedding', title: 'Wedding Reception', eventDate: '2027-06-15', city: 'Kolkata', guestCount: 300, budgetMax: 500000, status: 'planning', theme: 'Royal Luxury', location: { venueName: 'Baranagar Hall' }, ...extra });
  await EventRequirement.create([
    { event: event._id, category: 'catering', status: 'confirmed', preferences: { cuisine: 'Bengali', menuStyle: 'Buffet' } },
    { event: event._id, category: 'decor', status: 'confirmed', preferences: { theme: 'Royal Luxury' } },
    { event: event._id, category: 'photography', status: 'confirmed', preferences: { coverage: 'Full day' } },
    { event: event._id, category: 'venue', status: 'customer_provided' },
    { event: event._id, category: 'makeup', status: 'pending' },
  ]);
  return event;
}
function quote(vendorOrg, customerId, category, total) {
  return Quote.create({ vendor: vendorOrg._id, customer: customerId, vendorService: new mongoose.Types.ObjectId(), serviceName: `${category} package`, category, eventDate: '2027-06-15', pricingBreakdown: { basePrice: total, totalAmount: total }, status: 'SUBMITTED', validUntil: future(10) });
}
function commercialBody(overrides = {}) {
  return {
    costs: { margin: MARGIN, contingency: 25000, logistics: 20000 },
    customerFacing: {
      packageTotal: PACKAGE_TOTAL,
      allocations: [
        { category: 'catering', label: 'Reception catering', scopeSummary: 'Welcome drinks, starters, main course, desserts for 300 guests', amount: 240000 },
        { category: 'decor', label: 'Entrance, stage & décor', scopeSummary: 'Entrance and stage décor with lighting', amount: 80000 },
        { category: 'photography', label: 'Photography & videography', scopeSummary: 'Full-day coverage', amount: 45000 },
        { category: 'coordination', label: 'Logistics & coordination', scopeSummary: 'Setup, strike and on-ground coordination', amount: 47777 },
      ],
      paymentSchedule: [
        { label: 'Booking confirmation', percent: 30, amount: 123833, dueRule: 'On booking' },
        { label: 'Before major procurement', percent: 30, amount: 123833, dueRule: '30 days before event' },
        { label: 'Before event execution', percent: 40, amount: 165111, dueRule: '7 days before event' },
      ],
      exclusions: ['Venue rental'],
      terms: { cancellation: 'As per the signed booking terms.', scopeChange: 'Changes require written approval.' },
    },
    ...overrides,
  };
}
function assertNoLeak(payload, label) {
  const text = JSON.stringify(payload);
  for (const v of FORBIDDEN_TEXT) assert.ok(!text.includes(v), `${label} leaks internal amount ${v}`);
  assert.deepEqual(findKeys(payload, INTERNAL_KEYS), [], `${label} leaks internal keys`);
}
async function renderOrSimulate(versionId) {
  if (HAS_BROWSER) return renderProposalVersion(versionId);
  return recordRenderResult(versionId, { pdf: { storageKey: null }, qa: { passed: true, checks: [{ key: 'simulated', passed: true, critical: true }] } });
}

test('Proposal Studio end to end: gates block until approvals, then version-bound approval without booking', { timeout: 180000 }, async () => {
  const S = '/api/admin/proposal-studio';
  const maker = await adminToken(['proposals.read', 'proposals.compose', 'proposals.publish', 'agreements.read', 'agreements.manage', 'commercial.read', 'commercial.prepare', 'commercial.approve']);
  const checker = await adminToken(['commercial.read', 'commercial.approve', 'proposals.read']);
  const readOnly = await adminToken(['proposals.read']);
  const { user, token: customerToken } = await customer();
  const intruder = await customer('Someone Else');
  const event = await weddingEvent(user._id);
  const vendors = { catering: await vendor('Catering'), decor: await vendor('Decoration'), photography: await vendor('Photography') };
  const readiness = async () => (await request(app).get(`${S}/events/${event._id}/readiness`).set(auth(maker)).expect(200)).body;

  // Manifest: built from Core data, validated, frozen.
  const built = await request(app).post(`${S}/events/${event._id}/manifest`).set(auth(maker)).expect(201);
  assert.equal(built.body.manifest.validation.status, 'VALID');
  const reqs = Object.fromEntries(built.body.manifest.requirements.map((r) => [r.category, r]));
  assert.equal(reqs.catering.mandatory, true);
  assert.equal(reqs.venue.status, 'customer_provided');
  assert.equal(reqs.makeup.status, 'pending');
  assert.equal((await readiness()).state, 'REQUIREMENTS_INCOMPLETE', 'unfrozen manifest blocks');
  await request(app).post(`${S}/manifests/${built.body.manifest._id}/freeze`).set(auth(readOnly)).expect(403);
  await request(app).post(`${S}/manifests/${built.body.manifest._id}/freeze`).set(auth(maker)).expect(200);

  // G1: no agreements yet.
  let r = await readiness();
  assert.equal(r.state, 'VENDOR_APPROVAL_PENDING');
  assert.deepEqual(r.reasons.map((x) => x.status).sort(), ['missing', 'missing', 'missing']);

  // Agreements drafted from quotes, then sent.
  const agreementIds = {};
  for (const [category, v] of Object.entries(vendors)) {
    const q = await quote(v.org, user._id, category, VENDOR_PRICES[category]);
    const res = await request(app).post(`${S}/agreements`).set(auth(maker))
      .send({ quoteId: q._id, manifestId: built.body.manifest._id, category, scope: { summary: `${category} for 300 guests`, lineItems: [{ name: `${category} service`, quantity: 1, unitPrice: VENDOR_PRICES[category] }], deliverables: [`${category} as agreed`] }, terms: { validUntil: future(20) } })
      .expect(201);
    agreementIds[category] = res.body.agreement._id;
  }
  assert.ok((await readiness()).reasons.every((x) => x.status === 'not_sent'));
  for (const id of Object.values(agreementIds)) await request(app).post(`${S}/agreements/${id}/send`).set(auth(maker)).expect(200);
  assert.ok((await readiness()).reasons.every((x) => x.status === 'pending'), 'G1: pending agreements block');

  // Vendors see only their own agreements.
  const mine = await request(app).get('/api/vendor/agreements').set(auth(vendors.catering.token)).expect(200);
  assert.equal(mine.body.agreements.length, 1);
  assert.equal(mine.body.agreements[0].category, 'catering');
  await request(app).post(`/api/vendor/agreements/${agreementIds.decor}/decision`).set(auth(vendors.catering.token)).send({ decision: 'APPROVE' }).expect(404);

  await request(app).post(`/api/vendor/agreements/${agreementIds.catering}/decision`).set(auth(vendors.catering.token)).send({ decision: 'APPROVE' }).expect(200);
  await request(app).post(`/api/vendor/agreements/${agreementIds.decor}/decision`).set(auth(vendors.decor.token)).send({ decision: 'APPROVE' }).expect(200);
  await request(app).post(`/api/vendor/agreements/${agreementIds.photography}/decision`).set(auth(vendors.photography.token)).send({ decision: 'REJECT', note: 'Date clash' }).expect(200);

  // G2: rejected agreement blocks.
  r = await readiness();
  assert.equal(r.state, 'VENDOR_APPROVAL_PENDING');
  assert.deepEqual(r.reasons.map((x) => [x.category, x.status]), [['photography', 'rejected']]);

  // Revision: v1 superseded and preserved, v2 sent and approved.
  const revised = await request(app).post(`${S}/agreements/${agreementIds.photography}/revise`).set(auth(maker)).send({ reason: 'New date slot' }).expect(201);
  assert.equal(revised.body.agreement.version, 2);
  assert.equal((await VendorAgreement.findById(agreementIds.photography).lean()).status, 'SUPERSEDED');
  await request(app).post(`${S}/agreements/${revised.body.agreement._id}/send`).set(auth(maker)).expect(200);
  await request(app).post(`/api/vendor/agreements/${revised.body.agreement._id}/decision`).set(auth(vendors.photography.token)).send({ decision: 'APPROVE' }).expect(200);

  // G5: commercial approval missing.
  r = await readiness();
  assert.equal(r.state, 'COMMERCIAL_APPROVAL_PENDING');
  const blocked = await request(app).post(`${S}/events/${event._id}/generate`).set(auth(maker)).set('Idempotency-Key', key()).send({}).expect(409);
  assert.equal(blocked.body.error, 'COMMERCIAL_APPROVAL_PENDING');
  assert.equal(await ProposalVersion.countDocuments({ event: event._id }), 0, 'blocked generation creates nothing');

  // G7: pricing that does not reconcile is refused.
  const bad = commercialBody();
  bad.customerFacing.allocations[0].amount = 1;
  const mismatch = await request(app).post(`${S}/events/${event._id}/commercial`).set(auth(maker)).send(bad).expect(400);
  assert.equal(mismatch.body.error, 'PRICING_MISMATCH');

  // Maker-checker.
  const prepared = await request(app).post(`${S}/events/${event._id}/commercial`).set(auth(maker)).send(commercialBody()).expect(201);
  assert.equal(prepared.body.record.costs.vendorTotal, 290000);
  await request(app).post(`${S}/commercial/${prepared.body.record._id}/submit`).set(auth(maker)).expect(200);
  const self = await request(app).post(`${S}/commercial/${prepared.body.record._id}/decision`).set(auth(maker)).send({ decision: 'APPROVE' }).expect(403);
  assert.equal(self.body.error, 'MAKER_CHECKER_REQUIRED', 'G10');
  await request(app).post(`${S}/commercial/${prepared.body.record._id}/decision`).set(auth(checker)).send({ decision: 'APPROVE' }).expect(200);
  assert.equal((await readiness()).state, 'READY_FOR_GENERATION');

  // G12: idempotent generation.
  await request(app).post(`${S}/events/${event._id}/generate`).set(auth(maker)).send({}).expect(400);
  const idem = key();
  const g1 = await request(app).post(`${S}/events/${event._id}/generate`).set(auth(maker)).set('Idempotency-Key', idem).send({}).expect(202);
  const g2 = await request(app).post(`${S}/events/${event._id}/generate`).set(auth(maker)).set('Idempotency-Key', idem).send({}).expect(202);
  assert.equal(g1.body.version._id, g2.body.version._id);
  assert.equal(await ProposalVersion.countDocuments({ event: event._id }), 1);
  const v1 = g1.body.version;
  assert.equal(v1.status, 'APPROVED_FOR_GENERATION');
  assertNoLeak(v1.snapshot, 'snapshot');
  assert.equal(v1.snapshot.budget.packageTotal, PACKAGE_TOTAL);

  // Snapshot is immutable.
  const doc = await ProposalVersion.findById(v1._id);
  doc.snapshot = { ...doc.snapshot, budget: null };
  await assert.rejects(doc.save(), /immutable/);

  // Cannot publish before render + QA.
  await request(app).post(`${S}/versions/${v1._id}/publish`).set(auth(maker)).expect(409);
  const rendered = await renderOrSimulate(v1._id);
  if (HAS_BROWSER) assert.equal(rendered.qaPassed, true, 'PDF QA passes');
  await request(app).post(`${S}/versions/${v1._id}/publish`).set(auth(maker)).expect(200);

  // Customer surface.
  const list = await request(app).get('/api/customer/proposals').set(auth(customerToken)).expect(200);
  assert.equal(list.body.proposals.length, 1);
  const proposalId = list.body.proposals[0].proposalId;
  const view = await request(app).get(`/api/customer/proposals/${proposalId}`).set(auth(customerToken)).expect(200);
  assert.equal(view.body.status, 'CUSTOMER_VIEWED');
  assert.equal(view.body.canDecide, true);
  assertNoLeak(view.body, 'customer view');
  assertNoLeak(list.body, 'customer list');
  await request(app).get(`/api/customer/proposals/${proposalId}`).set(auth(intruder.token)).expect(404);
  await request(app).get(`/api/customer/proposals/${proposalId}/versions/1/pdf`).set(auth(intruder.token)).expect(404);

  if (HAS_BROWSER) {
    const pdfRes = await request(app).get(`/api/customer/proposals/${proposalId}/versions/1/pdf`).set(auth(customerToken)).buffer(true).parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); }).expect(200);
    assert.equal(pdfRes.headers['content-type'], 'application/pdf');
    const { text } = await pdfText(pdfRes.body);
    for (const v of FORBIDDEN_TEXT) assert.ok(!text.includes(v), `PDF leaks ${v}`);
    assert.ok(text.includes('4,12,777'), 'PDF shows the approved package total');
    assert.ok(!text.includes(PRELIMINARY_WATERMARK));
    assert.ok(await ProposalAccessLog.exists({ proposal: proposalId, action: 'DOWNLOAD' }));
  }

  // Change request → v1 no longer open for decision.
  await request(app).post(`/api/customer/proposals/${proposalId}/versions/1/change-requests`).set(auth(customerToken)).send({ items: [{ category: 'catering', type: 'modify', request: 'Add a live fuchka counter' }] }).expect(201);
  const closed = await request(app).post(`/api/customer/proposals/${proposalId}/versions/1/decision`).set(auth(customerToken)).send({ decision: 'APPROVE', snapshotHash: view.body.snapshotHash }).expect(409);
  assert.equal(closed.body.error, 'PROPOSAL_NOT_OPEN_FOR_DECISION');

  // v2 after revalidation; v1 preserved as SUPERSEDED.
  const v2res = await request(app).post(`${S}/events/${event._id}/generate`).set(auth(maker)).set('Idempotency-Key', key()).send({}).expect(202);
  const v2 = v2res.body.version;
  assert.equal(v2.version, 2);
  await renderOrSimulate(v2._id);
  await request(app).post(`${S}/versions/${v2._id}/publish`).set(auth(maker)).expect(200);
  const old = await ProposalVersion.findById(v1._id).lean();
  assert.equal(old.status, 'SUPERSEDED');
  assert.equal(old.snapshotHash, v1.snapshotHash, 'v1 content preserved');
  const stale = await request(app).post(`/api/customer/proposals/${proposalId}/versions/1/decision`).set(auth(customerToken)).send({ decision: 'APPROVE', snapshotHash: v1.snapshotHash }).expect(409);
  assert.equal(stale.body.error, 'PROPOSAL_VERSION_NOT_CURRENT');

  const view2 = await request(app).get(`/api/customer/proposals/${proposalId}/versions/2`).set(auth(customerToken)).expect(200);
  const wrongHash = await request(app).post(`/api/customer/proposals/${proposalId}/versions/2/decision`).set(auth(customerToken)).send({ decision: 'APPROVE', snapshotHash: 'tampered' }).expect(409);
  assert.equal(wrongHash.body.error, 'PROPOSAL_CONTENT_MISMATCH');

  const bookingCounts = async () => Promise.all([Reservation.countDocuments({ event: event._id }), Booking.countDocuments({ event: event._id }), Payment.countDocuments({}), CoreBooking.countDocuments({})]);
  const beforeApproval = await bookingCounts();
  const approved = await request(app).post(`/api/customer/proposals/${proposalId}/versions/2/decision`).set(auth(customerToken)).send({ decision: 'APPROVE', snapshotHash: view2.body.snapshotHash }).expect(200);
  assert.equal(approved.body.status, 'CUSTOMER_APPROVED');
  assert.equal(approved.body.bookingConfirmed, false);
  assert.deepEqual(await bookingCounts(), beforeApproval, 'approval creates no reservation, booking or payment');
  assert.equal((await CustomerEvent.findById(event._id).lean()).status, 'planning', 'event lifecycle untouched');
  assert.equal((await ProposalVersion.findById(v2._id).lean()).customerDecision.decision, 'APPROVE');

  // G9: approvals lapse between request and render → render refuses.
  const v3res = await request(app).post(`${S}/events/${event._id}/generate`).set(auth(maker)).set('Idempotency-Key', key()).send({}).expect(202);
  await VendorAgreement.updateOne({ _id: agreementIds.catering }, { $set: { 'terms.validUntil': new Date(Date.now() - 1000) } });
  const lapsed = await renderProposalVersion(v3res.body.version._id);
  assert.equal(lapsed.rendered, false);
  assert.equal((await ProposalVersion.findById(v3res.body.version._id).lean()).status, 'FAILED');

  // G3: expired agreement blocks.
  r = await readiness();
  assert.equal(r.state, 'VENDOR_APPROVAL_PENDING');
  assert.deepEqual(r.reasons.map((x) => [x.category, x.status]), [['catering', 'expired']]);
  await VendorAgreement.updateOne({ _id: agreementIds.catering }, { $set: { 'terms.validUntil': new Date(future(20)) } });
  assert.equal((await readiness()).state, 'READY_FOR_GENERATION');

  // G6: requirements changed after commercial approval.
  await CustomerEvent.updateOne({ _id: event._id }, { $set: { guestCount: 350 } });
  const rebuilt = await request(app).post(`${S}/events/${event._id}/manifest`).set(auth(maker)).expect(201);
  await request(app).post(`${S}/manifests/${rebuilt.body.manifest._id}/freeze`).set(auth(maker)).expect(200);
  r = await readiness();
  assert.equal(r.state, 'SNAPSHOT_CHANGED');
  await request(app).post(`${S}/events/${event._id}/generate`).set(auth(maker)).set('Idempotency-Key', key()).send({}).expect(409);
});

test('G8 invalid requirements block, and preliminary previews are watermarked and never approvable', { timeout: 120000 }, async () => {
  const S = '/api/admin/proposal-studio';
  const maker = await adminToken(['proposals.read', 'proposals.compose', 'proposals.publish']);
  const { user, token } = await customer('Birthday Host');

  const incomplete = await weddingEvent(user._id, { eventDate: null });
  const bad = await request(app).post(`${S}/events/${incomplete._id}/manifest`).set(auth(maker)).expect(201);
  assert.equal(bad.body.manifest.validation.status, 'INVALID');
  const freeze = await request(app).post(`${S}/manifests/${bad.body.manifest._id}/freeze`).set(auth(maker)).expect(409);
  assert.equal(freeze.body.error, 'MANIFEST_INVALID');
  const r = (await request(app).get(`${S}/events/${incomplete._id}/readiness`).set(auth(maker)).expect(200)).body;
  assert.equal(r.state, 'REQUIREMENTS_INCOMPLETE');
  assert.equal(r.reasons[0].code, 'MANIFEST_INVALID');

  const event = await CustomerEvent.create({ customer: user._id, eventType: 'birthday', title: 'Aarav turns 5', eventDate: '2027-03-10', city: 'Pune', guestCount: 60, status: 'planning' });
  await EventRequirement.create([{ event: event._id, category: 'decor', status: 'confirmed', preferences: { theme: 'Space' } }, { event: event._id, category: 'cake', status: 'confirmed' }]);
  const m = await request(app).post(`${S}/events/${event._id}/manifest`).set(auth(maker)).expect(201);
  await request(app).post(`${S}/manifests/${m.body.manifest._id}/freeze`).set(auth(maker)).expect(200);
  const pre = await request(app).post(`${S}/events/${event._id}/preliminary`).set(auth(maker)).send({ theme: 'contemporary-minimal' }).expect(201);
  assert.equal(pre.body.version.kind, 'PRELIMINARY');
  const rendered = await renderOrSimulate(pre.body.version._id);
  if (HAS_BROWSER) {
    assert.equal(rendered.qaPassed, true);
    const v = await ProposalVersion.findById(pre.body.version._id).lean();
    const { pages } = await pdfText(await readStoredPdf(v.pdf.storageKey));
    assert.ok(pages.every((p) => p.replace(/\s+/g, ' ').includes(PRELIMINARY_WATERMARK)), 'watermark on every page');
  }
  await request(app).post(`${S}/versions/${pre.body.version._id}/publish`).set(auth(maker)).expect(200);
  const list = await request(app).get('/api/customer/proposals').set(auth(token)).expect(200);
  const proposalId = list.body.proposals.find((p) => String(p.eventId) === String(event._id)).proposalId;
  const view = await request(app).get(`/api/customer/proposals/${proposalId}`).set(auth(token)).expect(200);
  assert.equal(view.body.canDecide, false);
  const refused = await request(app).post(`/api/customer/proposals/${proposalId}/versions/${view.body.version}/decision`).set(auth(token)).send({ decision: 'APPROVE', snapshotHash: view.body.snapshotHash }).expect(409);
  assert.equal(refused.body.error, 'PRELIMINARY_NOT_APPROVABLE', 'G11');
});

test('composer picks sections by event type and leaves out unapproved scope', () => {
  const base = { kind: 'FINAL', event: { type: 'corporate', typeLabel: 'Corporate event', title: 'Annual Summit', date: '2027-02-01', city: 'Mumbai', guestCount: 400 }, pending: [], customerProvided: [], exclusions: [], notes: [], terms: null, budget: null };
  const corporate = { ...base, services: ['catering', 'corporate_production', 'sound'].map((c) => ({ category: c, label: c, confirmed: true, summary: '', items: [], deliverables: [], exclusions: [], preferences: {} })) };
  assert.deepEqual(orderedServices(corporate).map((s) => s.category), ['corporate_production', 'sound', 'catering']);
  const html = composeProposalHtml(corporate, { proposalNumber: 'PRP-T', version: 1 });
  assert.ok(!/Catering &amp; Menu[\s\S]*Stage, AV/.test(html), 'production precedes catering for corporate');
  assert.ok(!html.includes('Bride'), 'no wedding wording in a corporate proposal');
  assert.ok(!html.includes('Budget &amp; Scope Allocation'), 'no budget section without approved pricing');
  assert.ok(!html.includes(PRELIMINARY_WATERMARK));
});
