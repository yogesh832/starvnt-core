import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { externalConn, adminConn } from '../src/db/index.js';
import { config } from '../src/config.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { OtpVerification } from '../src/external/models/OtpVerification.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';

const password = 'SignupAcceptance42!';
const bundle = Object.fromEntries(['CUSTOMER', 'VENDOR'].map(role => [
  role,
  Object.fromEntries(['terms', 'privacy'].map(kind => [
    kind,
    { version: `${role}-v1`, body: `Approved fixture for ${role} ${kind}.\nExact second line.`, approvedBy: 'Test approver', effectiveFrom: '2020-01-01T00:00:00Z' },
  ])),
]));
let mongo, directory, app;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'starvnt-signup-'));
  process.env.STARVNT_SIGNUP_DOCUMENTS_FILE = join(directory, 'approved.json');
  await writeFile(process.env.STARVNT_SIGNUP_DOCUMENTS_FILE, JSON.stringify(bundle));
  config.enableDevTools = true;
  const { createApp } = await import('../src/app.js');
  mongo = await MongoMemoryServer.create();
  await Promise.all([externalConn.openUri(mongo.getUri('signup')), adminConn.openUri(mongo.getUri('signup_admin'))]);
  app = createApp();
  await Promise.all(Object.values(externalConn.models).map(model => model.init()));
});

after(async () => {
  await Promise.all([externalConn.close(), adminConn.close()]);
  await mongo?.stop();
  if (directory) {
    await rm(join(directory, 'approved.json'), { force: true });
    await rmdir(directory);
  }
});

async function readAcceptance(accountType) {
  const response = await request(app).get('/api/auth/signup-documents').query({ accountType }).expect(200);
  assert.equal(response.body.required, true);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.documents.length, 2);
  return {
    accepted: true,
    documents: response.body.documents.map(({ kind, version, hash, body }) => {
      assert.equal(body, bundle[accountType][kind].body);
      assert.equal(hash, createHash('sha256').update(body).digest('hex'));
      return { kind, version, hash };
    }),
  };
}

test('signup rejects missing, stale and wrong-role acceptance and stores the exact version on registration', async () => {
  const accountType = 'VENDOR';
  const signup = { accountType, fullName: 'Vendor fixture', email: 'legal@signup.test', businessName: 'Vendor Studio', password };
  const accepted = await readAcceptance(accountType);
  const wrongRole = await readAcceptance('CUSTOMER');
  const stale = { ...accepted, documents: accepted.documents.map(document => ({ ...document, version: 'old' })) };
  for (const [signupAcceptance, error] of [[undefined, 'SIGNUP_ACCEPTANCE_REQUIRED'], [wrongRole, 'SIGNUP_DOCUMENTS_CHANGED'], [stale, 'SIGNUP_DOCUMENTS_CHANGED']]) {
    const response = await request(app).post('/api/auth/register').send({ ...signup, signupAcceptance }).expect(409);
    assert.equal(response.body.error, error);
    assert.equal(response.headers['set-cookie'], undefined);
  }
  assert.equal(await ExternalUser.countDocuments(), 0);
  assert.equal(await ExternalSession.countDocuments(), 0);
  assert.equal(await VendorOrganization.countDocuments(), 0);
  const response = await request(app).post('/api/auth/register').send({ ...signup, signupAcceptance: accepted }).expect(201);
  const user = await ExternalUser.findById(response.body.user.id).select('+signupAcceptance').lean();
  assert.deepEqual(user.signupAcceptance.documents, accepted.documents);
  assert.equal(user.signupAcceptance.accountType, accountType);
  assert.ok(user.signupAcceptance.acceptedAt instanceof Date);
  assert.equal(response.body.user.signupAcceptance, undefined);
  await request(app).post('/api/auth/login').send({ accountType, email: signup.email, password }).expect(200);
});

test('first Google, phone and widget identities need acceptance without changing existing sign-in', async () => {
  const accountType = 'CUSTOMER';
  const accepted = await readAcceptance(accountType);
  const options = [
    ['google', { credential: 'test:google@signup.test:Test Google:signup-fixture' }],
    ['otp/verify', { phone: '+919000000101', otp: '742681' }],
    ['otp/widget-verify', { accessToken: 'test:widget:+919000000102' }],
  ];
  for (const [path, payload] of options) {
    const attempt = async signupAcceptance => {
      if (path === 'otp/verify') {
        await OtpVerification.deleteMany({ phone: payload.phone });
        await OtpVerification.create({ phone: payload.phone, otp: payload.otp, expiresAt: new Date(Date.now() + 600000) });
      }
      return request(app).post(`/api/auth/${path}`).set('X-Forwarded-For', `127.0.0.${20 + options.findIndex(row => row[0] === path)}`)
        .send({ ...payload, accountType, signupAcceptance });
    };
    const before = await ExternalUser.countDocuments({ accountType });
    const blocked = await attempt();
    assert.equal(blocked.status, 409, path);
    assert.equal(blocked.body.error, 'SIGNUP_ACCEPTANCE_REQUIRED', path);
    assert.equal(await ExternalUser.countDocuments({ accountType }), before);
    const created = await attempt(accepted);
    assert.equal(created.status, 200, path);
    const user = await ExternalUser.findById(created.body.user.id).select('+signupAcceptance').lean();
    assert.deepEqual(user.signupAcceptance.documents, accepted.documents);
    const existing = await attempt();
    assert.equal(existing.status, 200, path);
    assert.equal(existing.body.user.id, created.body.user.id);
  }
});
