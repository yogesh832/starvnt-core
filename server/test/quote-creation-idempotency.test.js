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
import { VendorService } from '../src/external/models/VendorService.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { Quote } from '../src/external/models/Quote.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { quoteCreationCommand } from '../src/common/quoteCreationCommand.js';
import { maskOpportunityCustomer } from '../src/external/services/opportunityPrivacy.service.js';

const key = () => crypto.randomUUID();
let mongo, app;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('quote_commands_external')), adminConn.openUri(mongo.getUri('quote_commands_admin'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(model => model.init()));
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });
async function fixture() {
  const user = await ExternalUser.create({ fullName: 'Synthetic quote owner', email: `${key()}@example.test`, accountType: 'VENDOR' });
  const vendor = await VendorOrganization.create({ owner: user._id, businessName: 'Synthetic business', category: 'Photography' });
  user.vendorOrganization = vendor._id; await user.save();
  const session = await ExternalSession.create({ user: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  const service = await VendorService.create({ vendor: vendor._id, name: 'Synthetic service', category: 'Photography', pricing: { basePrice: 100 } });
  const opportunity = await Opportunity.create({ vendor: vendor._id, customer: user._id, vendorService: service._id, serviceName: service.name, eventDate: '2027-03-01' });
  const auth = { Authorization: `Bearer ${signExternalAccessToken(user, session._id)}` };
  const payload = { opportunityId: String(opportunity._id), vendorServiceId: String(service._id), customerId: String(user._id), serviceName: service.name, eventDate: opportunity.eventDate, serviceLocation: { city: 'Pune' }, pricingBreakdown: { basePrice: 100, totalAmount: 100 }, status: 'DRAFT', notes: 'Synthetic original intent', requestKey: key() };
  return { vendor, opportunity, auth, payload };
}
test('simultaneous quote creations recover one owned record and changed content cannot reuse its key', async () => {
  const f = await fixture();
  const send = payload => request(app).post('/api/quotes').set(f.auth).send(payload);
  const results = await Promise.all(Array.from({ length: 4 }, () => send(f.payload).expect(201)));
  const ids = new Set(results.map(result => result.body.quote._id));
  assert.equal(ids.size, 1); assert.equal(await Quote.countDocuments({ vendor: f.vendor._id }), 1);
  assert.equal(results.filter(result => result.body.replayed).length, 3);
  for (const result of results) for (const field of ['creationRequestKey', 'creationRequestHash', 'creationRequestActor']) assert.equal(result.body.quote[field], undefined);
  await send({ ...f.payload, notes: 'Changed intent' }).expect(409);
  await send({ ...f.payload, pricingBreakdown: { basePrice: 101, totalAmount: 101 } }).expect(409);
  await send({ ...f.payload, requestKey: '' }).expect(400);
  assert.equal(await Quote.countDocuments({ vendor: f.vendor._id }), 1);
});
test('quote request keys stay scoped to vendor and legacy calls remain compatible', async () => {
  const a = await fixture(), b = await fixture();
  b.payload.requestKey = a.payload.requestKey;
  const first = (await request(app).post('/api/quotes').set(a.auth).send(a.payload).expect(201)).body.quote;
  const second = (await request(app).post('/api/quotes').set(b.auth).send(b.payload).expect(201)).body.quote;
  assert.notEqual(first._id, second._id);
  await request(app).post('/api/quotes').set(b.auth).send(a.payload).expect(404);
  const { requestKey: _requestKey, ...legacy } = a.payload;
  await request(app).post('/api/quotes').set(a.auth).send(legacy).expect(201);
  const stored = await Quote.findById(first._id).select('+creationRequestKey +creationRequestHash +creationRequestActor');
  assert.equal(stored.creationRequestKey, a.payload.requestKey);
  assert.equal(stored.toJSON().creationRequestKey, undefined);
  assert.equal((await Quote.findById(first._id).lean()).creationRequestHash, undefined);
  const revealed = maskOpportunityCustomer({ creationRequestKey: 'private-key', creationRequestActor: 'private-actor', creationRequestHash: 'private-hash', customer: { fullName: 'Synthetic approved contact' } }, true);
  assert.equal(revealed.customer.fullName, 'Synthetic approved contact');
  for (const field of ['creationRequestKey', 'creationRequestHash', 'creationRequestActor']) assert.equal(revealed[field], undefined);
});
test('quote command fingerprints normalize object order and bind actor, vendor and intent', () => {
  const original = { key: key(), actorId: 'actor', intent: { price: 100, scope: { date: '2027-03-01', service: 'Fixture' } } };
  const ordered = { ...original, intent: { scope: { service: 'Fixture', date: '2027-03-01' }, price: 100 } };
  assert.equal(quoteCreationCommand('vendor', original).hash, quoteCreationCommand('vendor', ordered).hash);
  assert.equal(quoteCreationCommand({ _id: 'vendor' }, { ...original, actorId: { _id: 'actor' } }).hash, quoteCreationCommand('vendor', original).hash);
  assert.notEqual(quoteCreationCommand('vendor', original).hash, quoteCreationCommand('other', original).hash);
  assert.notEqual(quoteCreationCommand('vendor', original).hash, quoteCreationCommand('vendor', { ...original, actorId: 'other' }).hash);
});

test('new quotes require an owned enquiry and its service while committed requests recover after expiry', async () => {
  const f = await fixture();
  const send = payload => request(app).post('/api/quotes').set(f.auth).send(payload);
  const { opportunityId: _opportunityId, ...noSource } = f.payload;
  assert.equal((await send(noSource).expect(400)).body.error, 'OWNED_ENQUIRY_REQUIRED');
  const otherService = await VendorService.create({ vendor: f.vendor._id, name: 'Different service', category: 'Photography', pricing: { basePrice: 100 } });
  assert.equal((await send({ ...f.payload, vendorServiceId: String(otherService._id) }).expect(400)).body.error, 'QUOTE_SERVICE_MISMATCH');
  await Opportunity.updateOne({ _id: f.opportunity._id }, { $set: { status: 'DECLINED' } });
  assert.equal((await send(f.payload).expect(409)).body.error, 'ENQUIRY_NOT_OPEN');
  await Opportunity.updateOne({ _id: f.opportunity._id }, { $set: { status: 'NEW', slaExpiresAt: new Date(0) } });
  assert.equal((await send(f.payload).expect(409)).body.error, 'ENQUIRY_DEADLINE_PASSED');
  assert.equal(await Quote.countDocuments({ vendor: f.vendor._id }), 0);
  await Opportunity.updateOne({ _id: f.opportunity._id }, { $set: { slaExpiresAt: new Date(Date.now() + 3600000) } });
  const first = (await send(f.payload).expect(201)).body.quote;
  await Opportunity.updateOne({ _id: f.opportunity._id }, { $set: { status: 'EXPIRED', slaExpiresAt: new Date(0) } });
  const replay = (await send(f.payload).expect(201)).body;
  assert.equal(replay.replayed, true); assert.equal(replay.quote._id, first._id);
  await send({ ...f.payload, requestKey: key() }).expect(409);
  assert.equal(await Quote.countDocuments({ vendor: f.vendor._id }), 1);
});
