import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardQuotePayload, buildVendorActionItems, buildVendorSalesMetrics, buildVendorWeeklySummary, formatRate, formatResponseTime, getDashboardFreshness, getVendorActivationPresentation } from '../src/pages/vendor/dashboardMetrics.js';

const now = new Date('2026-10-28T12:00:00.000Z');

test('activation presentation keeps unavailable data separate from a real incomplete profile', () => {
  assert.deepEqual(getVendorActivationPresentation(null), {
    available: false,
    completionPercentage: null,
    matchingEligible: false,
    activationState: null,
  });
  assert.equal(getVendorActivationPresentation({ completionPercentage: 100, matchingEligible: true }, true).available, false);
  assert.deepEqual(getVendorActivationPresentation({ completionPercentage: 0, activationState: 'DRAFT' }), {
    available: true,
    completionPercentage: 0,
    matchingEligible: false,
    activationState: 'DRAFT',
  });
  assert.equal(getVendorActivationPresentation({ completionPercentage: 100, isCommerciallyActive: true }).matchingEligible, true);
  assert.equal(getVendorActivationPresentation({ completionPercentage: null }).available, false);
});

test('dashboard freshness reports a missing snapshot and ages a successful snapshot', () => {
  assert.equal(getDashboardFreshness(null, now).state, 'unavailable');
  assert.equal(getDashboardFreshness(new Date(now.getTime() - 30_000), now).state, 'current');
  const stale = getDashboardFreshness(new Date(now.getTime() - 120_000), now);
  assert.equal(stale.state, 'stale');
  assert.match(stale.label, /data may be stale/);
});

test('dashboard quote payload preserves service identity and vendor-entered pricing', () => {
  const payload = buildDashboardQuotePayload({
    base: '12000', travel: '1500', total: '13500', status: 'DRAFT', notes: '  Includes setup  ',
  }, {
    opportunityId: 'opportunity-1', customerId: 'customer-1', serviceId: 'service-1',
    serviceName: 'Wedding Photography', title: 'Customer heading · Wedding', date: '2027-10-10',
    location: 'Pune', budgetNumber: 99999,
  });

  assert.equal(payload.serviceName, 'Wedding Photography');
  assert.deepEqual(payload.pricingBreakdown, { basePrice: 12000, travelFee: 1500, totalAmount: 13500 });
  assert.equal(payload.notes, 'Includes setup');
  assert.equal(payload.opportunityId, 'opportunity-1');
  assert.throws(() => buildDashboardQuotePayload({}, { title: 'Unlinked enquiry' }), /opportunity ID/);
});

test('action center prioritizes upcoming confirmed booking preparation and uses only supported live records', () => {
  const actions = buildVendorActionItems({
    today: '2026-10-28',
    bookings: [
      { id: 'cancelled', bookingStatus: 'CANCELLED', executionStatus: 'NOT_STARTED', eventDate: '2026-10-29' },
      { id: 'past', bookingStatus: 'CONFIRMED', executionStatus: 'NOT_STARTED', eventDate: '2026-10-27' },
      { id: 'prep', bookingStatus: 'CONFIRMED', executionStatus: 'SERVICE_SCHEDULED', eventDate: '2026-10-29', serviceName: 'Photography' },
    ],
    enquiries: [{ id: 'enq', status: 'NEW', title: 'Wedding enquiry' }],
    quotes: [{ _id: 'quote', status: 'DRAFT', type: 'Photo', client: 'Customer' }],
    reviews: [
      { _id: 'review', status: 'PUBLISHED', rating: 4, serviceName: 'Photography', vendorReply: { text: '' } },
      { _id: 'hidden-review', status: 'HIDDEN', rating: 5, vendorReply: { text: '' } },
      { _id: 'replied-review', status: 'PUBLISHED', rating: 3, vendorReply: { text: 'Thanks' } },
    ],
    messagesCount: 2,
    profileNeedsCompletion: true,
  });

  assert.equal(actions[0].key, 'booking-prep-prep');
  assert.equal(actions[0].state, 'Core status: CONFIRMED / SERVICE_SCHEDULED');
  assert.deepEqual(actions.map((action) => action.key), [
    'booking-prep-prep',
    'enquiry-enq',
    'unread-customer-messages',
    'quote-quote',
    'review-review',
    'profile-completion',
  ]);
  assert.ok(actions.every((action) => action.href && action.reason && action.state));
});

test('unread message actions link to the exact thread using summary fields only', () => {
  const actions = buildVendorActionItems({
    messageThreads: [{ threadId: 'thread/42', eventName: 'Customer event', eventDate: '2026-11-10', unreadCount: 2 }],
    messagesCount: 1,
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].href, '/vendor/updates?tab=messages&thread=thread%2F42');
  assert.equal(actions[0].title, 'Reply to a customer conversation');
  assert.equal(actions[0].detail, 'Customer event · 2026-11-10 · 2 unread');
});

test('active confirmed bookings get a neutral review action without asserting completion or lateness', () => {
  const actions = buildVendorActionItems({
    bookings: [
      { id: 'active', bookingStatus: 'CONFIRMED', executionStatus: 'SERVICE_STARTED', eventDate: '2026-11-10', serviceName: 'Photography' },
      { id: 'submitted', bookingStatus: 'CONFIRMED', executionStatus: 'COMPLETION_SUBMITTED', eventDate: '2026-11-10' },
      { id: 'cancelled', bookingStatus: 'CANCELLED', executionStatus: 'SERVICE_STARTED', eventDate: '2026-11-10' },
    ],
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].key, 'booking-active-active');
  assert.equal(actions[0].title, 'Review active booking');
  assert.equal(actions[0].state, 'Core status: CONFIRMED / SERVICE_STARTED');
  assert.match(actions[0].reason, /only after the service is complete/);
  assert.doesNotMatch(`${actions[0].title} ${actions[0].detail} ${actions[0].reason}`, /overdue|late|completed/i);
});

test('sales metrics use a matured, linked enquiry cohort and exclude duplicate quotes and unconfirmed bookings', () => {
  const result = buildVendorSalesMetrics({
    now,
    periodDays: 60,
    enquiries: [
      { id: 'a', createdAt: '2026-08-20T12:00:00.000Z', slaResponseTimeMs: 60000 },
      { id: 'b', createdAt: '2026-08-21T12:00:00.000Z', slaResponseTimeMs: 180000, status: 'DECLINED', declineReason: 'Unavailable on event date' },
      { id: 'new', createdAt: '2026-10-20T12:00:00.000Z' },
      { id: 'outside', createdAt: '2026-07-01T12:00:00.000Z' },
    ],
    quotes: [
      { opportunity: 'a', status: 'SUBMITTED', history: [{ toStatus: 'SUBMITTED', timestamp: '2026-08-22T12:00:00.000Z' }] },
      { opportunity: 'a', status: 'APPROVED', history: [{ toStatus: 'SUBMITTED', timestamp: '2026-08-22T12:00:00.000Z' }] },
      { opportunity: 'b', status: 'DRAFT', history: [] },
      { opportunity: 'b', status: 'REJECTED', history: [{ toStatus: 'SUBMITTED', timestamp: '2026-08-22T12:00:00.000Z' }, { toStatus: 'REJECTED', timestamp: '2026-08-25T12:00:00.000Z' }] },
      { opportunity: 'new', status: 'SUBMITTED', history: [{ toStatus: 'SUBMITTED', timestamp: '2026-10-21T12:00:00.000Z' }] },
      { opportunity: 'b', status: 'SUBMITTED', history: [] },
    ],
    bookings: [
      { opportunityId: 'a', createdAt: '2026-08-24T12:00:00.000Z', bookingStatus: 'CONFIRMED' },
      { opportunityId: 'b', createdAt: '2026-08-24T12:00:00.000Z', bookingStatus: 'CANCELLED' },
      { opportunityId: 'outside', createdAt: '2026-07-10T12:00:00.000Z', bookingStatus: 'CONFIRMED' },
    ],
  });

  assert.equal(result.eligibleEnquiries, 2);
  assert.equal(result.enquiriesWithSubmittedQuote, 2);
  assert.equal(result.confirmedBookings, 1);
  assert.equal(result.enquiryToQuoteRate, 1);
  assert.equal(result.enquiryToBookingRate, 0.5);
  assert.equal(result.averageQuoteTurnaroundMs, 36 * 60 * 60 * 1000);
  assert.equal(result.quoteTurnaroundSampleSize, 2);
  assert.equal(result.declinedWithRecordedReasonCount, 1);
  assert.deepEqual(result.declineReasonBreakdown, [{ reason: 'Unavailable on event date', count: 1 }]);
});

test('weekly summary compares equal elapsed UTC periods and counts submissions from transition history', () => {
  const result = buildVendorWeeklySummary({
    now: new Date('2026-10-29T12:00:00.000Z'),
    enquiries: [
      { createdAt: '2026-10-27T10:00:00.000Z' },
      { createdAt: '2026-10-20T10:00:00.000Z' },
    ],
    quotes: [
      { status: 'SUBMITTED', history: [{ toStatus: 'SUBMITTED', timestamp: '2026-10-28T12:00:00.000Z' }] },
      { status: 'REJECTED', history: [{ toStatus: 'SUBMITTED', timestamp: '2026-10-21T12:00:00.000Z' }] },
    ],
    bookings: [
      { bookingStatus: 'CONFIRMED', createdAt: '2026-10-28T10:00:00.000Z' },
      { bookingStatus: 'CANCELLED', createdAt: '2026-10-28T10:00:00.000Z' },
      { bookingStatus: 'CONFIRMED', createdAt: '2026-10-20T10:00:00.000Z' },
    ],
    reviews: [
      { status: 'PUBLISHED', createdAt: '2026-10-27T10:00:00.000Z' },
      { status: 'PENDING', createdAt: '2026-10-27T10:00:00.000Z' },
    ],
  });
  assert.equal(result.current.enquiries, 1);
  assert.equal(result.previous.enquiries, 1);
  assert.equal(result.current.submittedQuotes, 1);
  assert.equal(result.previous.submittedQuotes, 1);
  assert.equal(result.current.confirmedBookings, 1);
  assert.equal(result.previous.confirmedBookings, 1);
  assert.equal(result.current.publishedReviews, 1);
  assert.equal(result.previous.publishedReviews, 0);
  assert.equal(result.currentEnd, '2026-10-29T12:00:00.000Z');
  assert.equal(result.previousEnd, '2026-10-22T12:00:00.000Z');
});

test('zero eligible records and missing quote submission history are reported as insufficient data', () => {
  const result = buildVendorSalesMetrics({ now, enquiries: [], quotes: [], bookings: [] });
  assert.equal(result.eligibleEnquiries, 0);
  assert.equal(result.enquiryToBookingRate, null);
  assert.equal(result.averageQuoteTurnaroundMs, null);
  assert.equal(formatRate(result.enquiryToBookingRate), 'Insufficient data');
  assert.equal(formatResponseTime(result.averageFirstResponseMs), 'Insufficient data');
});
