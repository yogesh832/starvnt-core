import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { AdminSession } from '../src/admin/models/AdminSession.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { AdminAuditLog } from '../src/admin/models/AdminAuditLog.js';
import { signAdminAccessToken } from '../src/admin/utils/tokens.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';
import { rolePresetPermissions } from '../src/admin/constants/permissions.js';

// Exercise real HTTP routes, JWT verification and permission middleware without
// touching the local app's remote databases or creating development accounts.
test('admin/vendor HTTP authentication, RBAC and revocation', async (t) => {
  const identity = (id, extra) => ({ _id: id, status: 'ACTIVE', ...extra, toSafeJSON() { return { id: this._id, role: this.role, roleKey: this.roleKey, accountType: this.accountType, permissions: this.permissions }; } });
  const admins = new Map([
    ['super', identity('super', { role: 'SUPER_ADMIN', permissions: [] })],
    ['ops', identity('ops', { role: 'ADMIN', permissions: rolePresetPermissions('OPERATIONS_ADMIN') })],
    ['finance', identity('finance', { role: 'ADMIN', permissions: rolePresetPermissions('FINANCE_ADMIN') })],
    ['support', identity('support', { role: 'ADMIN', permissions: rolePresetPermissions('SUPPORT_ADMIN') })],
    ['limited', identity('limited', { role: 'ADMIN', permissions: [] })],
    ['sales', identity('sales', { role: 'ADMIN', roleKey: 'SALES_EXECUTIVE', permissions: rolePresetPermissions('SALES_EXECUTIVE') })],
    ['sales-manager', identity('sales-manager', { role: 'ADMIN', roleKey: 'SALES_MANAGER', permissions: rolePresetPermissions('SALES_MANAGER') })],
  ]);
  const external = new Map([
    ['vendor', identity('vendor', { accountType: 'VENDOR', roles: ['VENDOR'], $locals: {} })],
    ['customer', identity('customer', { accountType: 'CUSTOMER', roles: ['CUSTOMER'], $locals: {} })],
  ]);
  const sessions = new Map();
  for (const id of [...admins.keys(), ...external.keys()]) sessions.set(id, { _id: id, expiresAt: new Date(Date.now() + 60000), accountType: external.get(id)?.accountType });
  t.mock.method(AdminUser, 'findById', async (id) => admins.get(id));
  t.mock.method(AdminSession, 'findById', async (id) => sessions.get(id));
  t.mock.method(ExternalUser, 'findById', async (id) => external.get(id));
  t.mock.method(ExternalSession, 'findById', async (id) => sessions.get(id));
  const query = (value) => ({ sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => value });
  t.mock.method(CoreBooking, 'find', () => query([]));
  t.mock.method(CoreBooking, 'countDocuments', async () => 0);
  t.mock.method(CoreBooking, 'aggregate', async () => []);
  t.mock.method(CoreBooking, 'distinct', async () => []);
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (id) => admins.has(id) ? signAdminAccessToken(admins.get(id), id) : signExternalAccessToken(external.get(id), id, external.get(id).accountType);
  const status = async (path, id) => (await fetch(`${base}${path}`, { headers: id ? { Authorization: `Bearer ${token(id)}` } : {} })).status;

  await t.test('anonymous requests cannot read either dashboard API', async () => {
    assert.equal(await status('/api/admin/auth/me'), 401);
    assert.equal(await status('/api/vendor/me'), 401);
  });
  await t.test('tokens are rejected across the two identity domains', async () => {
    assert.equal(await status('/api/admin/auth/me', 'vendor'), 401);
    assert.equal(await status('/api/vendor/me', 'super'), 401);
  });
  await t.test('vendor/customer account types remain separate', async () => {
    assert.equal(await status('/api/vendor/me', 'vendor'), 200);
    assert.equal(await status('/api/customer/me', 'customer'), 200);
    assert.equal(await status('/api/customer/me', 'vendor'), 403);
    assert.equal(await status('/api/vendor/me', 'customer'), 403);
  });
  await t.test('finance and support can read bookings without gaining operations write authority', async () => {
    for (const id of ['super', 'ops', 'finance', 'support']) assert.equal(await status('/api/admin/operations/bookings?limit=1', id), 200, `${id} should read bookings`);
    assert.equal(await status('/api/admin/operations/bookings?limit=1', 'limited'), 403);
    assert.equal(await status('/api/admin/users', 'support'), 403);
  });
  await t.test('revoked and disabled sessions cannot enter the portals', async () => {
    sessions.get('vendor').revokedAt = new Date();
    admins.get('ops').status = 'DISABLED';
    assert.equal(await status('/api/vendor/me', 'vendor'), 401);
    assert.equal(await status('/api/admin/auth/me', 'ops'), 401);
  });
  await t.test('sales roles can read bookings but cannot access finance or staff administration', async () => {
    for (const id of ['sales', 'sales-manager']) {
      assert.equal(await status('/api/admin/operations/bookings?limit=1', id), 200);
      assert.equal(await status('/api/admin/operations/finance-summary', id), 403);
      assert.equal(await status('/api/admin/users', id), 403);
    }
  });
  await t.test('sales presets are available in the picker and assigned on create and edit', async (t) => {
    const catalogResponse = await fetch(`${base}/api/admin/permissions/catalog`, { headers: { Authorization: `Bearer ${token('super')}` } });
    assert.equal(catalogResponse.status, 200);
    const catalog = await catalogResponse.json();
    assert.equal(catalog.rolePresets.SALES_EXECUTIVE.label, 'Sales Executive');
    assert.equal(catalog.rolePresets.SALES_MANAGER.label, 'Sales Manager');
    t.mock.method(AdminUser, 'findOne', async () => null);
    t.mock.method(AdminUser, 'create', async (data) => identity('created-sales', data));
    t.mock.method(AdminAuditLog, 'create', async () => ({}));
    const write = async (path, method, body) => fetch(`${base}${path}`, {
      method, headers: { Authorization: `Bearer ${token('super')}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const created = await write('/api/admin/users', 'POST', {
      fullName: 'Sales Test', email: 'sales@example.test', password: 'SalesTestPassword123!', roleKey: 'sales_executive', permissions: ['payments.refund'],
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.admin.roleKey, 'SALES_EXECUTIVE');
    assert.deepEqual(createdBody.admin.permissions, rolePresetPermissions('SALES_EXECUTIVE'));
    admins.get('sales').save = async () => {};
    const updated = await write('/api/admin/users/sales/permissions', 'PATCH', { roleKey: 'SALES_MANAGER', permissions: ['users.create'] });
    assert.equal(updated.status, 200);
    const updatedBody = await updated.json();
    assert.equal(updatedBody.admin.roleKey, 'SALES_MANAGER');
    assert.deepEqual(updatedBody.admin.permissions, rolePresetPermissions('SALES_MANAGER'));
  });
});
