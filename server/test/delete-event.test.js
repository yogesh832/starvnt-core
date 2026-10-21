import assert from 'node:assert/strict';
import { test } from 'node:test';
import { externalConn } from '../src/db/index.js';
import { CustomerEvent, EventRequirement, EventHistory, AuraContext, AuraSession, AuraMessage, CustomerQuote, Reservation, Payment, Booking, EventMessage, CustomerNotification, OptionAvailability } from '../src/customer/models/index.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { deleteDraftEvent } from '../src/customer/services/deleteEvent.service.js';

function fixture(t, { event = { _id: 'owned-event', status: 'draft' }, commitment = null, deletedCount = 1 } = {}) {
  const session = {}, calls = [], outcomes = [];
  const query = value => ({ session(valueSession) { assert.equal(valueSession, session); return this; }, lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
  t.mock.method(externalConn, 'transaction', async fn => { try { const result = await fn(session); outcomes.push('committed'); return result; } catch (error) { outcomes.push('aborted'); throw error; } });
  t.mock.method(CustomerEvent, 'findOne', filter => { assert.deepEqual(filter, { _id: 'owned-event', customer: 'owner' }); return query(event); });
  t.mock.method(CustomerEvent, 'deleteOne', filter => { calls.push(['event', filter]); return query({ deletedCount }); });
  for (const model of [Booking, Payment, Reservation, CustomerQuote, Opportunity, OptionAvailability]) t.mock.method(model, 'exists', filter => { assert.equal(filter.event || filter.customerEvent, 'owned-event'); return query(model === commitment ? { _id: 'existing' } : null); });
  t.mock.method(CoreBooking, 'exists', async filter => { assert.deepEqual(filter, { customerId: 'owner', customerEvent: 'owned-event' }); return commitment === CoreBooking ? { _id: 'core' } : null; });
  t.mock.method(AuraSession, 'find', filter => { assert.deepEqual(filter, { customer: 'owner', event: 'owned-event' }); return query([{ _id: 'owned-conversation' }]); });
  for (const model of [EventRequirement, EventHistory, AuraContext, EventMessage, CustomerNotification, OptionAvailability, AuraSession, AuraMessage]) t.mock.method(model, 'deleteMany', filter => { calls.push([model.modelName, filter]); return query({ deletedCount: 1 }); });
  t.mock.method(AuraSession, 'updateMany', (filter, update) => { calls.push(['session-links', filter, update]); return query({ modifiedCount: 1 }); });
  return { calls, outcomes };
}
test('delete rejects non-owned or missing events before any mutation', async t => {
  const h = fixture(t, { event: null });
  await assert.rejects(deleteDraftEvent('owner', 'owned-event'), error => error.status === 404);
  assert.deepEqual(h.calls, []); assert.deepEqual(h.outcomes, ['aborted']);
});
test('confirmed events cannot be deleted', async t => {
  const h = fixture(t, { event: { _id: 'owned-event', status: 'planning' } });
  await assert.rejects(deleteDraftEvent('owner', 'owned-event'), error => error.code === 'EVENT_DELETE_LOCKED');
  assert.deepEqual(h.calls, []);
});
test('each persisted commerce commitment protects an inconsistent draft from deletion', async t => {
  for (const model of [Booking, Payment, Reservation, CustomerQuote, Opportunity, OptionAvailability, CoreBooking]) await t.test(model.modelName, async child => {
    const h = fixture(child, { commitment: model });
    await assert.rejects(deleteDraftEvent('owner', 'owned-event'), error => error.code === 'EVENT_HAS_COMMITMENTS');
    assert.deepEqual(h.calls, []); assert.deepEqual(h.outcomes, ['aborted']);
  });
});
test('deletion scopes child cleanup, conversations and navigation references to the owned draft', async t => {
  const h = fixture(t);
  assert.deepEqual(await deleteDraftEvent('owner', 'owned-event'), { ok: true, deletedEventId: 'owned-event' });
  assert.deepEqual(h.calls[0], ['event', { _id: 'owned-event', customer: 'owner', status: 'draft' }]);
  assert.ok(h.calls.some(([model, filter]) => model === 'CustomerAuraMessage' && filter.session.$in.includes('owned-conversation')) || h.calls.some(([, filter]) => filter.session?.$in?.includes('owned-conversation')));
  for (const [model, filter] of h.calls) if (model === 'session-links') assert.equal(filter.customer, 'owner');
  assert.deepEqual(h.outcomes, ['committed']);
});
test('a concurrent event status change aborts before child data is removed', async t => {
  const h = fixture(t, { deletedCount: 0 });
  await assert.rejects(deleteDraftEvent('owner', 'owned-event'), error => error.code === 'EVENT_CHANGED');
  assert.equal(h.calls.length, 1); assert.deepEqual(h.outcomes, ['aborted']);
});
