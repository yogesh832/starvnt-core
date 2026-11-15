import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { adminConn, externalConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorService } from '../src/external/models/VendorService.js';
import { Quote } from '../src/external/models/Quote.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';

let mongo, app;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([adminConn.openUri(mongo.getUri('launchpad_admin')), externalConn.openUri(mongo.getUri('launchpad_external'))]);
  app = createApp();
  await Promise.all([...Object.values(adminConn.models), ...Object.values(externalConn.models)].map(model => model.init()));
}, { timeout: 120000 });
after(async () => { await Promise.all([adminConn.close(), externalConn.close()]); await mongo?.stop(); });

async function fixture() {
  const owner = await ExternalUser.create({ fullName: 'Launchpad vendor', email: `${crypto.randomUUID()}@example.test`, accountType: 'VENDOR' });
  const vendor = await VendorOrganization.create({ owner: owner._id, businessName: 'Launchpad Studio', category: 'Photography' });
  owner.vendorOrganization = vendor._id; await owner.save();
  const session = await ExternalSession.create({ user: owner._id, accountType: 'VENDOR', refreshTokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
  return { owner, vendor, auth: { Authorization: `Bearer ${signExternalAccessToken(owner, session._id)}` } };
}

test('authenticated Launchpad loads for a new vendor without archived Proposal Studio models', async () => {
  const f = await fixture();
  const response = await request(app).get('/api/vendor/launchpad').set(f.auth).expect(200);
  const data = response.body;
  assert.equal(data.totalSteps, 9); assert.equal(data.phases.length, 4);
  assert.ok(data.steps.every(step => typeof step.completed === 'boolean'));
  assert.equal(data.steps.find(step => step.key === 'ADD_SERVICES').completed, false);
  assert.equal(data.steps.find(step => step.key === 'COMPLETE_VERIFICATION').completed, false);
  assert.equal(data.steps.find(step => step.key === 'FIRST_QUOTE').completed, false);
  assert.equal(data.steps.find(step => step.key === 'ADD_SERVICES').actionLink, '/vendor/services');
  assert.equal(data.steps.find(step => step.key === 'COMPLETE_VERIFICATION').actionLink, '/vendor/documents');
});

test('Launchpad counts the authenticated vendor\'s real services and sent quotes, not drafts or another vendor\'s records', async () => {
  const f = await fixture(), other = await fixture();
  const service = await VendorService.create({ vendor: f.vendor._id, name: 'Photo package', category: 'Photography', status: 'ACTIVE', pricing: { basePrice: 1000 } });
  const quote = await Quote.create({ vendor: f.vendor._id, customer: f.owner._id, vendorService: service._id, serviceName: service.name, eventDate: '2027-12-01', status: 'DRAFT', pricingBreakdown: { basePrice: 1000, totalAmount: 1000 } });
  let data = (await request(app).get('/api/vendor/launchpad').set(f.auth).expect(200)).body;
  assert.equal(data.steps.find(step => step.key === 'ADD_SERVICES').completed, true);
  assert.equal(data.steps.find(step => step.key === 'FIRST_QUOTE').completed, false);
  await Quote.updateOne({ _id: quote._id }, { $set: { status: 'SUBMITTED' } });
  data = (await request(app).get('/api/vendor/launchpad').set(f.auth).expect(200)).body;
  assert.equal(data.steps.find(step => step.key === 'FIRST_QUOTE').completed, true);
  const isolated = (await request(app).get(`/api/vendor/launchpad?vendorId=${f.vendor._id}`).set(other.auth).expect(200)).body;
  assert.equal(isolated.steps.find(step => step.key === 'FIRST_QUOTE').completed, false);
  assert.equal(isolated.steps.find(step => step.key === 'ADD_SERVICES').completed, false);
});

test('Launchpad endpoint still requires an authenticated Vendor session', async () => {
  await request(app).get('/api/vendor/launchpad').expect(401);
});
