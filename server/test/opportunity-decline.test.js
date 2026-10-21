import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { ExternalSession } from '../src/external/models/ExternalSession.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { signExternalAccessToken } from '../src/external/utils/tokens.js';

test('declining a lead persists, enforces vendor ownership and cannot decline an answered lead', async (t) => {
  const vendor = '507f1f77bcf86cd799439011';
  const id = '507f1f77bcf86cd799439012';
  const user = { _id: 'vendor', status: 'ACTIVE', accountType: 'VENDOR', roles: ['VENDOR'], vendorOrganization: vendor, $locals: {} };
  t.mock.method(ExternalUser, 'findById', async () => user);
  t.mock.method(ExternalSession, 'findById', async () => ({ expiresAt: new Date(Date.now() + 60000), accountType: user.accountType }));
  t.mock.method(VendorOrganization, 'findById', async () => ({ _id: vendor }));
  let status = 'NEW';
  let owner = vendor;
  t.mock.method(Opportunity, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(filter._id, id);
    assert.equal(filter.vendor, vendor);
    if (owner !== filter.vendor || !filter.status.$in.includes(status)) return null;
    status = update.$set.status;
    return { status };
  });
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)); });
  const token = signExternalAccessToken(user, 'test-session', 'VENDOR');
  const decline = (target = id) => fetch(`http://127.0.0.1:${server.address().port}/api/vendor/opportunities/${target}/decline`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await decline()).status, 200);
  assert.equal(status, 'DECLINED');
  assert.equal((await decline()).status, 200); // Safe retry.
  status = 'RESPONDED';
  assert.equal((await decline()).status, 409);
  status = 'NEW'; owner = 'another-vendor';
  assert.equal((await decline()).status, 409);
  assert.equal(status, 'NEW');
  assert.equal((await decline('invalid-id')).status, 400);
  user.accountType = 'CUSTOMER'; user.roles = ['CUSTOMER'];
  const customerToken = signExternalAccessToken(user, 'test-session', 'CUSTOMER');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/vendor/opportunities/${id}/decline`, { method: 'POST', headers: { Authorization: `Bearer ${customerToken}` } });
  assert.equal(response.status, 403);
});
