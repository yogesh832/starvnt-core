import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityState } from '../src/components/auraActivityState.js';
test('live activity distinguishes saved changes from poll timestamps and resets when switching events', () => {
  const snapshot = { scope: { eventId: 'a' }, items: [{ id: 'quote:1', total: 1000, status: 'SENT' }] };
  let state = activityState(null, snapshot);
  assert.deepEqual(state.changes, {}, 'First load establishes the baseline');
  state = activityState(state, { ...snapshot, checkedAt: 'later' });
  assert.deepEqual(state.changes, {});
  const edited = { ...snapshot, items: [{ ...snapshot.items[0], total: 1500 }, { id: 'booking:1', status: 'CONFIRMED' }] };
  state = activityState(state, edited);
  assert.deepEqual(state.changes, { 'quote:1': 'Updated', 'booking:1': 'New' });
  state = activityState(state, { ...edited, checkedAt: 'even later' });
  assert.equal(state.changes['booking:1'], 'New');
  state = activityState(state, { ...edited, items: edited.items.slice(0, 1) });
  assert.equal(state.changes['booking:1'], undefined);
  assert.deepEqual(activityState(state, { ...snapshot, scope: { eventId: 'b' } }).changes, {});
  assert.equal(activityState(state, null), null);
});
