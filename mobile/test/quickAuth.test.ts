import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quickAuthenticate } from '../src/auth/quickAuth.ts';

for (const account of [
  { domain: 'external' as const, email: 'customer@starvnt.com', accountType: 'CUSTOMER' },
  { domain: 'external' as const, email: 'vendor@starvnt.com', accountType: 'VENDOR' },
  { domain: 'admin' as const, email: 'admin@starvnt.com', role: 'SUPER_ADMIN' },
]) {
  test(`Quick Auth exits the persona list when reselecting ${account.email}`, async () => {
    const events: unknown[] = [];
    await quickAuthenticate(account, async (domain, path, payload) => {
      events.push({ domain, path, payload });
    }, {
      getState: () => ({ routeNames: ['Main', 'TestAuth'] }),
      reset: state => { events.push(state); },
    });
    assert.deepEqual(events, [
      { domain: account.domain, path: 'dev-auth', payload: { email: account.email, ...(account.domain === 'admin' ? { role: account.role } : { accountType: account.accountType }) } },
      { index: 0, routes: [{ name: 'Main' }] },
    ]);
  });
}

test('Quick Auth from guest waits for session navigation rather than opening an unregistered route', async () => {
  await quickAuthenticate({ domain: 'external', email: 'test', accountType: 'CUSTOMER' }, async () => {}, {
    getState: () => ({ routeNames: ['Landing', 'Auth', 'TestAuth'] }),
    reset: () => { assert.fail('Main is not registered in a guest navigator'); },
  });
});

test('Quick Auth errors propagate for retry without navigating into a dashboard', async () => {
  await assert.rejects(quickAuthenticate({ domain: 'admin', email: 'test' }, async () => {
    throw new Error('Could not reach STARVNT');
  }, {
    getState: () => ({ routeNames: ['Main', 'TestAuth'] }),
    reset: () => { assert.fail('Failed authentication must not open Main'); },
  }), /Could not reach/);
});
