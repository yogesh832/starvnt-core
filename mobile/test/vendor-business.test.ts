import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyGoal, goalPayload, metricMoney, metricNumber, metricDuration, metricPeriod } from '../src/vendorBusiness.ts';

const valid = () => ({ ...emptyGoal(), name: 'Improve bookings', metric: 'CONFIRMED_BOOKINGS', targetValue: '3', startDate: '2026-10-01', endDate: '2026-10-31' });
test('goal requests keep the configured UTC period and numeric target for the authoritative API', () => {
  assert.deepEqual(goalPayload({ ...valid(), name: '  Improve bookings  ' }), { ...valid(), targetValue: 3 });
});
test('goal form rejects impossible and reversed calendar dates, excessive periods and unsupported metrics', () => {
  for (const change of [
    { startDate: '2026-02-30' }, { endDate: '2026-09-30' }, { startDate: '2024-10-01' },
    { startDate: '2026-1-01' }, { metric: 'PROFIT' }, { name: 'a' }, { name: 'x'.repeat(81) },
  ]) assert.throws(() => goalPayload({ ...valid(), ...change }));
});
test('count goals cannot submit empty, negative, fractional, infinite or excessive targets', () => {
  for (const targetValue of ['', '-1', '0', '1.5', 'Infinity', '1000001', 'not a number']) assert.throws(() => goalPayload({ ...valid(), targetValue }));
});
test('unavailable finance and response measurements remain distinct from verified zero', () => {
  for (const value of [null, undefined, NaN, Infinity, '0']) {
    assert.equal(metricMoney(value), 'Unavailable');
    assert.equal(metricNumber(value), 'Unavailable');
    assert.equal(metricDuration(value), 'Insufficient data');
  }
  assert.equal(metricMoney(0), '₹0');
  assert.equal(metricNumber(0), '0');
  assert.equal(metricDuration(0), '0 min');
  assert.equal(metricMoney(1234.56), '₹1,234.56');
});
test('dashboard period labels honor the backend IST exclusive end boundary on any device timezone', () => {
  const period = metricPeriod({ start: '2026-09-30T18:30:00Z', end: '2026-10-31T18:30:00Z' });
  assert.match(period, /1 Oct 2026/);
  assert.match(period, /31 Oct 2026/);
  assert.ok(!period.includes('Nov'));
});
