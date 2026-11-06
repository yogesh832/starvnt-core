import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceReminderTime, reminderStatus, mergeReminders } from '../src/pages/customer/reminderState.js';

test('reminder input resolves a valid device wall time into one absolute instant', () => {
  const value = '2028-10-20T14:35', at = deviceReminderTime(value), local = new Date(at);
  assert.equal(local.getFullYear(), 2028); assert.equal(local.getMonth(), 9); assert.equal(local.getDate(), 20);
  assert.equal(local.getHours(), 14); assert.equal(local.getMinutes(), 35); assert.match(at, /Z$/);
});
test('invalid or normalised calendar inputs do not silently shift a reminder', () => {
  for (const value of ['', '2028-02-30T12:00', '2028-13-01T12:00', '2028-10-20T25:00', '2028-10-20T12:99', '2028-10-20T12:00Z']) assert.equal(deviceReminderTime(value), null);
});
test('a handed-off reminder is never labelled as provider-confirmed delivery', () => {
  assert.equal(reminderStatus('DELIVERED'), 'Notification created');
  assert.equal(reminderStatus('PROCESSING'), 'Processing');
  assert.equal(reminderStatus('future-state'), 'Status unavailable');
});
test('cursor pages merge by durable reminder ID without duplicating a boundary row', () => {
  assert.deepEqual(mergeReminders([{ _id: 'a' }, { _id: 'b', status: 'PENDING' }], [{ _id: 'b', status: 'CANCELLED' }, { _id: 'c' }]), [{ _id: 'a' }, { _id: 'b', status: 'CANCELLED' }, { _id: 'c' }]);
});
