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
  const { user, token } = await makeUser('CUSTOMER');

  const switchRes = await request(app)
    .post('/api/auth/switch-surface')
    .set('Authorization', `Bearer ${token}`)
    .send({ targetSurface: 'VENDOR' });

  assert.equal(switchRes.status, 403);
  assert.equal(switchRes.body.error, 'ACCOUNT_TYPE_MISMATCH');
  assert.equal(switchRes.body.accountType, 'CUSTOMER');
  const saved = await ExternalUser.findById(user._id).lean();
  assert.equal(saved.accountType, 'CUSTOMER');
  assert.equal(saved.vendorOrganization, null);
});

test('Google sign-in ignores stale vendor roles on a primary customer identity', async () => {
  const { user } = await makeUser('CUSTOMER');
  user.roles = ['CUSTOMER', 'VENDOR'];
  await user.save();
  const res = await request(app).post('/api/auth/google').send({
    credential: `test:${user.email}:Existing Customer:google-stale-${Date.now()}`,
    accountType: 'VENDOR',
  }).expect(200);
  assert.equal(res.body.user.accountType, 'CUSTOMER');
  assert.equal(res.body.user.vendorOrganization, null);
  await request(app).get('/api/vendor/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(403);
});

test('switch-surface preserves the same surface and refuses vendor-to-customer conversion', async () => {
  const { user, token } = await makeUser('VENDOR');
  const same = await request(app).post('/api/auth/switch-surface')
    .set('Authorization', `Bearer ${token}`).send({ targetSurface: 'VENDOR' }).expect(200);
  assert.equal(same.body.user.accountType, 'VENDOR');
  await request(app).post('/api/auth/switch-surface')
    .set('Authorization', `Bearer ${token}`).send({ targetSurface: 'CUSTOMER' }).expect(403);
  assert.equal((await ExternalUser.findById(user._id).lean()).accountType, 'VENDOR');
});
