import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup, teardown, makeUser } from './helpers.js';

let app;
let ExternalUser;

before(async () => {
  const env = await setup();
  app = env.app;
  ExternalUser = env.ExternalUser;
});

after(async () => {
  await teardown();
});

test('Google login keeps existing email on its DB-owned customer surface', async () => {
  const { user } = await makeUser('CUSTOMER');
  const credential = `test:${user.email}:Google Link User:google-sub-${Date.now()}`;

  const res = await request(app)
    .post('/api/auth/google')
    .send({
      credential,
      accountType: 'VENDOR',
      businessName: 'Should Not Create Vendor',
      category: 'Event Planning',
      city: 'Delhi',
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, user.email);
  assert.equal(res.body.user.accountType, 'CUSTOMER');
  assert.equal(res.body.user.vendorOrganization, null);

  const saved = await ExternalUser.findById(user._id).lean();
  assert.equal(saved.accountType, 'CUSTOMER');
  assert.equal(saved.vendorOrganization, null);
});

test('switchSurface refuses to convert a customer account into vendor', async () => {
  const { token } = await makeUser('CUSTOMER');

  const switchRes = await request(app)
    .post('/api/auth/switch-surface')
    .set('Authorization', `Bearer ${token}`)
    .send({ targetSurface: 'VENDOR' });

  assert.equal(switchRes.status, 403);
  assert.equal(switchRes.body.error, 'ACCOUNT_TYPE_MISMATCH');
  assert.equal(switchRes.body.accountType, 'CUSTOMER');
});
