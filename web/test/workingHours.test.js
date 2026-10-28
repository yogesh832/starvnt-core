import test from 'node:test';
import assert from 'node:assert/strict';
import { workingHoursLabel } from '../src/pages/customer/workingHours.js';

test('customer detail respects the capitalized day keys saved by Vendor OS', () => {
  const hours = { Monday: { isOpen: true, hours: '9 AM – 7 PM' }, Sunday: { isOpen: false } };
  assert.equal(workingHoursLabel(hours, 'monday'), '9 AM – 7 PM');
  assert.equal(workingHoursLabel(hours, 'sunday'), 'Closed');
  assert.equal(workingHoursLabel(hours, 'tuesday'), 'Not provided');
  assert.equal(workingHoursLabel({ friday: { isOpen: true } }, 'Friday'), 'Open');
});
