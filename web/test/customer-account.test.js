import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveStorageKey, parseArchivedEvents, eventCounts, isEventArchived, accountHistory } from '../src/pages/customer/accountState.js';

test('archive preferences are isolated by account and reject malformed stored IDs', () => {
  assert.notEqual(archiveStorageKey('one'), archiveStorageKey('two'));
  assert.equal(archiveStorageKey(null), null);
  assert.deepEqual(parseArchivedEvents('invalid JSON'), []);
  assert.deepEqual(parseArchivedEvents('{"event":"a"}'), []);
  assert.deepEqual(parseArchivedEvents('["a","a",null,123,"../other"]'), ['a']);
});
test('unknown event counts remain unknown until records load; successful empty lists are zero', () => {
  assert.equal(eventCounts(undefined), null);
  assert.deepEqual(eventCounts([]), { total: 0, active: 0, completed: 0, cancelled: 0 });
  assert.deepEqual(eventCounts(['draft', 'planning', 'booked', 'in_progress', 'completed', 'cancelled'].map(status => ({ status }))), { total: 6, active: 4, completed: 1, cancelled: 1 });
});
test('archive cannot hide active or reopened events and never mutates the source status', () => {
  const closed = { id: 'event', status: 'completed' }, active = { ...closed, status: 'in_progress' };
  assert.equal(isEventArchived(closed, ['event']), true);
  assert.equal(isEventArchived(active, ['event']), false);
  assert.equal(closed.status, 'completed');
  assert.deepEqual(accountHistory([active], { archivedIds: ['event'] }), [active]);
});
test('history filters retain event identity and distinguish archived from cancelled records', () => {
  const rows = [{ id: 'a', title: 'Reception', status: 'completed' }, { id: 'b', title: 'Reception', status: 'cancelled' }, { id: 'c', title: 'Conference', status: 'planning' }];
  assert.deepEqual(accountHistory(rows, { archivedIds: ['a'], view: 'archived' }).map(row => row.id), ['a']);
  assert.deepEqual(accountHistory(rows, { archivedIds: ['a'], view: 'all', status: 'cancelled', search: 'RECEPTION' }).map(row => row.id), ['b']);
  assert.deepEqual(accountHistory(rows, { archivedIds: ['a'] }).map(row => row.id), ['b', 'c']);
});
