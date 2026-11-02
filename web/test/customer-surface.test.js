import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerNextPath, customerPayload, acceptCustomerSession } from '../src/lib/customerSurface.js';
test('customer auth cannot be switched by vendor payloads or external return destinations', () => {
  assert.equal(customerPayload({ accountType: 'VENDOR', email: 'a@example.test' }).accountType, 'CUSTOMER');
  for (const value of ['/vendor', '/customer-vendor', '//other.test', 'https://other.test', '/customer\\evil', undefined]) assert.equal(customerNextPath(value), '/customer');
  assert.equal(customerNextPath('/customer/events/abc/proposal?version=2'), '/customer/events/abc/proposal?version=2');
});
test('a saved vendor session is rejected without conversion or retaining the vendor token', async () => {
  let token = 'old'; let calls = 0;
  const api = { setToken: value => { token = value; }, call: async () => { calls++; } };
  await assert.rejects(acceptCustomerSession({ accessToken: 'vendor-token', user: { accountType: 'VENDOR' } }, api), error => error.data.error === 'ACCOUNT_TYPE_MISMATCH');
  assert.equal(token, null); assert.equal(calls, 0);
});
test('an asynchronous customer restore cannot set a token after sign-out', async () => {
  assert.equal(await acceptCustomerSession({ accessToken: 'late', user: { accountType: 'CUSTOMER' } }, { setToken: () => assert.fail('stale token') }, () => false), null);
});
