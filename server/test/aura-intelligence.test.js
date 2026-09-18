import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

let ctx;
let vendorToken;
let vendorUser;

before(async () => {
  ctx = await setupTestApp();

  // Register vendor
  const vRes = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Debanjan Photographer',
    email: 'debanjan@intelligence.com',
    password: 'Password123!',
    accountType: 'VENDOR',
    businessName: 'Frame Studio AI',
    category: 'Photography',
    location: 'Kolkata',
  });
  assert.equal(vRes.status, 201);
  vendorToken = vRes.body.accessToken;
  vendorUser = vRes.body.user;
});

after(async () => {
  await ctx.disconnectDB();
  await ctx.mongod.stop();
});

test('Aura+ Vendor Growth Intelligence generates actionable recommendations (Spec §16)', async () => {
  const res = await request(ctx.app)
    .get('/api/vendor/intelligence/recommendations')
    .set('Authorization', `Bearer ${vendorToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(Array.isArray(res.body.recommendations));
  assert.ok(res.body.recommendations.length > 0);

  // Check signals present (Spec §16)
  const signals = res.body.recommendations.map((r) => r.signal);
  assert.ok(signals.includes('LOCATION_PERFORMANCE'));
  assert.ok(signals.includes('RISK_LOGISTICS'));

  const sample = res.body.recommendations[0];
  assert.ok(sample.title);
  assert.ok(sample.message);
  assert.ok(sample.action);
});
