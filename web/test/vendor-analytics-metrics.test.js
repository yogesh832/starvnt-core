import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVendorAnalyticsMetrics } from '../src/pages/vendor/analyticsMetrics.js';

test('analytics conversion counts distinct confirmed bookings linked to submitted quotes', () => {
  const metrics = buildVendorAnalyticsMetrics({
    enquiries: [{ _id: 'e1' }, { _id: 'e2' }, { _id: 'e3' }],
    quotes: [
      { _id: 'q1', opportunity: 'e1', status: 'APPROVED' },
      { _id: 'q2', opportunity: { _id: 'e2' }, status: 'SUBMITTED' },
      { _id: 'q3', status: 'DRAFT' },
    ],
    bookings: [
      { _id: 'b1', quoteId: 'q1', bookingStatus: 'CONFIRMED', paymentStatus: 'PAYMENT_VERIFIED', totalAmount: 10000, paymentSummary: { paidAmount: 1000 } },
      { _id: 'b2', quoteId: 'q1', bookingStatus: 'CONFIRMED', paymentStatus: 'PENDING', totalAmount: 10000, paymentSummary: { paidAmount: 9000 } },
      { _id: 'b3', quoteId: 'q2', bookingStatus: 'CANCELLED', paymentStatus: 'PAYMENT_VERIFIED', totalAmount: 50000, paymentSummary: { paidAmount: 50000 } },
      { _id: 'b4', quoteId: 'legacy-without-quote', bookingStatus: 'CONFIRMED', paymentStatus: 'PAYMENT_VERIFIED', totalAmount: 2000, paymentSummary: { paidAmount: 200 } },
    ],
  });

  assert.deepEqual(metrics, {
    enquiriesCount: 3,
    quotedEnquiriesCount: 2,
    quotesCount: 2,
    bookingsCount: 3,
    linkedBookingsCount: 1,
    confirmedBookingValue: 12000,
    verifiedAdvanceReceived: 1200,
  });
});

test('analytics reports no quote conversion when there are only drafts or unrelated bookings', () => {
  const metrics = buildVendorAnalyticsMetrics({
    enquiries: [{ _id: 'e1' }],
    quotes: [{ _id: 'q1', status: 'DRAFT' }],
    bookings: [{ quoteId: 'q2', bookingStatus: 'CONFIRMED' }],
  });

  assert.deepEqual(metrics, {
    enquiriesCount: 1,
    quotedEnquiriesCount: 0,
    quotesCount: 0,
    bookingsCount: 1,
    linkedBookingsCount: 0,
    confirmedBookingValue: 0,
    verifiedAdvanceReceived: 0,
  });
});
