import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup, teardown } from './helpers.js';

/**
 * One email, two surfaces: the tab chosen at sign-in decides whether the
 * session is the Customer App or Vendor OS. Neither role replaces the other.
 */
let app;
let ExternalUser;
let VendorOrganization;
let hashPassword;
const PASSWORD = 'secret123';

before(async () => {
  ({ app } = await setup());
  ({ ExternalUser } = await import('../src/external/models/ExternalUser.js'));
  ({ VendorOrganization } = await import('../src/external/models/VendorOrganization.js'));
  ({ hashPassword } = await import('../src/external/utils/password.js'));
});
after(teardown);

let n = 0;
async function account(accountType, { legacy = false } = {}) {
  n += 1;
  const user = await ExternalUser.create({
    fullName: `Dual ${n}`,
    email: `dual${n}-${Date.now()}@example.com`,
    accountType,
    ...(legacy ? {} : { roles: [accountType] }),
    passwordHash: await hashPassword(PASSWORD),
  });
  if (accountType === 'VENDOR') {
    const org = await VendorOrganization.create({ businessName: `Studio ${n}`, owner: user._id });
    user.vendorOrganization = org._id;
    await user.save();
  }
  return user;
}

const login = (email, accountType) => request(app).post('/api/auth/login').send({ email, password: PASSWORD, accountType });
const bearer = (res) => ({ Authorization: `Bearer ${res.body.accessToken}` });

test('a customer can sign in on the Vendor tab and keeps the customer role', async () => {
  const u = await account('CUSTOMER');

  const asVendor = await login(u.email, 'VENDOR');
  assert.equal(asVendor.status, 200);
  assert.equal(asVendor.body.user.accountType, 'VENDOR');
  assert.deepEqual(asVendor.body.user.roles.sort(), ['CUSTOMER', 'VENDOR']);
  assert.equal((await request(app).get('/api/vendor/me').set(bearer(asVendor))).status, 200);
  assert.equal((await request(app).get('/api/customer/me').set(bearer(asVendor))).status, 403);

  const fresh = await ExternalUser.findById(u._id).lean();
  assert.equal(fresh.accountType, 'CUSTOMER', 'primary type is never flipped');
  assert.ok(fresh.vendorOrganization, 'vendor organization created on first vendor sign-in');

  const asCustomer = await login(u.email, 'CUSTOMER');
  assert.equal(asCustomer.status, 200);
  assert.equal(asCustomer.body.user.accountType, 'CUSTOMER');
  assert.equal((await request(app).get('/api/customer/me').set(bearer(asCustomer))).status, 200);
  assert.equal((await request(app).get('/api/vendor/me').set(bearer(asCustomer))).status, 403);

  // Both sessions stay valid at the same time, each on its own surface.
  assert.equal((await request(app).get('/api/vendor/me').set(bearer(asVendor))).status, 200);
  const me = await request(app).get('/api/auth/me').set(bearer(asVendor));
  assert.equal(me.body.user.accountType, 'VENDOR');
});

test('a vendor (legacy user without roles) can sign in on the Customer tab', async () => {
  const u = await account('VENDOR', { legacy: true });
  const res = await login(u.email, 'CUSTOMER');
  assert.equal(res.status, 200);
  assert.equal(res.body.user.accountType, 'CUSTOMER');
  assert.equal((await request(app).get('/api/customer/me').set(bearer(res))).status, 200);

  const fresh = await ExternalUser.findById(u._id).lean();
  assert.equal(fresh.accountType, 'VENDOR');
  assert.deepEqual(fresh.roles.sort(), ['CUSTOMER', 'VENDOR']);
  assert.equal(await VendorOrganization.countDocuments({ owner: u._id }), 1, 'no duplicate organization');
});

test('no tab sent (old clients) signs in as the primary type', async () => {
  const u = await account('VENDOR');
  const res = await login(u.email, undefined);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.accountType, 'VENDOR');
});

test('refresh keeps the surface the session signed in as', async () => {
  const u = await account('CUSTOMER');
  const res = await login(u.email, 'VENDOR');
  const cookie = res.headers['set-cookie'];
  const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.body.user.accountType, 'VENDOR');
  assert.equal((await request(app).get('/api/vendor/me').set(bearer(refreshed))).status, 200);
});
