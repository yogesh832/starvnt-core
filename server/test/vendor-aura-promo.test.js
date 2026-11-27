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
import { VendorAuraPromotion } from '../src/external/models/VendorAuraPromotion.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { addCalendarMonths } from '../src/common/partnerProgram.js';

let app, mongo;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('aura_promo')), adminConn.openUri(mongo.getUri('aura_promo_admin'))]);
  app = createApp();
  await VendorAuraPromotion.init();
}, { timeout: 120000 });
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });

async function vendor() {
  const owner = await ExternalUser.create({ fullName: 'Test Vendor', email: `${randomUUID()}@example.test`, accountType: 'VENDOR' });
  const organization = await VendorOrganization.create({ owner: owner._id, businessName: 'Test Studio' });
  owner.vendorOrganization = organization._id;
  await owner.save();
  const session = await ExternalSession.create({ user: owner._id, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
  return { organization, header: { Authorization: `Bearer ${signExternalAccessToken(owner, session._id)}` } };
}

test('vendor can redeem once for six calendar months without payment or renewal', async () => {
  const first = await vendor();
  const other = await vendor();
  await request(app).get('/api/vendor/partner-program').expect(401);
  const beforeView = await request(app).get('/api/vendor/partner-program').set(first.header).expect(200);
  assert.equal(beforeView.body.entitlement, null);
  await request(app).post('/api/vendor/partner-program/redeem').set(first.header).send({ code: 'wrong' }).expect(400);
  const activated = await request(app).post('/api/vendor/partner-program/redeem').set(first.header).send({ code: ' aura6months ', vendor: String(other.organization._id), durationMonths: 99 }).expect(201);
  assert.equal(activated.body.entitlement.status, 'ACTIVE');
  assert.equal(activated.body.entitlement.autoRenewsToPaid, false);
  assert.equal(activated.body.entitlement.expiresAt, addCalendarMonths(activated.body.entitlement.startedAt, 6).toISOString());
  const replay = await request(app).post('/api/vendor/partner-program/redeem').set(first.header).send({ code: 'AURA6MONTHS' }).expect(200);
  assert.equal(replay.body.entitlement.expiresAt, activated.body.entitlement.expiresAt);
  assert.equal(replay.body.replay, true);
  assert.equal((await request(app).get('/api/vendor/partner-program').set(other.header).expect(200)).body.entitlement, null);
  await VendorAuraPromotion.collection.updateOne({ vendor: first.organization._id }, { $set: { expiresAt: new Date('2020-01-01') } });
  assert.equal((await request(app).get('/api/vendor/partner-program').set(first.header).expect(200)).body.entitlement.status, 'EXPIRED');
  assert.equal((await request(app).post('/api/vendor/partner-program/redeem').set(first.header).send({ code: 'AURA6MONTHS' }).expect(200)).body.entitlement.status, 'EXPIRED');
});

test('restricted vendor cannot redeem', async () => {
  const item = await vendor();
  await VendorOrganization.updateOne({ _id: item.organization._id }, { $set: { isRestricted: true } });
  await request(app).post('/api/vendor/partner-program/redeem').set(item.header).send({ code: 'AURA6MONTHS' }).expect(403);
});
