import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { config } from '../src/config.js';
import { externalConn, adminConn } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { OtpVerification } from '../src/external/models/OtpVerification.js';
import { hashPassword } from '../src/external/utils/password.js';
import { portalMismatch } from '../src/external/services/portalPolicy.js';

const password = 'PortalTest42!';
let mongo, app, customer, vendor, sequence = 1;
const post = path => request(app).post(`/api/auth/${path}`).set('X-Forwarded-For', `127.0.0.${sequence++}`);
const challenge = phone => OtpVerification.create({ phone, otp: '742681', expiresAt: new Date(Date.now() + 600000) });
before(async () => {
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('portal_external')), adminConn.openUri(mongo.getUri('portal_admin'))]);
  app = createApp();
  await Promise.all(Object.values(externalConn.models).map(model => model.init()));
  const passwordHash = await hashPassword(password);
  [customer, vendor] = await ExternalUser.create([
    { email: 'customer@portal.test', phone: '+919000000001', fullName: 'Customer fixture', accountType: 'CUSTOMER', roles: ['CUSTOMER', 'VENDOR'], passwordHash },
    { email: 'vendor@portal.test', phone: '+919000000002', fullName: 'Vendor fixture', accountType: 'VENDOR', roles: ['VENDOR', 'CUSTOMER'], passwordHash },
  ]);
});
after(async () => { await Promise.all([externalConn.close(), adminConn.close()]); await mongo?.stop(); });

for (const actual of ['CUSTOMER', 'VENDOR']) {
  test(`${actual} cannot authenticate on the opposite portal through any sign-in method`, async () => {
    const user = actual === 'CUSTOMER' ? customer : vendor;
    const wrong = actual === 'CUSTOMER' ? 'VENDOR' : 'CUSTOMER';
    const sessions = await ExternalSession.countDocuments();
    const organizations = await VendorOrganization.countDocuments();
    const original = await ExternalUser.findById(user._id).select('+passwordHash').lean();
    const cases = [
      ['login', { email: user.email, password }],
      ['google', { credential: `test:${user.email}:Fixture:${crypto.randomUUID()}` }],
      ['otp/email/send', { email: user.email, mode: 'login' }],
      ['otp/send', { phone: user.phone }],
      ['otp/verify', { phone: user.phone, otp: '742681' }],
      ['otp/widget-verify', { accessToken: `test:widget:${user.phone}` }],
      ['otp/email/verify', { email: user.email, otp: '742681' }],
      ['password/set', { email: user.email, otp: '742681', password: 'MustNotChange42!' }],
      ['register', { email: user.email, password, fullName: 'Do not convert', businessName: 'Do not create' }],
    ];
    for (const [path, payload] of cases) {
      if (path === 'otp/verify') await challenge(user.phone);
      if (path === 'otp/email/verify' || path === 'password/set') {
        await OtpVerification.deleteMany({ phone: user.email }); await challenge(user.email);
      }
      const response = await post(path).send({ ...payload, accountType: wrong }).expect(403);
      assert.equal(response.body.error, 'ACCOUNT_TYPE_MISMATCH', path);
      assert.equal(response.body.accountType, actual, path);
      assert.match(response.body.message, new RegExp(actual.toLowerCase()));
      assert.equal(response.body.loginUrl, portalMismatch(actual).loginUrl);
      assert.equal(response.body.accessToken, undefined);
      assert.equal(response.body.refreshToken, undefined);
      assert.equal(response.headers['set-cookie'], undefined);
    }
    assert.equal(await ExternalSession.countDocuments(), sessions);
    assert.equal(await VendorOrganization.countDocuments(), organizations);
    const unchanged = await ExternalUser.findById(user._id).select('+passwordHash').lean();
    for (const field of ['accountType', 'passwordHash', 'googleId', 'lastLoginAt']) assert.deepEqual(unchanged[field], original[field], field);
    assert.deepEqual(unchanged.roles, original.roles);
  });

  test(`${actual} matching login works, while refresh, me and protected APIs reject the wrong portal`, async () => {
    const user = actual === 'CUSTOMER' ? customer : vendor;
    const wrong = actual === 'CUSTOMER' ? 'VENDOR' : 'CUSTOMER';
    const login = await post('login').set('X-Starvnt-Client', 'native').send({ email: user.email, password, accountType: actual }).expect(200);
    assert.equal(login.body.user.accountType, actual);
    assert.ok(login.body.accessToken); assert.ok(login.body.refreshToken);
    const count = await ExternalSession.countDocuments();
    await post('refresh').set('X-Starvnt-Client', 'native').set('X-Starvnt-Surface', wrong).send({ refreshToken: login.body.refreshToken }).expect(403);
    assert.equal(await ExternalSession.countDocuments(), count);
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`).set('X-Starvnt-Surface', wrong).expect(403);
    const path = actual === 'VENDOR' ? '/api/vendor/dashboard' : '/api/customer/dashboard';
    await request(app).get(path).set('Authorization', `Bearer ${login.body.accessToken}`).set('X-Starvnt-Surface', wrong).expect(403);
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`).set('X-Starvnt-Surface', actual).expect(200);
    await post('switch-surface').set('Authorization', `Bearer ${login.body.accessToken}`).send({ targetSurface: wrong }).expect(403);
  });
}

test('browser portal origin wins over body and header role overrides, including refreshed sessions', async () => {
  const response = await post('login').set('Origin', 'https://customer.example.test').set('X-Starvnt-Surface', 'VENDOR').send({ email: vendor.email, password, accountType: 'VENDOR' }).expect(403);
  assert.equal(response.body.accountType, 'VENDOR');
  await post('login').set('Origin', 'https://vendor.example.test').send({ email: customer.email, password, accountType: 'CUSTOMER' }).expect(403);
  const login = await post('login').send({ email: vendor.email, password, accountType: 'VENDOR' }).expect(200);
  await post('refresh').set('Origin', 'https://customer.example.test').set('Cookie', login.headers['set-cookie']).send({ accountType: 'VENDOR' }).expect(403);
});

test('invalid credentials remain generic and disabled accounts never receive sessions', async () => {
  await post('login').send({ email: vendor.email, password: 'wrong', accountType: 'CUSTOMER' }).expect(401, { error: 'INVALID_CREDENTIALS' });
  await ExternalUser.updateOne({ _id: vendor._id }, { status: 'DISABLED' });
  try { await post('google').send({ credential: `test:${vendor.email}:Fixture:disabled`, accountType: 'VENDOR' }).expect(401); }
  finally { await ExternalUser.updateOne({ _id: vendor._id }, { status: 'ACTIVE' }); }
});

test('widget identity must be provider-verified; client phone numbers and unsigned payloads cannot authenticate', async () => {
  const previous = { enabled: config.enableDevTools, key: config.msg91AuthKey };
  config.enableDevTools = false; config.msg91AuthKey = '';
  const sessions = await ExternalSession.countDocuments();
  try {
    for (const token of ['SUCCESS', 'verified', 'invalid-token', `e30.${Buffer.from(JSON.stringify({ phone: vendor.phone })).toString('base64url')}.fake`, `test:widget:${vendor.phone}`]) {
      await post('otp/widget-verify').send({ accessToken: token, phone: vendor.phone, accountType: 'VENDOR' }).expect(400);
    }
    await post('otp/verify').send({ phone: vendor.phone, otp: '123456', accountType: 'VENDOR' }).expect(400);
    assert.equal(await ExternalSession.countDocuments(), sessions);
  } finally { config.enableDevTools = previous.enabled; config.msg91AuthKey = previous.key; }
});

test('production cannot use Google or phone test credentials even if the development flag was enabled', async () => {
  const env = process.env.NODE_ENV, enabled = config.enableDevTools, fetcher = globalThis.fetch;
  process.env.NODE_ENV = 'production'; config.enableDevTools = true;
  globalThis.fetch = async () => new Response('{}', { status: 400 });
  try {
    await post('google').send({ credential: `test:${customer.email}:Fixture:forged`, accountType: 'CUSTOMER' }).expect(400);
    await post('otp/verify').send({ phone: customer.phone, otp: '999999', accountType: 'CUSTOMER' }).expect(400);
  } finally { if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env; config.enableDevTools = enabled; globalThis.fetch = fetcher; }
});

test('portal destinations use configured trusted URLs and ignore unsafe protocols', () => {
  const original = config.vendorPortalUrl;
  try {
    config.vendorPortalUrl = 'https://vendor.example.test/old?token=never#fragment';
    assert.equal(portalMismatch('VENDOR').loginUrl, 'https://vendor.example.test/login');
    config.vendorPortalUrl = 'javascript:alert(1)';
    assert.equal(portalMismatch('VENDOR').loginUrl, 'https://vendor.starvnt.com/login');
  } finally { config.vendorPortalUrl = original; }
});
