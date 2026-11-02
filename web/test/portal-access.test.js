import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptPortalSession, portalLoginUrl, portalPayload, PORTAL_SURFACE } from '../src/lib/portalAccess.js';
import { readFileSync } from 'node:fs';
const apiSource = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8').replaceAll('import.meta.env', '({ MODE: "test" })');
const { makeApi } = await import('data:text/javascript;base64,' + Buffer.from(apiSource).toString('base64'));

for (const expected of ['CUSTOMER', 'VENDOR']) {
  test(`${expected} accepts only its own identity and never switches an opposite-role account`, async () => {
    const tokens = [];
    const api = { setToken: token => tokens.push(token), call: () => { throw new Error('Must not convert an account'); } };
    const wrong = expected === 'CUSTOMER' ? 'VENDOR' : 'CUSTOMER';
    await assert.rejects(acceptPortalSession({ accessToken: 'wrong', user: { accountType: wrong } }, api, () => true, expected), error => error.data.error === 'ACCOUNT_TYPE_MISMATCH' && error.data.accountType === wrong);
    assert.deepEqual(tokens, [null]);
    const own = { accountType: expected };
    assert.equal(await acceptPortalSession({ accessToken: 'right', user: own }, api, () => true, expected), own);
    assert.deepEqual(tokens, [null, 'right']);
  });
}
test('each product pins its login payload and ignores stale asynchronous sessions', async () => {
  assert.equal(portalPayload({ accountType: 'ADMIN' }).accountType, PORTAL_SURFACE);
  assert.equal(await acceptPortalSession({ accessToken: 'late', user: { accountType: PORTAL_SURFACE } }, { setToken: () => assert.fail('stale token') }, () => false), null);
});
test('dashboard links use configuration and reject script URLs without carrying credentials', () => {
  assert.equal(portalLoginUrl('VENDOR', { VENDOR: 'https://vendor.example.test/path?token=secret#fragment' }), 'https://vendor.example.test/login');
  assert.equal(portalLoginUrl('CUSTOMER', { CUSTOMER: 'javascript:alert(1)' }), 'https://customer.starvnt.com/login');
});
test('refresh sends the product surface and propagates a wrong-portal error for the login UI', async () => {
  const original = globalThis.fetch;
  let headers;
  globalThis.fetch = async (_url, options) => {
    headers = options.headers;
    return new Response(JSON.stringify({ error: 'ACCOUNT_TYPE_MISMATCH', accountType: 'VENDOR', message: 'Use the vendor dashboard.' }), { status: 403 });
  };
  try {
    const api = makeApi('https://api.test/api', 'https://api.test/api/auth/refresh', { surface: 'CUSTOMER' });
    await assert.rejects(api.refresh(), error => error.data.accountType === 'VENDOR');
    assert.equal(headers['X-Starvnt-Surface'], 'CUSTOMER');
    assert.equal(api.getToken(), null);
  } finally { globalThis.fetch = original; }
});
