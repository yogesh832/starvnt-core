import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadAdminNotifications, notificationReadKey } from '../../web/src/lib/adminNotifications.js';
import { rolePresetPermissions } from '../src/admin/constants/permissions.js';

test('sales notifications request only allowed event sources with matching destination tabs', async () => {
  for (const role of ['SALES_EXECUTIVE', 'SALES_MANAGER']) {
    const permissions = rolePresetPermissions(role);
    const paths = [];
    const { items, incomplete } = await loadAdminNotifications((permission) => permissions.includes(permission), async (path) => {
      paths.push(path);
      return { stats: { draft: 3, planning: 8 } };
    });
    assert.deepEqual(paths, ['/events?limit=1&tab=Planning']);
    assert.equal(incomplete, false);
    assert.deepEqual(items.map((item) => [item.id, item.to, item.category]), [
      ['events-draft', '/admin/events?tab=Draft', 'Sales'],
      ['events-planning', '/admin/events?tab=Planning', 'Sales'],
    ]);
  }
});

test('KYC notification counts use the entire queue rather than the limited preview', async () => {
  const { items } = await loadAdminNotifications((permission) => permission === 'vendors.approve', async () => ({
    total: 35, organizations: [{ businessName: 'One Studio' }, { businessName: 'Two Studio' }],
  }));
  assert.equal(items.length, 1);
  assert.equal(items[0].title, '35 vendor KYC reviews pending');
  assert.match(items[0].body, /One Studio/);
});

test('partial notification failures retain working sources and signal incomplete data', async () => {
  const { items, incomplete } = await loadAdminNotifications(() => true, async (path) => {
    if (path.startsWith('/audit')) return { logs: [{ _id: 'new-staff', action: 'ADMIN_CREATE', actorEmail: 'owner@example.test', toState: { email: 'sales@example.test', roleKey: 'SALES_MANAGER' } }] };
    throw new Error('Unavailable source');
  });
  assert.equal(incomplete, true);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Staff account created');
  assert.match(items[0].body, /sales manager/);
});

test('payment alerts require approval permission, while execution alerts require execution access', async () => {
  const allowed = new Set(['bookings.read', 'execution.read']);
  const { items } = await loadAdminNotifications((p) => allowed.has(p), async () => ({ stats: { pendingPaymentCount: 4, inProgressCount: 2 } }));
  assert.deepEqual(items.map((item) => item.id), ['execution']);
});

test('a changed queue summary becomes unread while unchanged summaries retain their read key', () => {
  const item = { id: 'events-planning', title: '2 events in planning', body: 'Follow up' };
  assert.equal(notificationReadKey(item), notificationReadKey({ ...item }));
  assert.notEqual(notificationReadKey(item), notificationReadKey({ ...item, title: '3 events in planning' }));
});
