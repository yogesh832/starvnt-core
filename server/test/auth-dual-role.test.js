import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup, teardown } from './helpers.js';

/**
 * One auth domain, DB-owned surfaces: the tab chosen at sign-in is only used
 * for new signup. Existing identities always sign in as their primary DB type.
 */
let app;
let ExternalUser;
let ExternalSession;
let VendorOrganization;
let hashPassword;
let generateRefreshToken;
let hashRefreshToken;
let config;
const PASSWORD = 'secret123';

before(async () => {
  ({ app } = await setup());
  ({ ExternalUser } = await import('../src/external/models/ExternalUser.js'));
  ({ ExternalSession } = await import('../src/external/models/ExternalSession.js'));
  ({ VendorOrganization } = await import('../src/external/models/VendorOrganization.js'));
  ({ hashPassword } = await import('../src/external/utils/password.js'));
  ({ generateRefreshToken, hashRefreshToken } = await import('../src/external/utils/tokens.js'));
  ({ config } = await import('../src/config.js'));
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

test('a customer selected on the Vendor tab still signs in as a customer', async () => {
  const u = await account('CUSTOMER');

  const asVendor = await login(u.email, 'VENDOR');
  assert.equal(asVendor.status, 200);
  assert.equal(asVendor.body.user.accountType, 'CUSTOMER');

  const fresh = await ExternalUser.findById(u._id).lean();
  assert.equal(fresh.accountType, 'CUSTOMER', 'primary type is never flipped');
  assert.equal(fresh.vendorOrganization, null, 'vendor organization is not created from wrong tab login');
  assert.deepEqual(fresh.roles, ['CUSTOMER']);

  assert.equal((await request(app).get('/api/customer/me').set(bearer(asVendor))).status, 200);
  assert.equal((await request(app).get('/api/vendor/me').set(bearer(asVendor))).status, 403);
});

test('a vendor selected on the Customer tab still signs in as a vendor', async () => {
  const u = await account('VENDOR', { legacy: true });
  const res = await login(u.email, 'CUSTOMER');
  assert.equal(res.status, 200);
  assert.equal(res.body.user.accountType, 'VENDOR');

  const fresh = await ExternalUser.findById(u._id).lean();
  assert.equal(fresh.accountType, 'VENDOR');
  assert.deepEqual(fresh.roles, ['VENDOR']);
  assert.equal(await VendorOrganization.countDocuments({ owner: u._id }), 1, 'no duplicate organization');
  assert.equal((await request(app).get('/api/vendor/me').set(bearer(res))).status, 200);
  assert.equal((await request(app).get('/api/customer/me').set(bearer(res))).status, 403);
});

test('a polluted customer with vendor role still signs in as primary customer', async () => {
  const u = await account('CUSTOMER');
  const org = await VendorOrganization.create({ businessName: `Dual Studio`, owner: u._id });
  u.roles = ['CUSTOMER', 'VENDOR'];
  u.vendorOrganization = org._id;
  await u.save();

  const asVendor = await login(u.email, 'VENDOR');
  assert.equal(asVendor.status, 200);
  assert.equal(asVendor.body.user.accountType, 'CUSTOMER');
  assert.deepEqual(asVendor.body.user.roles.sort(), ['CUSTOMER', 'VENDOR']);
  assert.equal((await request(app).get('/api/vendor/me').set(bearer(asVendor))).status, 403);
  assert.equal((await request(app).get('/api/customer/me').set(bearer(asVendor))).status, 200);

  const asCustomer = await login(u.email, 'CUSTOMER');
  assert.equal(asCustomer.status, 200);
  assert.equal(asCustomer.body.user.accountType, 'CUSTOMER');
  assert.equal((await request(app).get('/api/customer/me').set(bearer(asCustomer))).status, 200);
});

test('no tab sent (old clients) signs in as the primary type', async () => {
  const u = await account('VENDOR');
  const res = await login(u.email, undefined);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.accountType, 'VENDOR');
});

test('refresh keeps the surface the session signed in as', async () => {
  const u = await account('CUSTOMER');
  const res = await login(u.email, 'CUSTOMER');
  const cookie = res.headers['set-cookie'];
  const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.body.user.accountType, 'CUSTOMER');
  assert.equal((await request(app).get('/api/customer/me').set(bearer(refreshed))).status, 200);
});

test('refresh heals an old wrong-tab vendor session back to the primary customer account', async () => {
  const u = await account('CUSTOMER');
  u.roles = ['CUSTOMER', 'VENDOR'];
  await u.save();

  const refreshToken = generateRefreshToken();
  await ExternalSession.create({
    user: u._id,
    refreshTokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + 86400000),
    accountType: 'VENDOR',
  });

  const refreshed = await request(app)
    .post('/api/auth/refresh')
    .set('Cookie', [`${config.refreshCookieName}=${refreshToken}`]);

  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.body.user.accountType, 'CUSTOMER');
  assert.equal((await request(app).get('/api/customer/me').set(bearer(refreshed))).status, 200);
  assert.equal((await request(app).get('/api/vendor/me').set(bearer(refreshed))).status, 403);
});
