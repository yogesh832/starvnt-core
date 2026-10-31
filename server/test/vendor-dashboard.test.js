import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardPeriods, salesMetrics, financeMetrics, buildDashboard } from '../src/external/services/vendorDashboard.service.js';
import { firstVendorResponse } from '../src/external/services/vendorFirstResponseMetrics.service.js';

const now = new Date('2026-10-31T10:00:00Z');
const start = new Date('2026-09-01T00:00:00Z');
const end = new Date('2026-10-01T00:00:00Z');
const opportunity = { _id: 'e1', createdAt: '2026-09-02T00:00:00Z', status: 'NEW', slaResponseTimeMs: null };
const quote = { _id: 'q1', opportunity: 'e1', status: 'APPROVED', history: [{ toStatus: 'SUBMITTED', timestamp: '2026-09-03T00:00:00Z' }, { toStatus: 'APPROVED', timestamp: '2026-09-04T00:00:00Z' }] };
const booking = { _id: 'b1', quoteId: 'q1', createdAt: '2026-09-05T00:00:00Z', bookingStatus: 'CONFIRMED', totalAmount: 1000, paymentStatus: 'PAYMENT_VERIFIED', paymentSummary: { paidAmount: 300, providerPaymentId: 'p1' }, taxSummary: { invoiceNumber: 'i1', vendorPayable: 850 }, settlementStatus: 'SETTLEMENT_ELIGIBLE' };
const data = () => ({ opportunities: [opportunity], quotes: [quote], bookings: [booking], threads: [], reviews: [], ledger: [], readiness: null, states: Object.fromEntries(['opportunities', 'quotes', 'bookings', 'threads', 'reviews', 'ledger', 'readiness'].map(key => [key, 'AVAILABLE'])) });

test('periods use IST midnight and two equivalent completed Monday–Sunday weeks across UTC day boundary', () => {
  const result = dashboardPeriods(new Date('2026-11-01T19:00:00Z'), 7); // Monday 00:30 IST
  assert.equal(result.selected.end.toISOString(), '2026-11-01T18:30:00.000Z');
  assert.equal(result.week.end.toISOString(), '2026-11-01T18:30:00.000Z');
  assert.equal(result.week.start.toISOString(), '2026-10-25T18:30:00.000Z');
  assert.equal(result.previousWeek.end.getTime(), result.week.start.getTime());
  assert.equal(result.cohort.end.getTime() + 30 * 86400000, result.selected.end.getTime());
});

test('conversion deduplicates enquiries across quotes and contracts, excludes cancellations and late attribution', () => {
  const result = salesMetrics({ opportunities: [opportunity, { ...opportunity, _id: 'e2' }, { ...opportunity, _id: 'e3' }], quotes: [quote, { ...quote, _id: 'q2' }], bookings: [booking, { ...booking, _id: 'b2', quoteId: 'q2' }, { ...booking, _id: 'b3', quoteId: null, opportunityId: 'e2', bookingStatus: 'CANCELLED' }, { ...booking, _id: 'b4', quoteId: null, opportunityId: 'e3', createdAt: '2026-10-03T00:00:00Z' }], start, end, now });
  assert.equal(result.enquiries, 3);
  assert.equal(result.quotedEnquiries, 1);
  assert.equal(result.acceptedEnquiries, 1);
  assert.equal(result.convertedEnquiries, 1);
  assert.equal(result.conversionPercent, 33.33);
  assert.equal(result.averageFirstResponseMs, 86400000);
});

test('null response duration is not zero; responses beyond the attribution window and before enquiry are excluded', () => {
  assert.deepEqual(firstVendorResponse({ opportunities: [opportunity], quotes: [], threads: [], now }), []);
  const samples = firstVendorResponse({ opportunities: [opportunity], quotes: [], threads: [{ opportunity: 'e1', messages: [{ sender: 'VENDOR', createdAt: '2026-09-01' }, { sender: 'VENDOR', createdAt: '2026-10-03' }] }], now, attributionWindowDays: 30 });
  assert.deepEqual(samples, []);
});

test('empty and incomplete cohorts never publish fabricated zero conversion or response averages', () => {
  const empty = salesMetrics({ opportunities: [], quotes: [], bookings: [], start, end, now });
  assert.equal(empty.enquiries, 0);
  assert.equal(empty.conversionPercent, null);
  assert.equal(empty.averageFirstResponseMs, null);
  const immature = salesMetrics({ opportunities: [opportunity], quotes: [quote], bookings: [booking], start, end, now: new Date('2026-10-02') });
  assert.equal(immature.conversionPercent, null);
  assert.equal(salesMetrics({ complete: false }).available, false);
});

test('financial reconciliation keeps gross, contracted, verified payment, outstanding and ledger releases distinct', () => {
  const ledger = [{ booking: 'b1', type: 'SETTLEMENT_RELEASE', amount: 850, currency: 'INR', postedAt: '2026-09-10' }];
  const result = financeMetrics([booking, { ...booking, _id: 'duplicate' }], ledger, { start, end });
  assert.equal(result.bookingValue, 1000);
  assert.equal(result.contractedAmount, 850);
  assert.equal(result.verifiedPayments, 300);
  assert.equal(result.outstanding, 700);
  assert.equal(result.settlementEligible, 850);
  assert.equal(result.settlementReleased, 850);
  assert.equal(result.settlementInitiated, null);
  assert.equal(result.profit, null);
});

test('refunds, missing invoice snapshots, conflicting duplicates and repeated gateway IDs fail closed', () => {
  assert.equal(financeMetrics([{ ...booking, taxSummary: {} }], [], { start, end }).contractedAmount, null);
  assert.equal(financeMetrics([booking, { ...booking, _id: 'duplicate', totalAmount: 2000 }], [], { start, end }).bookingValue, null);
  assert.equal(financeMetrics([booking, { ...booking, _id: 'b2', quoteId: 'q2' }], [], { start, end }).verifiedPayments, null);
  assert.equal(financeMetrics([{ ...booking, paymentStatus: 'REFUNDED' }], [], { start, end }).outstanding, null);
  const ledger = [{ booking: 'b1', type: 'REFUND', amount: 100, currency: 'INR', postedAt: '2026-09-10' }];
  assert.equal(financeMetrics([booking], ledger, { start, end }).outstanding, null);
  assert.equal(financeMetrics([booking], [], { start, end, ledgerComplete: false }).outstanding, null);
  assert.equal(financeMetrics([], [{ ...ledger[0], currency: 'USD' }], { start, end }).refunds, null);
});

test('actions use saved deadlines, prioritize overdue SLAs, deduplicate enquiry/quote/thread and avoid invented failures', () => {
  const fixture = data();
  fixture.opportunities = [{ ...opportunity, slaExpiresAt: '2026-10-30T10:00:00Z' }];
  fixture.quotes = [{ ...quote, status: 'DRAFT' }];
  fixture.threads = [{ _id: 't1', opportunity: 'e1', status: 'ACTIVE', unreadVendorCount: 1 }];
  const result = buildDashboard(fixture, { now });
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].priority, 1);
  assert.equal(result.actions[0].dueAt.toISOString(), '2026-10-30T10:00:00.000Z');
  assert.equal(result.actions[0].href, '/vendor/enquiries?record=e1');
  assert.equal(result.quality.rating, null);
  assert.equal(result.quality.reviewCount, 0);
  assert.equal(result.quality.onTimeRate, null);
  assert.deepEqual(result.recommendations, []);
});

test('failed sources are unavailable, independent sections survive, and unsafe weekly comparisons are suppressed', () => {
  const fixture = data();
  fixture.states.opportunities = 'UNAVAILABLE';
  const result = buildDashboard(fixture, { now });
  assert.equal(result.snapshot.actionableEnquiries, null);
  assert.equal(result.sales.available, false);
  assert.equal(result.weekly.current.available, false);
  assert.equal(result.financial.available, true);
  assert.equal(result.quality.reviewCount, 0);
  assert.ok(!result.actions.some(row => row.module === 'enquiries'));
});
