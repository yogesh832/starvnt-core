import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/api/client.ts';
import { createSessionManager } from '../src/auth/sessionManager.ts';
import { portalLoginUrl } from '../src/portalAccess.ts';
const memory = (initial: string | null = null) => {
  let value = initial;
  return { get: async () => value, set: async (next: string) => { value = next; }, clear: async () => { value = null; } };
};
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
for (const expected of ['CUSTOMER', 'VENDOR'] as const) {
  const wrong = expected === 'CUSTOMER' ? 'VENDOR' : 'CUSTOMER';
  test(`${expected} native login blocks a legacy wrong-role response before persisting credentials`, async () => {
    const vault = memory();
    let surface;
    const external = createClient('https://api.test/api', vault, (async (_url: any, options: any) => {
      surface = options.headers['X-Starvnt-Surface'];
      return json({ accessToken: 'wrong', refreshToken: 'wrong-refresh', user: { accountType: wrong } });
    }) as typeof fetch, expected);
    const manager = createSessionManager({ external, internal: external, preference: memory(), cleanupPush: async () => {}, externalSurface: expected });
    await assert.rejects(manager.signIn('external', 'login', { accountType: wrong }), (error: any) => error.data.error === 'ACCOUNT_TYPE_MISMATCH');
    assert.equal(surface, expected); assert.equal(await vault.get(), null); assert.equal(manager.getState().user, null);
  });
  test(`${expected} rejects a saved opposite-portal refresh credential and retains a useful dashboard error`, async () => {
    const vault = memory('old-refresh');
    const external = createClient('https://api.test/api', vault, (async () => json({ error: 'ACCOUNT_TYPE_MISMATCH', accountType: wrong, message: `Use ${wrong.toLowerCase()} dashboard.` }, 403)) as typeof fetch, expected);
    const manager = createSessionManager({ external, internal: external, preference: memory('external'), cleanupPush: async () => {}, externalSurface: expected });
    await manager.restore();
    assert.equal(manager.getState().user, null); assert.equal(manager.getState().ready, true);
    assert.equal(manager.getState().portalMismatch?.accountType, wrong); assert.equal(await vault.get(), null);
  });
  test(`${expected} native login sends the fixed surface and still accepts matching accounts`, async () => {
    const vault = memory();
    let payload: any;
    const external = createClient('https://api.test/api', vault, (async (_url: any, options: any) => {
      payload = JSON.parse(options.body);
      return json({ accessToken: 'right', refreshToken: 'right-refresh', user: { accountType: expected } });
    }) as typeof fetch, expected);
    const manager = createSessionManager({ external, internal: external, preference: memory(), cleanupPush: async () => {}, externalSurface: expected });
    await manager.signIn('external', 'login', { accountType: wrong });
    assert.equal(payload.accountType, expected); assert.equal(manager.getState().user?.accountType, expected); assert.equal(await vault.get(), 'right-refresh');
  });
}
test('native portal link strips secrets and rejects unsafe destination protocols', () => {
  const original = process.env.EXPO_PUBLIC_VENDOR_PORTAL_URL;
  try {
    process.env.EXPO_PUBLIC_VENDOR_PORTAL_URL = 'https://vendor.example.test/x?token=secret';
    assert.equal(portalLoginUrl('VENDOR'), 'https://vendor.example.test/login');
    process.env.EXPO_PUBLIC_VENDOR_PORTAL_URL = 'javascript:alert(1)';
    assert.equal(portalLoginUrl('VENDOR'), 'https://vendor.starvnt.com/login');
  } finally { if (original === undefined) delete process.env.EXPO_PUBLIC_VENDOR_PORTAL_URL; else process.env.EXPO_PUBLIC_VENDOR_PORTAL_URL = original; }
});
