import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardSnapshot, dashboardWidgetMessage, isVendorDashboard } from '../../shared/vendorDashboardFreshness.js';

const loaded = (at = '2026-11-18T10:00:00Z') => ({ generatedAt: at, periods: { selected: { start: '2026-10-19', end: '2026-11-18' } }, sourceStates: Object.fromEntries(['opportunities', 'quotes', 'bookings', 'threads', 'ledger', 'reviews', 'readiness'].map(key => [key, 'AVAILABLE'])), actions: [], snapshot: { actionableEnquiries: 0 }, upcomingBookings: [], sales: { available: true, enquiries: 2 }, financial: { bookingValue: 1000 }, quality: { reviewCount: 0 }, readiness: { matchingEligible: true }, weekly: { current: { enquiries: 0 } }, recommendations: [] });

test('an HTTP success with malformed dashboard data is not accepted as a loaded or empty dashboard', () => {
  assert.equal(isVendorDashboard({ generatedAt: new Date().toISOString(), sourceStates: {}, snapshot: {} }), false);
  assert.equal(isVendorDashboard({}), false);
  const complete = loaded();
  complete.periods.cohort = { ...complete.periods.selected }; complete.periods.week = { ...complete.periods.selected }; complete.periods.previousWeek = { ...complete.periods.selected };
  complete.quality.recent = []; complete.weekly.previous = {};
  assert.equal(isVendorDashboard(complete), true);
  const badPeriod = structuredClone(complete); badPeriod.periods.week.end = 'invalid';
  assert.equal(isVendorDashboard(badPeriod), false);
  complete.sourceStates.quotes = 'UNKNOWN_SUCCESS';
  assert.equal(isVendorDashboard(complete), false);
});

test('widget failures keep marked prior read-only values without replacing current readiness or empty successful results', () => {
  const first = dashboardSnapshot(null, loaded(), 'owner-a:30');
  const failure = loaded('2026-11-18T11:00:00Z');
  failure.sourceStates.opportunities = 'UNAVAILABLE'; failure.sourceStates.readiness = 'UNAVAILABLE';
  failure.sales = { available: false }; failure.readiness = null;
  const second = dashboardSnapshot(first, failure, 'owner-a:30');
  assert.equal(second.widgets.sales.status, 'STALE'); assert.equal(second.view.sales.enquiries, 2);
  assert.equal(second.widgets.sales.lastSuccessfulSync, first.dashboard.generatedAt);
  assert.equal(second.view.readiness, null); assert.equal(second.widgets.readiness.status, 'UNAVAILABLE');
  assert.equal(second.widgets.quality.status, 'READY'); assert.equal(second.view.quality.reviewCount, 0);
  assert.equal(second.widgets.quality.lastSuccessfulSync, failure.generatedAt);
  assert.equal(failure.sales.available, false); // The source response was not mutated.
  assert.match(dashboardWidgetMessage(second.widgets.sales), /Saved data/);
  assert.equal(second.widgets.snapshot.status, 'PARTIAL');
});

test('widget history cannot cross account, period or record-limit boundaries and recovery replaces stale data', () => {
  const first = dashboardSnapshot(null, loaded(), 'owner-a:30');
  const failed = loaded(); failed.sourceStates.quotes = 'UNAVAILABLE'; failed.sales = { available: false };
  assert.equal(dashboardSnapshot(first, failed, 'owner-b:30').widgets.sales.lastSuccessfulSync, null);
  const differentPeriod = structuredClone(failed); differentPeriod.periods.selected.end = '2026-11-19';
  assert.equal(dashboardSnapshot(first, differentPeriod, 'owner-a:30').widgets.sales.lastSuccessfulSync, null);
  failed.sourceStates.bookings = 'INSUFFICIENT_DATA';
  assert.equal(dashboardSnapshot(first, failed, 'owner-a:30').widgets.sales.status, 'UNAVAILABLE');
  assert.equal(dashboardSnapshot(first, failed, 'owner-a:30').view.sales.available, false);
  const recovered = loaded('2026-11-18T12:00:00Z'); recovered.sales.enquiries = 0;
  const latest = dashboardSnapshot(first, recovered, 'owner-a:30');
  assert.equal(latest.widgets.sales.status, 'READY'); assert.equal(latest.view.sales.enquiries, 0);
  assert.equal(latest.widgets.sales.lastSuccessfulSync, recovered.generatedAt);
});
