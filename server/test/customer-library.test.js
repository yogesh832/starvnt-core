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
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { CustomerEvent, CustomerFavorite, CustomerContractDocument, EventRequirement, Payment, CustomerNotification } from '../src/customer/models/index.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { EventProposal } from '../src/proposals/models.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { Notification } from '../src/external/models/Notification.js';
import { VendorMessageThread } from '../src/external/models/VendorMessageThread.js';

let mongo, app, owner, stranger, partner, event, other, foreign, paid, verified, invoice, unissued, proposal;
const key = () => crypto.randomUUID(), id = () => new mongoose.Types.ObjectId(), auth = person => ({ Authorization: `Bearer ${person.token}` });
const pdf = Buffer.from('%PDF-1.4\n% exact frozen fixture bytes\n');
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('library')), adminConn.openUri(mongo.getUri('library_admin'))]);
  app = createApp(); await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(model => model.init()));
  async function person(accountType) {
    const user = await ExternalUser.create({ fullName: 'Library test', email: `${key()}@example.test`, accountType });
    const session = await ExternalSession.create({ user: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
    return { user, token: signExternalAccessToken(user, session._id) };
  }
  owner = await person('CUSTOMER'); stranger = await person('CUSTOMER'); partner = await person('VENDOR');
  const makeEvent = customer => CustomerEvent.create({ customer, eventType: 'wedding', title: key(), status: 'planning', eventDate: '2028-10-20', city: 'Kolkata' });
  event = await makeEvent(owner.user._id); other = await makeEvent(owner.user._id); foreign = await makeEvent(stranger.user._id);
  paid = await Payment.create({ event: event._id, customer: owner.user._id, reservation: id(), amount: 200, status: 'paid' });
  verified = await Payment.create({ event: event._id, customer: owner.user._id, reservation: id(), amount: 300, status: 'verified', verifiedAt: new Date() });
  const core = { vendorId: id(), customerId: owner.user._id, customerEvent: event._id, serviceName: 'Photography', eventDate: event.eventDate, totalAmount: 1000 };
  invoice = await CoreBooking.create({ ...core, taxSummary: { invoiceNumber: 'ISSUED-FIXTURE', invoiceIssuedAt: new Date() } });
  unissued = await CoreBooking.create({ ...core, bookingReference: key() });
  const snapshot = { manifest: { title: 'Exact reception proposal' }, totalAmount: 1000 };
  proposal = await EventProposal.create({ event: event._id, customer: owner.user._id, version: 2, manifest: snapshot.manifest, frozenSnapshot: snapshot, state: 'SENT', pdf, pdfHash: crypto.createHash('sha256').update(pdf).digest('hex'), history: [{ action: 'send', at: new Date() }] });
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });

test('documents use event ownership and type filters without date-based association', async () => {
  const { body } = await request(app).get(`/api/customer/documents?eventId=${event._id}`).set(auth(owner)).expect(200);
  assert.ok(body.documents.length >= 5); assert.ok(body.documents.every(doc => doc.event.id === String(event._id)));
  const invoices = await request(app).get(`/api/customer/documents?eventId=${event._id}&type=invoice`).set(auth(owner)).expect(200);
  assert.equal(invoices.body.documents.length, 2);
  const empty = await request(app).get(`/api/customer/documents?eventId=${other._id}`).set(auth(owner)).expect(200); assert.equal(empty.body.documents.length, 0);
  await request(app).get(`/api/customer/documents?eventId=${foreign._id}`).set(auth(owner)).expect(404);
  await request(app).get('/api/customer/documents?type=unsupported').set(auth(owner)).expect(400);
});
test('a browser payment response cannot issue a receipt; verified receipts remain downloadable', async () => {
  const { body } = await request(app).get('/api/customer/documents?type=receipt').set(auth(owner)).expect(200);
  assert.equal(body.documents.find(doc => doc.id.endsWith(String(paid._id))).canDownload, false);
  assert.equal(body.documents.find(doc => doc.id.endsWith(String(verified._id))).canDownload, true);
  await request(app).get(`/api/customer/documents/payment_receipt_${paid._id}/download`).set(auth(owner)).expect(404);
  await request(app).get(`/api/customer/documents/payment_receipt_${verified._id}/download`).set(auth(owner)).expect(200).expect('Content-Type', /pdf/);
  await request(app).get(`/api/customer/documents/payment_receipt_${verified._id}/download`).set(auth(stranger)).expect(404);
});
test('invoice list and download enforce the same issuance eligibility', async () => {
  const { body } = await request(app).get('/api/customer/documents?type=invoice').set(auth(owner)).expect(200);
  assert.equal(body.documents.find(doc => doc.id.endsWith(String(unissued._id))).canDownload, false);
  await request(app).get(`/api/customer/documents/core_invoice_${unissued._id}/download`).set(auth(owner)).expect(409);
  await request(app).get(`/api/customer/documents/core_invoice_${invoice._id}/download`).set(auth(owner)).expect(200);
  await request(app).get(`/api/customer/documents/core_invoice_${invoice._id}/download`).set(auth(stranger)).expect(404);
});
test('Vault proposal downloads return exact frozen bytes with integrity and ownership checks', async () => {
  const response = await request(app).get(`/api/customer/documents/proposal_${proposal._id}/download`).set(auth(owner)).expect(200);
  assert.deepEqual(response.body, pdf);
  await request(app).get(`/api/customer/documents/proposal_${proposal._id}/download`).set(auth(stranger)).expect(404);
  await EventProposal.updateOne({ _id: proposal._id }, { $set: { pdfHash: 'invalid' } });
  await request(app).get(`/api/customer/documents/proposal_${proposal._id}/download`).set(auth(owner)).expect(409);
});
test('contract link registration and delivery are owned, HTTPS-only and do not imply acceptance', async () => {
  const body = { title: 'Stored agreement link', fileUrl: 'https://files.example.test/agreement.pdf', eventId: String(event._id) };
  await request(app).post('/api/customer/documents/contracts').set(auth(owner)).send({ ...body, fileUrl: 'http://files.example.test/agreement.pdf' }).expect(400);
  await request(app).post('/api/customer/documents/contracts').set(auth(owner)).send({ ...body, eventId: String(foreign._id) }).expect(404);
  const created = await request(app).post('/api/customer/documents/contracts').set(auth(owner)).send(body).expect(201);
  const docId = created.body.document.id;
  const target = await request(app).get(`/api/customer/documents/${docId}/download?delivery=link`).set(auth(owner)).expect(200);
  assert.equal(target.body.downloadUrl, body.fileUrl);
  await request(app).get(`/api/customer/documents/${docId}/download?delivery=link`).set(auth(stranger)).expect(404);
  const stored = await CustomerContractDocument.findOne({ title: body.title }).lean(); assert.equal(stored.status, 'ACTIVE');
  assert.equal(stored.acceptedAt, undefined);
});
test('saving is replay-safe and causes no enquiry, message or notification; selections remain separate', async () => {
  const counts = await Promise.all([Opportunity.countDocuments(), Notification.countDocuments(), VendorMessageThread.countDocuments()]);
  const body = { eventId: String(event._id), optionId: 'vs_saved_fixture', vendorName: 'Saved studio', category: 'photography', price: 0 };
  const a = await request(app).post('/api/customer/favorites').set(auth(owner)).send(body).expect(201);
  const b = await request(app).post('/api/customer/favorites').set(auth(owner)).send(body).expect(201);
  assert.equal(a.body.favorite.id, b.body.favorite.id);
  await EventRequirement.create({ event: other._id, category: 'photography', status: 'pending', selectedOptionId: body.optionId, selectedOption: { vendorName: 'Saved studio', price: 0 } });
  const { body: listed } = await request(app).get('/api/customer/favorites').set(auth(owner)).expect(200);
  assert.equal(listed.favorites.filter(row => row.optionId === body.optionId).length, 2);
  assert.deepEqual(await Promise.all([Opportunity.countDocuments(), Notification.countDocuments(), VendorMessageThread.countDocuments()]), counts);
});
test('a saved reference cannot silently move scopes, including concurrent first saves', async () => {
  const body = { vendorName: 'Race studio', optionId: 'vs_scope_race' };
  const results = await Promise.all([event, other].map(row => request(app).post('/api/customer/favorites').set(auth(owner)).send({ ...body, eventId: String(row._id) })));
  assert.deepEqual(results.map(row => row.status).sort(), [201, 409]);
  assert.equal(await CustomerFavorite.countDocuments({ customer: owner.user._id, optionId: body.optionId }), 1);
  const saved = await CustomerFavorite.findOne({ optionId: body.optionId }).lean();
  await request(app).post('/api/customer/favorites').set(auth(owner)).send(body).expect(409);
  await request(app).delete(`/api/customer/favorites/${saved._id}`).set(auth(stranger)).expect(404);
  assert.equal(String((await CustomerFavorite.findById(saved._id)).event), String(saved.event));
});
test('update projections preserve exact source identity and saved destinations', async () => {
  const messageId = id(), target = `/customer/events/${event._id}/quotes?quote=${id()}`;
  const note = await CustomerNotification.create({ customer: owner.user._id, event: event._id, title: 'Exact source', type: 'quote', actionUrl: target, payload: { messageId } });
  const { body } = await request(app).get('/api/customer/updates').set(auth(owner)).expect(200);
  const row = body.notifications.find(item => item.id === String(note._id));
  assert.equal(row.to, target); assert.equal(row.sourceType, 'event_message'); assert.equal(row.sourceId, String(messageId)); assert.equal(row.readAt, null);
});
test('library endpoints deny vendors and missing sessions', async () => {
  for (const path of ['/api/customer/documents', '/api/customer/favorites']) {
    await request(app).get(path).set(auth(partner)).expect(403); await request(app).get(path).expect(401);
  }
});
