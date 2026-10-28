import test from 'node:test';
import assert from 'node:assert/strict';
import { milestones } from '../src/pages/customer/historyMilestones.js';

test('starting a draft does not mark event-day execution as complete', () => {
  const rows = [{ text: 'Corporate event draft started', group: 'planning', at: '2026-10-01' }];
  const result = milestones(rows);
  assert.equal(result[0][1], rows[0]);
  assert.equal(result[4][1], undefined);
  const execution = { text: 'Venue: started', group: 'execution', at: '2026-11-04' };
  assert.equal(milestones([...rows, execution])[4][1], execution);
});

test('manual planning and verified advances are represented honestly, including decimals', () => {
  const created = { text: 'Wedding plan created from your details', group: 'planning' };
  const result = milestones([created, { text: 'Payment of ₹1,234.50 verified', group: 'booking' }]);
  assert.equal(result[1][1], created);
  assert.equal(result[3][0], 'Payments verified (₹1,234.5)');
});
