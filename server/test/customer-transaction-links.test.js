import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { CustomerEvent } from '../src/customer/models/index.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { Quote } from '../src/external/models/Quote.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorService } from '../src/external/models/VendorService.js';
import { EventProposal } from '../src/proposals/models.js';

let mongo, app, owner, stranger, partner, eventA, eventB, eventOther, quoteA, proposalA;
const key = () => crypto.randomUUID(), auth = person => ({ Authorization: `Bearer ${person.token}` });
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('transaction_links')), adminConn.openUri(mongo.getUri('transaction_admin'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(model => model.init()));
  async function person(accountType) {
    const user = await ExternalUser.create({ fullName: 'Isolated transaction test', email: `${key()}@example.test`, accountType });
    const session = await ExternalSession.create({ user: user._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
    return { user, token: signExternalAccessToken(user, session._id) };
  }
  owner = await person('CUSTOMER'); stranger = await person('CUSTOMER'); partner = await person('VENDOR');
  const event = (customer, title) => CustomerEvent.create({ customer, title, eventType: 'wedding', status: 'planning', eventDate: '2028-10-20', city: 'Kolkata' });
  eventA = await event(owner.user._id, 'First event'); eventB = await event(owner.user._id, 'Same-day second event'); eventOther = await event(stranger.user._id, 'Private event');
  const vendor = await VendorOrganization.create({ owner: partner.user._id, businessName: 'Isolated studio' });
  const service = await VendorService.create({ vendor: vendor._id, name: 'Photography', category: 'Photography', pricing: { basePrice: 10000 } });
  for (const row of [eventA, eventB, eventOther]) {
    const opportunity = await Opportunity.create({ vendor: vendor._id, vendorService: service._id, customer: row.customer, customerEvent: row._id, serviceName: 'Photography', eventDate: row.eventDate });
    const quote = await Quote.create({ opportunity: opportunity._id, vendor: vendor._id, customer: row.customer, vendorService: service._id, serviceName: row.title, eventDate: row.eventDate, pricingBreakdown: { basePrice: 1000, totalAmount: 1000 }, status: 'SUBMITTED', advancePayment: { percentage: 20, amount: 200 } });
    if (row === eventA) quoteA = quote;
    const snapshot = { manifest: { title: row.title, eventDate: row.eventDate, city: row.city }, lines: [], sections: [], payments: [], totalAmount: 1000 };
    const proposal = await EventProposal.create({ event: row._id, customer: row.customer, version: 1, state: 'SENT', manifest: snapshot.manifest, frozenSnapshot: snapshot, snapshotHash: key(), pdfHash: key() });
    if (row === eventA) proposalA = proposal;
  }
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });

test('same-day event offers and enquiries are isolated by saved event ID', async () => {
  const { body } = await request(app).get(`/api/customer/vendor-quotes?eventId=${eventA._id}`).set(auth(owner)).expect(200);
  assert.deepEqual(body.quotes.map(row => row.id), [String(quoteA._id)]);
  assert.ok(body.opportunities.every(row => row.customerEvent === String(eventA._id)));
  assert.equal(body.quotes[0].advancePercentage, 20); assert.equal(body.quotes[0].advanceAmount, 200);
});
test('changing an event date does not hide its linked offer', async () => {
  await CustomerEvent.updateOne({ _id: eventA._id }, { $set: { eventDate: '2028-10-21' } });
  const { body } = await request(app).get(`/api/customer/vendor-quotes?eventId=${eventA._id}`).set(auth(owner)).expect(200);
  assert.equal(body.quotes[0].id, String(quoteA._id)); assert.equal(body.quotes[0].eventDate, '2028-10-20');
});
test('cross-event acceptance is rejected before commercial mutations', async () => {
  const { body } = await request(app).post(`/api/customer/vendor-quotes/${quoteA._id}/accept`).set(auth(owner)).send({ eventId: String(eventB._id) }).expect(409);
  assert.equal(body.error, 'QUOTE_EVENT_MISMATCH');
  assert.equal((await Quote.findById(quoteA._id)).status, 'SUBMITTED');
});
test('event proposal lists preserve exact frozen versions and keep global listing compatible', async () => {
  const scoped = await request(app).get(`/api/customer/proposals?eventId=${eventA._id}`).set(auth(owner)).expect(200);
  assert.deepEqual(scoped.body.proposals.map(row => row._id), [String(proposalA._id)]);
  assert.equal(scoped.body.proposals[0].pdfHash, proposalA.pdfHash);
  const all = await request(app).get('/api/customer/proposals').set(auth(owner)).expect(200);
  assert.equal(all.body.proposals.length, 2);
});
test('scoped offer and proposal routes reject other customers, vendors and missing sessions', async () => {
  for (const path of ['/api/customer/vendor-quotes', '/api/customer/proposals']) {
    await request(app).get(`${path}?eventId=${eventOther._id}`).set(auth(owner)).expect(404);
    await request(app).get(`${path}?eventId=invalid`).set(auth(owner)).expect(400);
    await request(app).get(`${path}?eventId=${eventA._id}`).set(auth(partner)).expect(403);
    await request(app).get(`${path}?eventId=${eventA._id}`).expect(401);
  }
});
