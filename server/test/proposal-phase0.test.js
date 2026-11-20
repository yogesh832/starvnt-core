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
import { CustomerEvent } from '../src/customer/models/index.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { expireStaleVendorQuotes, isQuoteExpired } from '../src/external/services/quoteStateMachine.service.js';
import { getLaunchpadProgress } from '../src/experience/launchpad.service.js';

let app, mongo;
const id = () => new mongoose.Types.ObjectId(), key = () => crypto.randomUUID();
const DAY = 86400000;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('proposal_phase0')), adminConn.openUri(mongo.getUri('proposal_phase0_admin'))]);
  app = createApp();
  await Promise.all([...Object.values(externalConn.models), ...Object.values(adminConn.models)].map(m => m.init()));
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); if (mongo) await mongo.stop(); });

function quote(extra = {}) {
  return Quote.create({ vendor: id(), customer: id(), vendorService: id(), serviceName: 'Event photos', eventDate: '2027-08-01', pricingBreakdown: { basePrice: 1000, totalAmount: 1000 }, status: 'SUBMITTED', ...extra });
}

test('isQuoteExpired only treats open quotes past validUntil as expired', () => {
  const past = new Date(Date.now() - DAY), future = new Date(Date.now() + DAY);
  assert.equal(isQuoteExpired({ status: 'SUBMITTED', validUntil: past }), true);
  assert.equal(isQuoteExpired({ status: 'DRAFT', validUntil: past }), true);
  assert.equal(isQuoteExpired({ status: 'SUBMITTED', validUntil: future }), false);
  assert.equal(isQuoteExpired({ status: 'APPROVED', validUntil: past }), false);
  assert.equal(isQuoteExpired({ status: 'SUBMITTED', validUntil: null }), false);
});

test('expireStaleVendorQuotes expires stale open quotes with history and leaves others untouched', async () => {
  const stale = await quote({ validUntil: new Date(Date.now() - DAY) });
  const fresh = await quote({ validUntil: new Date(Date.now() + DAY) });
  const approved = await quote({ status: 'APPROVED', validUntil: new Date(Date.now() - DAY) });

  const first = await expireStaleVendorQuotes();
  assert.ok(first.expired >= 1);
  const reloaded = await Quote.findById(stale._id).lean();
  assert.equal(reloaded.status, 'EXPIRED');
  assert.equal(reloaded.history.at(-1).toStatus, 'EXPIRED');
  assert.equal(reloaded.history.at(-1).changedBy, 'SYSTEM');
  assert.equal((await Quote.findById(fresh._id).lean()).status, 'SUBMITTED');
  assert.equal((await Quote.findById(approved._id).lean()).status, 'APPROVED');

  const second = await expireStaleVendorQuotes();
  assert.equal(second.expired, 0, 'expiry is idempotent');
});

test('customer cannot accept an expired vendor quote', async () => {
  const customer = await ExternalUser.create({ fullName: 'Customer', email: `${key()}@example.test`, accountType: 'CUSTOMER' });
  const session = await ExternalSession.create({ user: customer._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  const token = signExternalAccessToken(customer, session._id);
  const event = await CustomerEvent.create({ customer: customer._id, status: 'planning' });
  const stale = await quote({ customer: customer._id, validUntil: new Date(Date.now() - DAY) });

  const res = await request(app)
    .post(`/api/customer/vendor-quotes/${stale._id}/accept`)
    .set({ Authorization: `Bearer ${token}` })
    .send({ eventId: String(event._id) })
    .expect(409);
  assert.equal(res.body.error, 'QUOTE_EXPIRED');
  assert.equal((await Quote.findById(stale._id).lean()).status, 'EXPIRED');
});

test('revising a quote without its own category resolves the vendor category instead of throwing', async () => {
  const owner = await ExternalUser.create({ fullName: 'Vendor owner', email: `${key()}@example.test`, accountType: 'VENDOR' });
  const vendor = await VendorOrganization.create({ owner: owner._id, ownerIdentityKey: owner._id, businessName: `Business ${key()}`, category: 'Photography', location: 'Pune' });
  owner.vendorOrganization = vendor._id; await owner.save();
  const session = await ExternalSession.create({ user: owner._id, refreshTokenHash: key(), expiresAt: new Date(Date.now() + 3600000) });
  const token = signExternalAccessToken(owner, session._id);
  const uncategorised = await quote({ vendor: vendor._id, category: '' });

  const res = await request(app)
    .post(`/api/vendor/quotes/${uncategorised._id}/revise`)
    .set({ Authorization: `Bearer ${token}` })
    .send({ pricingBreakdown: { basePrice: 1200, totalAmount: 1200 } });
  // The unactivated fixture vendor is rejected by the normal submission gate,
  // proving the route got past category resolution rather than crashing on it.
  assert.equal(res.body.error, 'ACTIVATION_REQUIRED');
  assert.doesNotMatch(res.body.message || '', /is not defined/);
});

test('launchpad progress counts sent quotes instead of failing on a missing model', async () => {
  const owner = await ExternalUser.create({ fullName: 'Vendor owner', email: `${key()}@example.test`, accountType: 'VENDOR' });
  const vendor = await VendorOrganization.create({ owner: owner._id, ownerIdentityKey: owner._id, businessName: `Business ${key()}`, category: 'Photography', location: 'Pune' });

  const before = await getLaunchpadProgress(vendor._id);
  assert.equal(before.steps.find(s => s.key === 'FIRST_QUOTE').completed, false);

  await quote({ vendor: vendor._id, status: 'DRAFT' });
  const draftOnly = await getLaunchpadProgress(vendor._id);
  assert.equal(draftOnly.steps.find(s => s.key === 'FIRST_QUOTE').completed, false, 'drafts are not sent quotes');

  await quote({ vendor: vendor._id, status: 'SUBMITTED' });
  const sent = await getLaunchpadProgress(vendor._id);
  assert.equal(sent.steps.find(s => s.key === 'FIRST_QUOTE').completed, true);
});
