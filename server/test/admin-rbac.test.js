import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

let ctx;
let superToken;
let adminToken;
let adminId;

async function createAdmin(email, role, permissions, password = 'Admin1234') {
  const { hashPassword } = await import('../src/external/utils/password.js');
  return ctx.models.AdminUser.create({
    fullName: email.split('@')[0],
    email,
    passwordHash: await hashPassword(password),
    role,
    permissions,
  });
}

async function login(email, password = 'Admin1234') {
  return request(ctx.app)
    .post('/api/admin/auth/login')
    .send({ email, password });
}

before(async () => {
  ctx = await setupTestApp();
  await createAdmin('super@starvnt.com', 'SUPER_ADMIN', []);
  const res = await login('super@starvnt.com');
  assert.equal(res.status, 200);
  superToken = res.body.accessToken;
  assert.deepEqual(res.body.admin.effectivePermissions, ['*']);
});

after(async () => {
  await ctx.disconnectDB();
  await ctx.mongod.stop();
});

test('login is audited (success + failure)', async () => {
  await login('super@starvnt.com', 'bad-password-1');
  const logs = await ctx.models.AdminAuditLog.find({ actorEmail: 'super@starvnt.com' });
  const actions = logs.map((l) => l.action);
  assert.ok(actions.includes('ADMIN_LOGIN_SUCCESS'));
  assert.ok(actions.includes('ADMIN_LOGIN_FAILED'));
});

test('SUPER_ADMIN bypasses permission checks', async () => {
  const res = await request(ctx.app)
    .get('/api/admin/ping') // requires analytics.read
    .set('Authorization', `Bearer ${superToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.admin.role, 'SUPER_ADMIN');
});

test('SUPER_ADMIN can create an admin with explicit permissions (audited)', async () => {
  const res = await request(ctx.app)
    .post('/api/admin/users')
    .set('Authorization', `Bearer ${superToken}`)
    .send({
      fullName: 'Ops Admin',
      email: 'ops@starvnt.com',
      password: 'Admin1234',
      permissions: ['customers.read', 'customers.update'],
      reason: 'Hired for CX team',
    });
  assert.equal(res.status, 201);
  assert.equal(res.body.admin.role, 'ADMIN');
  assert.deepEqual(res.body.admin.permissions, ['customers.read', 'customers.update']);
  adminId = res.body.admin.id;

  const audit = await ctx.models.AdminAuditLog.findOne({ action: 'ADMIN_CREATE', targetId: adminId });
  assert.ok(audit, 'ADMIN_CREATE must be audited');
  assert.deepEqual(audit.toState.permissions, ['customers.read', 'customers.update']);
});

test('creating admin with out-of-catalog permission → 400', async () => {
  const res = await request(ctx.app)
    .post('/api/admin/users')
    .set('Authorization', `Bearer ${superToken}`)
    .send({
      fullName: 'Bad Perms',
      email: 'bad@starvnt.com',
      password: 'Admin1234',
      permissions: ['god.mode'],
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'INVALID_PERMISSIONS');
});

test('regular ADMIN cannot use user-management routes (SUPER_ADMIN only)', async () => {
  const res = await login('ops@starvnt.com');
  assert.equal(res.status, 200);
  adminToken = res.body.accessToken;

  const list = await request(ctx.app)
    .get('/api/admin/users')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(list.status, 403);

  const create = await request(ctx.app)
    .post('/api/admin/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fullName: 'X', email: 'x@starvnt.com', password: 'Admin1234' });
  assert.equal(create.status, 403);
});

test('missing permission → 403 FORBIDDEN with missing list', async () => {
  const res = await request(ctx.app)
    .get('/api/admin/ping') // requires analytics.read — ops admin lacks it
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 403);
  assert.deepEqual(res.body.missing, ['analytics.read']);
});

test('admin tokens are rejected by EXTERNAL API surfaces', async () => {
  const res = await request(ctx.app)
    .get('/api/customer/me')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 401);
});

test('permission update records from → to state', async () => {
  const res = await request(ctx.app)
    .patch(`/api/admin/users/${adminId}/permissions`)
    .set('Authorization', `Bearer ${superToken}`)
    .send({ permissions: ['customers.read', 'analytics.read'] });
  assert.equal(res.status, 200);

  const audit = await ctx.models.AdminAuditLog.findOne({
    action: 'PERMISSIONS_UPDATED',
    targetId: adminId,
  });
  assert.deepEqual(audit.fromState.permissions, ['customers.read', 'customers.update']);
  assert.deepEqual(audit.toState.permissions, ['customers.read', 'analytics.read']);
});

test('granted permission now passes the gate (fresh login)', async () => {
  const res = await login('ops@starvnt.com');
  const ping = await request(ctx.app)
    .get('/api/admin/ping')
    .set('Authorization', `Bearer ${res.body.accessToken}`);
  assert.equal(ping.status, 200);
});

test('disable → 401 on use, login blocked, sessions revoked (audited)', async () => {
  // Fresh token for ops admin, then disable.
  const before = await login('ops@starvnt.com');
  const liveToken = before.body.accessToken;

  const disable = await request(ctx.app)
    .post(`/api/admin/users/${adminId}/disable`)
    .set('Authorization', `Bearer ${superToken}`)
    .send({ reason: 'Offboarding' });
  assert.equal(disable.status, 200);

  // Previously-issued token must now be rejected (session revoked server-side).
  const me = await request(ctx.app)
    .get('/api/admin/auth/me')
    .set('Authorization', `Bearer ${liveToken}`);
  assert.equal(me.status, 401);

  // And login is blocked too.
  const relogin = await request(ctx.app)
    .post('/api/admin/auth/login')
    .send({ email: 'ops@starvnt.com', password: 'Admin1234' });
  assert.equal(relogin.status, 401);
  assert.equal(relogin.body.error, 'ACCOUNT_DISABLED');

  const audit = await ctx.models.AdminAuditLog.findOne({ action: 'ADMIN_DISABLE', targetId: adminId });
  assert.ok(audit);
  assert.equal(audit.reason, 'Offboarding');
});

test('SUPER_ADMIN cannot be disabled', async () => {
  const me = await request(ctx.app)
    .get('/api/admin/auth/me')
    .set('Authorization', `Bearer ${superToken}`);
  const res = await request(ctx.app)
    .post(`/api/admin/users/${me.body.admin.id}/disable`)
    .set('Authorization', `Bearer ${superToken}`);
  assert.equal(res.status, 400);
});

test('permission catalog route requires permissions.read', async () => {
  const forbidden = await request(ctx.app).get('/api/admin/permissions/catalog');
  assert.equal(forbidden.status, 401);

  const ok = await request(ctx.app)
    .get('/api/admin/permissions/catalog')
    .set('Authorization', `Bearer ${superToken}`);
  assert.equal(ok.status, 200);
  assert.ok(ok.body.all.includes('settlements.release'));
  assert.ok(ok.body.all.includes('audit.read'));
});

test('audit route requires audit.read and returns entries', async () => {
  const res = await request(ctx.app)
    .get('/api/admin/audit')
    .set('Authorization', `Bearer ${superToken}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.logs.length > 0);
});
