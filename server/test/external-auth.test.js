import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

let ctx;
before(async () => {
  ctx = await setupTestApp();
});
after(async () => {
  await ctx.disconnectDB();
  await ctx.mongod.stop();
});

test('register CUSTOMER → 201, gets access token + refresh cookie', async () => {
  const res = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Cass Customer',
    email: 'cass@example.com',
    password: 'Passw0rd1',
    accountType: 'CUSTOMER',
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.accessToken);
  assert.equal(res.body.user.accountType, 'CUSTOMER');
  assert.ok(res.headers['set-cookie']?.some((c) => c.startsWith('starvnt_ext_rt=')));
});

test('VENDOR registration requires a business name', async () => {
  const res = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Vin Vendor',
    email: 'vin@example.com',
    password: 'Passw0rd1',
    accountType: 'VENDOR',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'BUSINESS_NAME_REQUIRED');
});

test('register VENDOR → creates PENDING VendorOrganization', async () => {
  const res = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Vin Vendor',
    email: 'vin@example.com',
    password: 'Passw0rd1',
    accountType: 'VENDOR',
    businessName: 'Premium Moments',
    category: 'Photography',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.accountType, 'VENDOR');
  const org = await ctx.models.VendorOrganization.findOne({ businessName: 'Premium Moments' });
  assert.ok(org);
  assert.equal(org.status, 'PENDING');
});

test('duplicate email → 409 EMAIL_IN_USE', async () => {
  const res = await request(ctx.app).post('/api/auth/register').send({
    fullName: 'Cass Again',
    email: 'cass@example.com',
    password: 'Passw0rd1',
    accountType: 'CUSTOMER',
  });
  assert.equal(res.status, 409);
});

test('account-type gating: customer token is forbidden on vendor surface', async () => {
  const login = await request(ctx.app)
    .post('/api/auth/login')
    .send({ email: 'cass@example.com', password: 'Passw0rd1' });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;

  const own = await request(ctx.app)
    .get('/api/customer/me')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(own.status, 200);

  const vendorSurface = await request(ctx.app)
    .get('/api/vendor/me')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(vendorSurface.status, 403);
});

test('vendor token reaches vendor surface, not customer surface', async () => {
  const login = await request(ctx.app)
    .post('/api/auth/login')
    .send({ email: 'vin@example.com', password: 'Passw0rd1' });
  const token = login.body.accessToken;

  assert.equal(
    (await request(ctx.app).get('/api/vendor/me').set('Authorization', `Bearer ${token}`))
      .status,
    200
  );
  assert.equal(
    (await request(ctx.app).get('/api/customer/me').set('Authorization', `Bearer ${token}`))
      .status,
    403
  );
});

test('wrong password → uniform 401 INVALID_CREDENTIALS', async () => {
  const res = await request(ctx.app)
    .post('/api/auth/login')
    .send({ email: 'cass@example.com', password: 'WrongPass1' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'INVALID_CREDENTIALS');
});

test('Aura+ customer chat threads persist and remain account-scoped', async () => {
  const login = await request(ctx.app)
    .post('/api/auth/login')
    .send({ email: 'cass@example.com', password: 'Passw0rd1' });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;

  const createThread = await request(ctx.app)
    .post('/api/ai/threads')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Wedding in Kolkata' });
  assert.equal(createThread.status, 201);
  assert.ok(createThread.body.thread.id);

  const threadId = createThread.body.thread.id;
  const userMessage = await request(ctx.app)
    .post(`/api/ai/threads/${threadId}/messages`)
    .set('Authorization', `Bearer ${token}`)
    .send({ role: 'user', content: 'Plan my wedding for 500 guests' });
  assert.equal(userMessage.status, 201);

  const assistantMessage = await request(ctx.app)
    .post(`/api/ai/threads/${threadId}/messages`)
    .set('Authorization', `Bearer ${token}`)
    .send({ role: 'assistant', content: 'Great. Which date are you planning for?' });
  assert.equal(assistantMessage.status, 201);

  const detail = await request(ctx.app)
    .get(`/api/ai/threads/${threadId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.messages.length, 2);
  assert.equal(detail.body.messages[0].content, 'Plan my wedding for 500 guests');
  assert.equal(detail.body.messages[1].content, 'Great. Which date are you planning for?');

  const list = await request(ctx.app)
    .get('/api/ai/threads')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.threads.length, 1);
  assert.equal(list.body.threads[0].id, threadId);

  const vendorLogin = await request(ctx.app)
    .post('/api/auth/login')
    .send({ email: 'vin@example.com', password: 'Passw0rd1' });
  const vendorThreadRead = await request(ctx.app)
    .get(`/api/ai/threads/${threadId}`)
    .set('Authorization', `Bearer ${vendorLogin.body.accessToken}`);
  assert.equal(vendorThreadRead.status, 404);
});

test('external tokens are rejected by the ADMIN API (and vice versa is covered in admin suite)', async () => {
  const login = await request(ctx.app)
    .post('/api/auth/login')
    .send({ email: 'vin@example.com', password: 'Passw0rd1' });
  const res = await request(ctx.app)
    .get('/api/admin/ping')
    .set('Authorization', `Bearer ${login.body.accessToken}`);
  assert.equal(res.status, 401);
});

test('unauthenticated requests → 401', async () => {
  assert.equal((await request(ctx.app).get('/api/customer/me')).status, 401);
  assert.equal((await request(ctx.app).get('/api/admin/users')).status, 401);
});
