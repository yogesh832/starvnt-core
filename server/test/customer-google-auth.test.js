import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup, teardown, makeUser } from './helpers.js';

let app;

before(async () => {
  const env = await setup();
  app = env.app;
});

after(async () => {
  await teardown();
});

test('switchSurface allows a user to switch dynamically between VENDOR and CUSTOMER surfaces', async () => {
  const { user, token } = await makeUser('VENDOR');
  assert.equal(user.accountType, 'VENDOR');

  // Currently VENDOR: can access vendor API, forbidden on customer API
  const v1 = await request(app).get('/api/vendor/me').set('Authorization', `Bearer ${token}`);
  assert.equal(v1.status, 200);
  const c1 = await request(app).get('/api/customer/me').set('Authorization', `Bearer ${token}`);
  assert.equal(c1.status, 403);

  // Switch to CUSTOMER
  const switchRes = await request(app)
    .post('/api/auth/switch-surface')
    .set('Authorization', `Bearer ${token}`)
    .send({ targetSurface: 'CUSTOMER' });

  assert.equal(switchRes.status, 200);
  assert.equal(switchRes.body.user.accountType, 'CUSTOMER');
  const custToken = switchRes.body.accessToken;

  // Now acting as CUSTOMER: can access customer API, forbidden on vendor API
  const c2 = await request(app).get('/api/customer/me').set('Authorization', `Bearer ${custToken}`);
  assert.equal(c2.status, 200);
  const v2 = await request(app).get('/api/vendor/me').set('Authorization', `Bearer ${custToken}`);
  assert.equal(v2.status, 403);

  // Switch back to VENDOR
  const switchBack = await request(app)
    .post('/api/auth/switch-surface')
    .set('Authorization', `Bearer ${custToken}`)
    .send({ targetSurface: 'VENDOR' });

  assert.equal(switchBack.status, 200);
  assert.equal(switchBack.body.user.accountType, 'VENDOR');
  const vendorToken2 = switchBack.body.accessToken;

  const v3 = await request(app).get('/api/vendor/me').set('Authorization', `Bearer ${vendorToken2}`);
  assert.equal(v3.status, 200);
});
