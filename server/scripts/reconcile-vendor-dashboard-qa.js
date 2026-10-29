import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const qaEnv = dotenv.parse(readFileSync(new URL('../.env.test.local', import.meta.url)));
for (const [key, database] of [
  ['MONGO_URI_EXTERNAL', 'starvnt_test_external'],
  ['MONGO_URI_ADMIN', 'starvnt_test_admin'],
]) {
  assert.equal(new URL(qaEnv[key]).pathname, `/${database}`, 'Reconciliation is restricted to the dedicated QA databases.');
}

Object.assign(process.env, qaEnv, { NODE_ENV: 'test' });
process.env.STARVNT_ENV_FILE = new URL('../.env.test.local', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');

const { config } = await import('../src/config.js');
assert.equal(new URL(config.mongoUriExternal).pathname, '/starvnt_test_external');
assert.equal(new URL(config.mongoUriAdmin).pathname, '/starvnt_test_admin');

const [{ connectDB, disconnectDB, externalConn, adminConn }, { ExternalUser }, { Opportunity }, { Quote }, { VendorReview }, { CoreBooking }, { buildVendorAnalyticsMetrics }] = await Promise.all([
  import('../src/db/index.js'),
  import('../src/external/models/ExternalUser.js'),
  import('../src/external/models/Opportunity.js'),
  import('../src/external/models/Quote.js'),
  import('../src/external/models/VendorReview.js'),
  import('../src/admin/models/CoreBooking.js'),
  import('../../web/src/pages/vendor/analyticsMetrics.js'),
]);

try {
  await connectDB();
  assert.equal(externalConn.name, 'starvnt_test_external');
  assert.equal(adminConn.name, 'starvnt_test_admin');
  const user = await ExternalUser.findOne({ email: 'vendor@starvnt.com' }).select('vendorOrganization').lean();
  assert.ok(user?.vendorOrganization, 'The seeded QA vendor account is required.');
  const vendorId = user.vendorOrganization;
  const [enquiries, quotes, bookings, reviews] = await Promise.all([
    Opportunity.find({ vendor: vendorId }).select('_id createdAt status').lean(),
    Quote.find({ vendor: vendorId }).select('_id opportunity status createdAt').lean(),
    CoreBooking.find({ vendorId, bookingStatus: 'CONFIRMED' }).select('_id quoteId bookingStatus paymentStatus paymentSummary totalAmount').lean(),
    VendorReview.find({ vendor: vendorId, status: 'PUBLISHED', isVerified: true }).select('rating').lean(),
  ]);
  const metrics = buildVendorAnalyticsMetrics({ enquiries, quotes, bookings });
  const ratingTotal = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
  const report = {
    scope: 'TEST DATABASE ONLY',
    vendorReference: 'dedicated seeded QA vendor',
    metricPeriod: 'all-time QA fixture snapshot',
    sources: {
      vendorOwnedEnquiries: enquiries.length,
      quoteRecords: quotes.length,
      nonDraftQuotes: metrics.quotesCount,
      coreConfirmedBookings: bookings.length,
      publishedVerifiedReviews: reviews.length,
    },
    reconciledValues: {
      enquiriesWithQuotes: metrics.quotedEnquiriesCount,
      enquiryToQuoteRatePercent: metrics.enquiriesCount ? Math.round(metrics.quotedEnquiriesCount / metrics.enquiriesCount * 100) : null,
      confirmedBookingsLinkedToQuotes: metrics.linkedBookingsCount,
      quoteToBookingRatePercent: metrics.quotesCount ? Math.round(metrics.linkedBookingsCount / metrics.quotesCount * 100) : null,
      distinctConfirmedBookingValue: metrics.confirmedBookingValue,
      verifiedAdvanceReceived: metrics.verifiedAdvanceReceived,
      verifiedReviewAverage: reviews.length ? Math.round(ratingTotal / reviews.length * 100) / 100 : null,
    },
    exclusions: [
      'Draft quotes are excluded from conversion denominators.',
      'Cancelled or failed bookings are excluded.',
      'Repeated confirmed records with the same quote ID count once toward booking value and verified advances.',
      'Bookings without a quote link are excluded from quote conversion but remain included in confirmed booking counts and totals.',
      'No customer names, contact details, record IDs, or payment credentials are included.',
    ],
  };
  const outputPath = resolve(fileURLToPath(new URL('../../tmp/qa/vendor-dashboard-reconciliation.json', import.meta.url)));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, artifact: outputPath }, null, 2));
} finally {
  await disconnectDB();
}
