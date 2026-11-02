import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerNextPath, customerPayload, acceptCustomerSession } from '../src/lib/customerSurface.js';
test('customer auth cannot be switched by vendor payloads or external return destinations', () => {
  assert.equal(customerPayload({ accountType: 'VENDOR', email: 'a@example.test' }).accountType, 'CUSTOMER');
  for (const value of ['/vendor', '/customer-vendor', '//other.test', 'https://other.test', '/customer\\evil', undefined]) assert.equal(customerNextPath(value), '/customer');
  assert.equal(customerNextPath('/customer/events/abc/proposal?version=2'), '/customer/events/abc/proposal?version=2');
});
test('a saved vendor session is converted using the authoritative customer surface endpoint', async () => {
  const calls = [], tokens = [];
  const api = { setToken: value => tokens.push(value), call: async (...args) => { calls.push(args); return { accessToken: 'customer-token', user: { id: 'same-person', accountType: 'CUSTOMER' } }; } };
  const user = await acceptCustomerSession({ accessToken: 'vendor-token', user: { id: 'same-person', accountType: 'VENDOR' } }, api);
  assert.equal(user.accountType, 'CUSTOMER'); assert.deepEqual(tokens, ['vendor-token', 'customer-token']);
  assert.deepEqual(calls[0], ['/auth/switch-surface', { method: 'POST', body: { targetSurface: 'CUSTOMER' } }]);
});
test('failed conversion clears the web token and never accepts a vendor workspace', async () => {
  for (const response of [null, { user: { accountType: 'VENDOR' } }]) {
    let token = 'old'; const api = { setToken: value => { token = value; }, call: async () => response };
    await assert.rejects(acceptCustomerSession({ user: { accountType: 'VENDOR' } }, api)); assert.equal(token, null);
  }
});

test('a delayed vendor conversion cannot restore a session after sign-out', async () => {
  let resolve; const pending = new Promise(r => { resolve = r; }); let current = true; let token = 'vendor';
  const api = { setToken: value => { token = value; }, call: async () => pending };
  const result = acceptCustomerSession({ user: { accountType: 'VENDOR' } }, api, () => current);
  current = false; token = null;
  resolve({ accessToken: 'late-customer', user: { accountType: 'CUSTOMER' } });
  assert.equal(await result, null); assert.equal(token, null);
});
