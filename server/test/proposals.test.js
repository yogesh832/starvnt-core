import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { AdminSession } from '../src/admin/models/AdminSession.js';
import { signAdminAccessToken } from '../src/admin/utils/tokens.js';
import { verifyAdminAccessToken } from '../src/admin/utils/tokens.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorService } from '../src/external/models/VendorService.js';
import { CustomerEvent, EventRequirement, Booking } from '../src/customer/models/index.js';
import { EventProposal, ProposalMessage, ProposalHandover } from '../src/proposals/models.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import sharp from 'sharp';
import { readiness, money, hash } from '../src/proposals/service.js';
import { withVendorSchedule } from '../src/external/services/scheduleLock.js';
let mongo, app;
const key = () => crypto.randomUUID(), auth = t => ({ Authorization: `Bearer ${t}` });
before(async () => { mongo = await MongoMemoryServer.create(); await Promise.all([externalConn.openUri(mongo.getUri('proposals')), adminConn.openUri(mongo.getUri('proposals_admin'))]); app = createApp(); await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(m => m.init())); }, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });
async function external(type) { const u = await ExternalUser.create({ fullName: 'Test customer', email: `${key()}@test.example`, accountType: type }); const s = await ExternalSession.create({ user: u._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) }); return { u, token: signExternalAccessToken(u, s._id) }; }
async function admin(permissions) { const a = await AdminUser.create({ fullName: 'Proposal staff', email: `${key()}@test.example`, passwordHash: 'not-a-live-password', role: 'ADMIN', permissions }); const s = await AdminSession.create({ admin: a._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) }); return signAdminAccessToken(a, s._id); }
async function fixture() {
  const customer = await external('CUSTOMER'), owner = await external('VENDOR'), stranger = await external('CUSTOMER');
  const vendor = await VendorOrganization.create({ owner: owner.u._id, ownerIdentityKey: owner.u._id, businessName: key(), category: 'Photography', location: 'Kolkata', status: 'ACTIVE', isCommerciallyActive: true }); owner.u.vendorOrganization = vendor._id; await owner.u.save();
  const service = await VendorService.create({ vendor: vendor._id, name: 'Reception photography', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 1000 } });
  const event = await CustomerEvent.create({ customer: customer.u._id, title: 'Wedding reception · शुभ विवाह · শুভ বিবাহ', eventType: 'wedding', eventDate: '2027-01-31', city: 'Kolkata', guestCount: 300 });
  const requirement = await EventRequirement.create({ event: event._id, category: 'Photography', status: 'confirmed', source: 'customer', providedValue: 'Six-hour reception coverage' });
  await EventRequirement.create({ event: event._id, category: 'Decor', status: 'INFERRED', source: 'aura_inferred', providedValue: 'Unapproved AI suggestion' });
  const staff = await admin(['proposals.read', 'proposals.manage', 'proposals.approve', 'proposals.send', 'proposals.discuss', 'proposals.handover', 'execution.read']);
  const r = await request(app).post('/api/admin/proposals').set(auth(staff)).send({ event: String(event._id), idempotencyKey: key() }).expect(201);
  assert.equal(r.body.proposal.manifest.requirements.length, 1);
  return { customer, stranger, owner, vendor, service, event, requirement, staff, p: r.body.proposal };
}
const draft = f => ({ revision: f.p.revision, idempotencyKey: key(), lines: [{ name: 'Reception photography', description: 'Two photographers, six hours. Edited gallery within 30 days.', quantity: 1, customerUnitPrice: 12345.67, vendorUnitCost: 7777, fulfilment: 'VENDOR', service: String(f.service._id), requirement: String(f.requirement._id) }], taxAmount: 100, totalAmount: 12445.67, terms: '50% advance; balance before the event. Scope changes require a new approved proposal.', exclusions: 'Travel outside Kolkata and extra hours.', payments: [{ label: 'Advance', amount: 6000, due: '2027-01-01' }, { label: 'Balance', amount: 6445.67, due: '2027-01-30' }], sections: [{ title: 'Event roadmap', body: 'Welcome guests, capture the reception, deliver the edited gallery.' }] });
async function patch(f, body = draft(f)) { const r = await request(app).patch(`/api/admin/proposals/${f.p._id}`).set(auth(f.staff)).send(body).expect(200); f.p = r.body.proposal; return body; }
async function move(f, action, extra = {}, status = 200) { const r = await request(app).post(`/api/admin/proposals/${f.p._id}/${action}`).set(auth(f.staff)).send({ revision: f.p.revision, idempotencyKey: key(), reason: 'Reviewed scope and exact proposal', ...extra }).expect(status); if (r.body.proposal) f.p = r.body.proposal; return r; }
async function agreement(f) { const r = await request(app).post(`/api/vendor/proposals/${f.p._id}/agreement`).set(auth(f.owner.token)).send({ revision: f.p.revision, idempotencyKey: key(), lineId: f.p.lines[0]._id, decision: 'APPROVED', validUntil: '2028-01-01', reason: 'Agreed deliverables and procurement price' }).expect(200); f.p.revision = r.body.proposal.revision; }

test('commercial gates, private PDF, vendor agreement and exact-version customer approval preserve booking truth', async () => {
  const f = await fixture(); await patch(f); await move(f, 'freeze', {}, 409);
  await request(app).get('/api/customer/proposals').set(auth(f.customer.token)).expect(200).then(r => assert.equal(r.body.proposals.length, 0));
  const vendorList = await request(app).get('/api/vendor/proposals').set(auth(f.owner.token)).expect(200); assert.equal(vendorList.body.proposals[0].lines[0].vendorUnitCost, 7777); assert.equal(vendorList.body.proposals[0].lines[0].customerUnitPrice, undefined); assert.equal(vendorList.body.proposals[0].event.customerName, undefined);
  const image = await sharp({ create: { width: 500, height: 300, channels: 3, background: '#641d37' } }).png().toBuffer();
  await request(app).post(`/api/admin/proposals/${f.p._id}/visuals`).set(auth(f.staff)).field('revision', String(f.p.revision)).field('source', 'AI_CONCEPT').field('title', 'Concept reference').field('attribution', 'Synthetic acceptance-test image').attach('file', image, 'reference.png').expect(400);
  const visual = await request(app).post(`/api/admin/proposals/${f.p._id}/visuals`).set(auth(f.staff)).field('revision', String(f.p.revision)).field('source', 'AI_CONCEPT').field('title', 'Concept reference').field('attribution', 'Synthetic acceptance-test image').field('rightsConfirmed', 'true').attach('file', image, 'reference.png').expect(201); f.p = visual.body.proposal;
  await agreement(f); await move(f, 'freeze');
  await request(app).delete(`/api/admin/proposals/${f.p._id}/visuals/${f.p.visuals[0].asset}`).set(auth(f.staff)).send({ revision: f.p.revision }).expect(409);
  await move(f, 'quality', { pdfHash: 'not-reviewed' }, 409); await move(f, 'pdf');
  assert.match(f.p.pdfHash, /^[a-f0-9]{64}$/);
  const saved = await EventProposal.findById(f.p._id).select('+pdf'); assert.equal(hash(saved.pdf), f.p.pdfHash); assert.equal(saved.pdf.subarray(0, 4).toString(), '%PDF');
  mkdirSync('../tmp/pdfs', { recursive: true }); writeFileSync('../tmp/pdfs/proposal-acceptance.pdf', saved.pdf);
  await move(f, 'quality', { pdfHash: f.p.pdfHash }); await move(f, 'send');
  const list = await request(app).get('/api/customer/proposals').set(auth(f.customer.token)).expect(200); const c = list.body.proposals.find(p => p._id === f.p._id); assert.equal(c.lines[0].vendorUnitCost, undefined); assert.equal(c.lines[0].agreement, undefined); assert.equal(c.commercialApproval, undefined);
  await request(app).get(`/api/customer/proposals/${f.p._id}/pdf`).set(auth(f.stranger.token)).expect(404);
  await request(app).get(`/api/customer/proposals/${f.p._id}/pdf`).set(auth(f.customer.token)).expect(200).expect('Content-Type', /pdf/);
  const beforeBookings = await Booking.countDocuments();
  const response = { decision: 'APPROVED', snapshotHash: c.snapshotHash, pdfHash: c.pdfHash };
  await request(app).post(`/api/customer/proposals/${c._id}/response`).set(auth(f.customer.token)).send({ ...response, snapshotHash: 'stale' }).expect(409);
  await request(app).post(`/api/customer/proposals/${c._id}/response`).set(auth(f.customer.token)).send(response).expect(200).then(r => assert.equal(r.body.bookingConfirmed, false));
  await request(app).post(`/api/customer/proposals/${c._id}/response`).set(auth(f.customer.token)).send(response).expect(200);
  assert.equal(await Booking.countDocuments(), beforeBookings); assert.equal((await CustomerEvent.findById(f.event._id)).status, 'draft');
  await request(app).patch(`/api/admin/proposals/${c._id}`).set(auth(f.staff)).send(draft(f)).expect(409);
  const revised = await request(app).post('/api/admin/proposals').set(auth(f.staff)).send({ event: String(f.event._id), from: c._id, idempotencyKey: key() }).expect(201); assert.equal(revised.body.proposal.version, 2); assert.equal(revised.body.proposal.lines[0].agreement.status, 'PENDING'); assert.equal(revised.body.proposal.pdfHash, undefined);
});

test('RBAC, tenant ownership, money reconciliation, stale updates and event changes fail closed', async () => {
  const f = await fixture(), reader = await admin(['proposals.read']);
  await request(app).get('/api/admin/proposals').set(auth(f.customer.token)).expect(401);
  await request(app).post('/api/admin/proposals').set(auth(reader)).send({ event: String(f.event._id), idempotencyKey: key() }).expect(403);
  const body = await patch(f);
  await request(app).patch(`/api/admin/proposals/${f.p._id}`).set(auth(f.staff)).send({ ...draft(f), lines: [null] }).expect(400);
  await request(app).post('/api/admin/proposals').set(auth(f.staff)).send({ event: { $ne: null }, idempotencyKey: key() }).expect(400);
  await request(app).patch(`/api/admin/proposals/${f.p._id}`).set(auth(f.staff)).send(body).expect(200); // same request replays
  await request(app).patch(`/api/admin/proposals/${f.p._id}`).set(auth(f.staff)).send({ ...body, terms: 'changed reuse' }).expect(409);
  await request(app).patch(`/api/admin/proposals/${f.p._id}`).set(auth(f.staff)).send({ ...draft(f), revision: 0 }).expect(409);
  const other = await external('VENDOR'), org = await VendorOrganization.create({ owner: other.u._id, ownerIdentityKey: other.u._id, businessName: key(), category: 'Photography', location: 'Kolkata' }); other.u.vendorOrganization = org._id; await other.u.save();
  await request(app).post(`/api/vendor/proposals/${f.p._id}/agreement`).set(auth(other.token)).send({ revision: f.p.revision, lineId: f.p.lines[0]._id, decision: 'APPROVED', validUntil: '2028-01-01', reason: 'not my scope', idempotencyKey: key() }).expect(404);
  await agreement(f); await CustomerEvent.updateOne({ _id: f.event._id }, { $set: { guestCount: 301 } }); await move(f, 'freeze', {}, 409);
  await patch(f, { ...draft(f), totalAmount: 1 }); await agreement(f); await move(f, 'freeze', {}, 409);
  await patch(f); await agreement(f); await EventProposal.updateOne({ _id: f.p._id }, { $set: { 'lines.0.agreement.validUntil': new Date(0) } }); await move(f, 'freeze', {}, 409);
});

test('fractional money and invalid quantities cannot pass reconciliation', () => {
  for (const amount of [-1, Infinity, NaN, '100', 0.001]) assert.throws(() => money(amount));
  assert.equal(money(12345.67), 12345.67);
  assert.equal(readiness({ manifest: {}, lines: [{ quantity: 0.5, customerUnitPrice: 10 }], taxAmount: 0, totalAmount: 5 }).ready, false);
});

test('confirmed requirement coverage cannot silently omit or contradict the event brief', async () => {
  const f = await fixture(), d = draft(f); delete d.lines[0].requirement; await patch(f, d); await agreement(f); await move(f, 'freeze', {}, 409);
  const excluded = draft(f); excluded.excludedRequirements = [{ requirement: String(f.requirement._id), reason: 'Customer will use their own photographer' }]; await patch(f, excluded); await agreement(f); await move(f, 'freeze', {}, 409); // included and excluded contradict
  const unknown = draft(f); unknown.lines[0].requirement = String(f.event._id); await request(app).patch(`/api/admin/proposals/${f.p._id}`).set(auth(f.staff)).send(unknown).expect(400);
  await patch(f); await agreement(f); await EventRequirement.updateOne({ _id: f.requirement._id }, { $set: { providedValue: 'Changed confirmed brief' } }); await move(f, 'freeze', {}, 409);
});

test('supplier suspension, service withdrawal and owner revocation invalidate final approval gates', async () => {
  const f = await fixture(); await patch(f); await agreement(f);
  await VendorService.updateOne({ _id: f.service._id }, { $set: { status: 'PAUSED' } }); await move(f, 'freeze', {}, 409);
  await VendorService.updateOne({ _id: f.service._id }, { $set: { status: 'ACTIVE' } });
  await VendorOrganization.updateOne({ _id: f.vendor._id }, { $set: { isCommerciallyActive: false } }); await move(f, 'freeze', {}, 409);
  await VendorOrganization.updateOne({ _id: f.vendor._id }, { $set: { isCommerciallyActive: true } });
  await ExternalUser.updateOne({ _id: f.owner.u._id }, { $set: { status: 'DISABLED' } }); await move(f, 'freeze', {}, 409);
  await ExternalUser.updateOne({ _id: f.owner.u._id }, { $set: { status: 'ACTIVE' } }); await move(f, 'freeze');
});

async function sent(f) { await patch(f); await agreement(f); await move(f, 'freeze'); await move(f, 'pdf'); await move(f, 'quality', { pdfHash: f.p.pdfHash }); await move(f, 'send'); }
async function customerApproves(f) { await request(app).post(`/api/customer/proposals/${f.p._id}/response`).set(auth(f.customer.token)).send({ decision: 'APPROVED', snapshotHash: f.p.snapshotHash, pdfHash: f.p.pdfHash }).expect(200); }
async function handoverAction(f, action, payload, token = f.staff, status = 200) { return request(app).post(`/api/admin/proposals/${f.p._id}/handover/${action}`).set(auth(token)).send({ revision: 0, idempotencyKey: key(), reason: 'Reviewed exact scope and operations responsibility', ...payload }).expect(status); }
async function coreBooking(f, extra = {}) { return CoreBooking.create({ bookingReference: key(), customerEvent: f.event._id, customerId: f.customer.u._id, vendorId: f.vendor._id, vendorService: f.service._id, serviceName: 'Reception photography', eventDate: f.event.eventDate, totalAmount: 12445.67, paymentStatus: 'PAYMENT_VERIFIED', bookingStatus: 'CONFIRMED', ...extra }); }

test('version discussions isolate customer, vendor and internal channels, including reply IDs and request replays', async () => {
  const f = await fixture(), path = `/api/admin/proposals/${f.p._id}/messages`, customerPath = `/api/customer/proposals/${f.p._id}/messages`, vendorPath = `/api/vendor/proposals/${f.p._id}/messages`;
  await patch(f);
  await request(app).get(customerPath).set(auth(f.customer.token)).expect(404);
  const reader = await admin(['proposals.read']); await request(app).get(path).query({ audience: 'INTERNAL' }).set(auth(reader)).expect(403);
  const internal = await request(app).post(path).set(auth(f.staff)).send({ audience: 'INTERNAL', body: 'Internal procurement cost 7777', idempotencyKey: key() }).expect(201);
  await request(app).post(path).set(auth(f.staff)).send({ audience: 'CUSTOMER', body: 'Not yet published', idempotencyKey: key() }).expect(409);
  const vendorMessage = { body: 'Question about my assigned scope', audience: 'INTERNAL', idempotencyKey: key() };
  const v = await request(app).post(vendorPath).set(auth(f.owner.token)).send(vendorMessage).expect(201); assert.equal(v.body.message.audience, 'VENDOR');
  const vendorRead = await request(app).get(vendorPath).set(auth(f.owner.token)).expect(200); assert.equal(vendorRead.body.messages.length, 1); assert.equal(vendorRead.body.messages[0].author, undefined);
  const otherVendor = await fixture();
  await request(app).get(vendorPath).set(auth(otherVendor.owner.token)).expect(404);
  await request(app).post(path).set(auth(f.staff)).send({ audience: 'VENDOR', vendor: String(otherVendor.vendor._id), body: 'Wrong supplier audience', idempotencyKey: key() }).expect(404);
  await sent(f);
  const post = { audience: 'CUSTOMER', body: 'Please review the reception scope', idempotencyKey: key() };
  const first = await request(app).post(path).set(auth(f.staff)).send(post).expect(201);
  await request(app).post(path).set(auth(f.staff)).send(post).expect(201).then(r => assert.equal(r.body.message._id, first.body.message._id));
  await request(app).post(path).set(auth(f.staff)).send({ ...post, body: 'Changed replay' }).expect(409);
  await request(app).post(customerPath).set(auth(f.customer.token)).send({ body: 'Trying an internal reply', replyTo: internal.body.message._id, idempotencyKey: key() }).expect(404);
  await request(app).post(customerPath).set(auth(f.customer.token)).send({ body: 'Is the gallery delivery included?', audience: 'INTERNAL', replyTo: first.body.message._id, idempotencyKey: key() }).expect(201).then(r => assert.equal(r.body.message.audience, 'CUSTOMER'));
  const c = await request(app).get(customerPath).set(auth(f.customer.token)).expect(200); assert.equal(c.body.messages.length, 2); assert.equal(JSON.stringify(c.body).includes('procurement'), false);
  await request(app).get(customerPath).set(auth(f.stranger.token)).expect(404);
  await request(app).get(vendorPath).set(auth(f.customer.token)).expect(403);
  await request(app).get(customerPath).query({ after: 'NaN' }).set(auth(f.customer.token)).expect(400);
  const next = await request(app).get(customerPath).query({ after: c.body.next }).set(auth(f.customer.token)).expect(200); assert.equal(next.body.messages.length, 0);
  assert.equal(await ProposalMessage.countDocuments({ proposal: f.p._id }), 4);
  await ProposalMessage.insertMany(Array.from({ length: 51 }, (_, i) => ({ proposal: f.p._id, sequence: 5 + i, audience: 'CUSTOMER', authorDomain: 'ADMIN', author: 'fixture', body: `Follow-up ${i}`, requestKey: key(), requestHash: key() })));
  const page1 = await request(app).get(customerPath).set(auth(f.customer.token)).expect(200); assert.equal(page1.body.messages.length, 50); assert.equal(page1.body.hasMore, true);
  const page2 = await request(app).get(customerPath).query({ after: page1.body.next }).set(auth(f.customer.token)).expect(200); assert.equal(page2.body.messages.length, 3); assert.equal(page2.body.hasMore, false); assert.equal(new Set([...page1.body.messages, ...page2.body.messages].map(m => m._id)).size, 53);
  assert.equal((await EventProposal.findById(f.p._id)).snapshotHash, f.p.snapshotHash);
});

test('operations handover requires real matching verified bookings and only the active assigned owner can complete its checklist', async () => {
  const f = await fixture(); await sent(f);
  await withVendorSchedule(`PROPOSAL_EVENT:${f.event._id}`, async () => {
    await request(app).post(`/api/customer/proposals/${f.p._id}/response`).set(auth(f.customer.token)).send({ decision: 'APPROVED', snapshotHash: f.p.snapshotHash, pdfHash: f.p.pdfHash }).expect(409).then(r => assert.equal(r.body.error, 'SCHEDULE_BUSY'));
  });
  const operator = await admin(['proposals.read', 'proposals.handover', 'execution.read']), operatorId = verifyAdminAccessToken(operator).sub;
  const plan = { assignee: operatorId, notes: 'Internal coordination instructions', tasks: [{ title: 'Confirm arrival and six-hour coverage', due: '2027-01-30' }] };
  await handoverAction(f, 'prepare', plan, f.staff, 409); await customerApproves(f);
  const reader = await admin(['proposals.read']); await handoverAction(f, 'prepare', plan, reader, 403);
  let r = await handoverAction(f, 'prepare', plan), h = r.body.handover;
  const binding = booking => ({ revision: h.revision, bindings: [{ lineId: f.p.lines[0]._id, bookingId: String(booking._id), allocatedCharges: 100 }] });
  const unpaid = await coreBooking(f, { paymentStatus: 'PENDING' }); await handoverAction(f, 'release', binding(unpaid), f.staff, 409);
  const wrong = await coreBooking(f, { customerId: f.stranger.u._id }); await handoverAction(f, 'release', binding(wrong), f.staff, 409);
  const mismatch = await coreBooking(f, { totalAmount: 1 }); await handoverAction(f, 'release', binding(mismatch), f.staff, 409);
  const scopeOnly = await coreBooking(f, { totalAmount: 12345.67 });
  await handoverAction(f, 'release', { revision: h.revision, bindings: [{ lineId: f.p.lines[0]._id, bookingId: String(scopeOnly._id), allocatedCharges: 0 }] }, f.staff, 409).then(result => assert.equal(result.body.error, 'HANDOVER_CHARGES'));
  const booking = await coreBooking(f), before = await CoreBooking.findById(booking._id).lean();
  const release = { ...binding(booking), idempotencyKey: key() }; r = await handoverAction(f, 'release', release); h = r.body.handover;
  await request(app).get('/api/admin/proposals/handover/assigned').set(auth(operator)).expect(200).then(result => { assert.equal(result.body.handovers.length, 1); assert.equal(result.body.handovers[0].proposal._id, f.p._id); assert.equal(result.body.handovers[0].state, 'RELEASED'); });
  await request(app).get('/api/admin/proposals/handover/assigned').set(auth(f.staff)).expect(200).then(result => assert.equal(result.body.handovers.length, 0));
  await request(app).get('/api/admin/proposals/handover/assigned').query({ before: 'invalid' }).set(auth(operator)).expect(400);
  await request(app).get(`/api/admin/proposals/${f.p._id}`).set(auth(operator)).expect(200).then(result => assert.equal(result.body.proposal._id, f.p._id));
  await request(app).get('/api/admin/proposals/options').set(auth(f.staff)).expect(200).then(result => assert.equal(Array.isArray(result.body.events), true));
  await handoverAction(f, 'release', release).then(replayed => assert.equal(replayed.body.handover.revision, h.revision));
  await handoverAction(f, 'accept', { revision: h.revision }, f.staff, 403);
  await AdminUser.updateOne({ _id: operatorId }, { $set: { status: 'DISABLED' } });
  await handoverAction(f, 'accept', { revision: h.revision }, operator, 401);
  await AdminUser.updateOne({ _id: operatorId }, { $set: { status: 'ACTIVE' } });
  r = await handoverAction(f, 'accept', { revision: h.revision }, operator); h = r.body.handover;
  await handoverAction(f, 'complete', { revision: h.revision }, operator, 409);
  r = await handoverAction(f, 'task', { revision: h.revision, taskId: h.tasks[0]._id, status: 'BLOCKED', reason: 'Waiting for the vendor arrival confirmation' }, operator); h = r.body.handover;
  await CoreBooking.updateOne({ _id: booking._id }, { $set: { bookingStatus: 'CANCELLED' } });
  await handoverAction(f, 'task', { revision: h.revision, taskId: h.tasks[0]._id, status: 'DONE' }, operator, 409);
  await CoreBooking.updateOne({ _id: booking._id }, { $set: { bookingStatus: 'CONFIRMED' } });
  await handoverAction(f, 'task', { revision: h.revision - 1, taskId: h.tasks[0]._id, status: 'DONE' }, operator, 409);
  r = await handoverAction(f, 'task', { revision: h.revision, taskId: h.tasks[0]._id, status: 'DONE' }, operator); h = r.body.handover;
  r = await handoverAction(f, 'complete', { revision: h.revision }, operator); assert.equal(r.body.handover.state, 'COMPLETED');
  const afterBooking = await CoreBooking.findById(booking._id).lean(); assert.equal(afterBooking.bookingStatus, before.bookingStatus); assert.equal(afterBooking.paymentStatus, before.paymentStatus); assert.equal(afterBooking.executionStatus, before.executionStatus); assert.equal(await Booking.countDocuments({ event: f.event._id }), 0);
  await request(app).get(`/api/customer/proposals/${f.p._id}/handover`).set(auth(f.customer.token)).expect(404);
  await request(app).get('/api/customer/proposals').set(auth(f.customer.token)).expect(200).then(result => assert.equal(JSON.stringify(result.body).includes('Internal coordination'), false));
});

test('handover scope cannot survive a changed approved brief or a newer sent version', async () => {
  const f = await fixture(); await sent(f); await customerApproves(f);
  const plan = { assignee: verifyAdminAccessToken(f.staff).sub, tasks: [{ title: 'Coordinate vendor arrival' }] };
  const r = await handoverAction(f, 'prepare', plan); const h = r.body.handover;
  const booking = await coreBooking(f);
  await CustomerEvent.updateOne({ _id: f.event._id }, { $set: { guestCount: 301 } });
  const binding = { revision: h.revision, bindings: [{ lineId: f.p.lines[0]._id, bookingId: String(booking._id), allocatedCharges: 100 }] };
  await handoverAction(f, 'release', binding, f.staff, 409);
  await CustomerEvent.updateOne({ _id: f.event._id }, { $set: { guestCount: 300 } });
  await EventProposal.create({ event: f.event._id, customer: f.customer.u._id, version: 2, state: 'SENT', manifest: f.p.manifest });
  await handoverAction(f, 'release', binding, f.staff, 409);
  assert.equal((await ProposalHandover.findOne({ proposal: f.p._id })).state, 'PREPARED');
});
