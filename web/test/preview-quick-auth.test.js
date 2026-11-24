import { test } from 'node:test';
import assert from 'node:assert/strict';

test('customer-dev preview accepts each quick-auth role on its dashboard', async t => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { hostname: 'starvnt-core-sp5l.vercel.app', pathname: '/test-auth' } };
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  const { MULTI_SURFACE_TEST_PREVIEW, activePortalSurface, acceptPortalSession } =
    await import('../src/lib/portalAccess.js?preview-quick-auth');

  assert.equal(MULTI_SURFACE_TEST_PREVIEW, true);
  assert.equal(activePortalSurface('/test-auth'), null);
  assert.equal(activePortalSurface('/customer'), 'CUSTOMER');
  assert.equal(activePortalSurface('/vendor'), 'VENDOR');
  assert.equal(activePortalSurface('/vendor/bookings'), 'VENDOR');

  const api = { setToken(token) { this.token = token; } };
  const vendor = { accountType: 'VENDOR' };
  assert.equal(await acceptPortalSession({ user: vendor, accessToken: 'test-token' }, api, () => true, activePortalSurface('/test-auth')), vendor);
  assert.equal(api.token, 'test-token');
  await assert.rejects(
    acceptPortalSession({ user: vendor }, api, () => true, activePortalSurface('/customer')),
    /vendor dashboard/i,
  );
  assert.equal(api.token, null);
});

test('normal customer surface still rejects vendor sessions', async t => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { hostname: 'starvnt.com', pathname: '/customer' } };
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  const { MULTI_SURFACE_TEST_PREVIEW, activePortalSurface } =
    await import('../src/lib/portalAccess.js?normal-customer');
  assert.equal(MULTI_SURFACE_TEST_PREVIEW, false);
  assert.equal(activePortalSurface('/vendor'), 'CUSTOMER');
  assert.equal(activePortalSurface('/test-auth'), 'CUSTOMER');
});
