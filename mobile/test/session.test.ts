import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '../src/api/client.ts';
import { createSessionManager } from '../src/auth/sessionManager.ts';

function memory(initial: string | null = null) {
  let value = initial;
  return { get: async () => value, set: async (v: string) => { value = v; }, clear: async () => { value = null; } };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const json = (data: object, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function setup(options: { preference?: string; external?: string; admin?: string; fetcher?: typeof fetch; cleanupPush?: () => Promise<void> } = {}) {
  const outside = memory(options.external || null);
  const inside = memory(options.admin || null);
  const preference = memory(options.preference || null);
  const fetcher = options.fetcher || (async (url: any) => {
    const admin = String(url).includes('/admin/');
    return json({ accessToken: 'access', refreshToken: admin ? 'admin-next' : 'external-next', ...(admin ? { admin: { id: 'staff', role: 'ADMIN' } } : { user: { id: 'customer', accountType: 'CUSTOMER' } }) });
  }) as typeof fetch;
  const external = createClient('https://example.test/api', outside, fetcher);
  const internal = createClient('https://example.test/api/admin', inside, fetcher);
  const deps = { external, internal, preference, cleanupPush: options.cleanupPush || (async () => {}) };
  return { manager: createSessionManager(deps), deps, outside, inside, preference };
}

test('an old admin credential alone never selects the admin dashboard on startup', async () => {
  const { manager } = setup({ admin: 'old-admin' });
  await manager.restore();
  assert.equal(manager.getState().activeDomain, 'external');
  assert.equal(manager.getState().user, null);
  assert.equal(manager.getState().admin, null);
  assert.equal(manager.getState().ready, true);
});

test('explicit admin sign-in restores admin; a later customer sign-in restores customer', async () => {
  const { manager, deps, preference } = setup();
  await manager.signIn('admin', 'login', {});
  assert.equal(await preference.get(), 'admin');
  const again = createSessionManager(deps);
  await again.restore();
  assert.equal(again.getState().activeDomain, 'admin');
  assert.equal(again.getState().admin?.id, 'staff');
  await again.signIn('external', 'register', {});
  const customer = createSessionManager(deps);
  await customer.restore();
  assert.equal(customer.getState().activeDomain, 'external');
  assert.equal(customer.getState().user?.accountType, 'CUSTOMER');
});

test('offline logout clears both domains and stays signed out after remount and refresh', async () => {
  const never = deferred<void>();
  const { manager, outside, inside, deps, preference } = setup({
    external: 'customer-token', admin: 'admin-token', preference: 'admin',
    fetcher: (async () => { throw new Error('offline'); }) as typeof fetch,
    cleanupPush: () => never.promise,
  });
  await manager.logout();
  assert.equal(await outside.get(), null);
  assert.equal(await inside.get(), null);
  assert.equal(await preference.get(), 'guest');
  assert.equal(manager.getState().admin, null);
  assert.equal(manager.getState().user, null);
  assert.equal(manager.getState().activeDomain, 'external');
  assert.equal(manager.getState().ready, true);
  const relaunched = createSessionManager(deps);
  await relaunched.restore();
  assert.equal(relaunched.getState().error, '');
  assert.equal(relaunched.getState().user, null);
  assert.equal(relaunched.getState().admin, null);
});

test('a login response arriving after logout cannot reauthenticate the app', async () => {
  const gate = deferred<Response>();
  const { manager, outside, preference } = setup({ fetcher: (async (url) =>
    String(url).endsWith('/login') ? gate.promise : json({ ok: true })) as typeof fetch });
  const login = manager.signIn('external', 'login', {});
  const rejected = assert.rejects(login, /cancelled/);
  await manager.logout();
  gate.resolve(json({ accessToken: 'late', refreshToken: 'late-token', user: { id: 'late' } }));
  await rejected;
  assert.equal(manager.getState().user, null);
  assert.equal(await outside.get(), null);
  assert.equal(await preference.get(), 'guest');
});

test('a restore arriving after logout cannot resurrect the admin dashboard', async () => {
  const started = deferred<void>();
  const gate = deferred<Response>();
  const { manager, inside } = setup({ admin: 'old', preference: 'admin', fetcher: (async (url) => {
    if (String(url).endsWith('/refresh')) { started.resolve(); return gate.promise; }
    return json({ ok: true });
  }) as typeof fetch });
  const restoring = manager.restore();
  await started.promise;
  await manager.logout();
  gate.resolve(json({ accessToken: 'late', refreshToken: 'late', admin: { id: 'late' } }));
  await restoring;
  assert.equal(manager.getState().admin, null);
  assert.equal(await inside.get(), null);
  assert.equal(manager.getState().activeDomain, 'external');
});

test('customer and vendor can sign in again after sign-out', async () => {
  const { manager, deps } = setup({ fetcher: (async (url, options) => {
    const body = JSON.parse(String(options?.body || '{}'));
    return json({ accessToken: 'access', refreshToken: 'refresh', user: { id: body.email || 'account', accountType: body.accountType || 'VENDOR' } });
  }) as typeof fetch });
  for (const accountType of ['CUSTOMER', 'VENDOR']) {
    await manager.signIn('external', 'login', { email: 'first', accountType });
    assert.equal(manager.getState().user?.accountType, accountType);
    await manager.logout();
    await manager.signIn('external', 'login', { email: 'second', accountType });
    assert.equal(manager.getState().user?.id, 'second');
    assert.equal(manager.getState().activeDomain, 'external');
    const relaunched = createSessionManager(deps);
    await relaunched.restore();
    assert.equal(relaunched.getState().activeDomain, 'external');
    await manager.logout();
  }
});

test('visiting internal sign-in without signing in never persists an admin selection', async () => {
  const { manager, preference } = setup();
  manager.setActiveDomain('admin');
  assert.equal(await preference.get(), null);
  await manager.restore();
  assert.equal(manager.getState().activeDomain, 'external');
});

test('customer startup does not refresh an unused admin credential', async () => {
  const urls: string[] = [];
  const { manager } = setup({ external: 'customer', admin: 'staff', preference: 'external', fetcher: (async url => {
    urls.push(String(url));
    if (String(url).includes('/admin/')) throw new Error('Unused server unavailable');
    return json({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'customer', accountType: 'CUSTOMER' } });
  }) as typeof fetch });
  await manager.restore();
  assert.equal(urls.length, 1);
  assert.equal(manager.getState().error, '');
  assert.equal(manager.getState().user?.id, 'customer');
  assert.equal(manager.getState().admin, null);
});

test('expired admin session does not fall back to a saved customer session', async () => {
  const { manager } = setup({ external: 'customer', admin: 'expired', preference: 'admin', fetcher: (async () => json({ error: 'SESSION_INVALID' }, 401)) as typeof fetch });
  const disconnect = manager.connect();
  await manager.restore();
  assert.equal(manager.getState().user, null);
  assert.equal(manager.getState().admin, null);
  assert.equal(manager.getState().activeDomain, 'admin');
  assert.equal(manager.getState().ready, true);
  disconnect();
});

test('switching customer/vendor surfaces uses the returned external role and persists it', async () => {
  const { manager, preference } = setup({ fetcher: (async (_url, options) => {
    const body = JSON.parse(String(options?.body || '{}'));
    return json({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'same-account', accountType: body.targetSurface || 'CUSTOMER' } });
  }) as typeof fetch });
  await manager.signIn('external', 'login', {});
  await manager.switchSurface('VENDOR');
  assert.equal(manager.getState().user?.accountType, 'VENDOR');
  assert.equal(manager.getState().activeDomain, 'external');
  assert.equal(manager.getState().admin, null);
  assert.equal(await preference.get(), 'external');
  await manager.switchSurface('CUSTOMER');
  assert.equal(manager.getState().user?.accountType, 'CUSTOMER');
});

test('a rejected workspace switch leaves the signed-in workspace intact', async () => {
  const { manager } = setup({ fetcher: (async url => String(url).endsWith('/switch-surface')
    ? json({ error: 'ACCOUNT_DISABLED' }, 403)
    : json({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'customer', accountType: 'CUSTOMER' } })) as typeof fetch });
  await manager.signIn('external', 'login', {});
  await assert.rejects(manager.switchSurface('VENDOR'));
  assert.equal(manager.getState().user?.id, 'customer');
  assert.equal(manager.getState().user?.accountType, 'CUSTOMER');
  assert.equal(manager.getState().ready, true);
});

for (const domain of ['external', 'admin'] as const) {
  test(`Quick Auth ${domain} sessions end on reload without needing a successful server logout`, async () => {
    const { manager, deps, outside, inside, preference } = setup();
    await manager.signIn(domain, 'dev-auth', { email: 'test-persona' });
    assert.ok(domain === 'admin' ? manager.getState().admin : manager.getState().user);
    assert.equal(await outside.get(), null);
    assert.equal(await inside.get(), null);
    assert.equal(await preference.get(), 'guest');
    manager.setActiveDomain(domain);
    await Promise.resolve();
    assert.equal(await preference.get(), 'guest');
    const relaunched = createSessionManager(deps);
    await relaunched.restore();
    assert.equal(relaunched.getState().user, null);
    assert.equal(relaunched.getState().admin, null);
    assert.equal(relaunched.getState().activeDomain, 'external');
  });
}

test('switching workspace during Quick Auth cannot persist the test session', async () => {
  const { manager, outside, preference } = setup();
  await manager.signIn('external', 'dev-auth', {});
  await manager.switchSurface('VENDOR');
  assert.ok(manager.getState().user);
  assert.equal(await outside.get(), null);
  assert.equal(await preference.get(), 'guest');
});
