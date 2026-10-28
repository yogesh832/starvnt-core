import { productMetrics } from '../services/productMetrics.js';
import express from 'express';
import { requireAdminAuth, requireAnyPermission } from '../middleware/requireAdminAuth.js';
import { CoreBooking } from '../models/CoreBooking.js';
import { FinanceLedgerEntry } from '../models/FinanceLedgerEntry.js';
import { ExternalUser } from '../../external/models/ExternalUser.js';
import { VendorReview } from '../../external/models/VendorReview.js';

const router = express.Router();

router.use(requireAdminAuth);
router.get('/product-metrics', requireAnyPermission('analytics.read', 'reports.read'), async (req, res, next) => { try { res.json({ ok: true, metrics: await productMetrics() }); } catch (err) { next(err); } });

router.get('/financial-summary', requireAnyPermission('revenue.read', 'reports.read'), async (req, res, next) => {
  try {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    const [period, lifetime] = await Promise.all([
      FinanceLedgerEntry.aggregate([
        { $match: { type: 'SETTLEMENT_RELEASE', postedAt: { $gte: from, $lte: now } } },
        { $group: { _id: null, platformFees: { $sum: '$tax.platformFee' }, vendorPayable: { $sum: '$tax.vendorPayable' }, tax: { $sum: '$tax.gstAmount' }, count: { $sum: 1 } } },
      ]),
      FinanceLedgerEntry.aggregate([
        { $match: { type: 'SETTLEMENT_RELEASE' } },
        { $group: { _id: null, platformFees: { $sum: '$tax.platformFee' }, vendorPayable: { $sum: '$tax.vendorPayable' }, tax: { $sum: '$tax.gstAmount' }, count: { $sum: 1 } } },
      ]),
    ]);
    res.json({ ok: true, period: { from, to: now, label: 'Last 30 days' }, current: period[0] || { platformFees: 0, vendorPayable: 0, tax: 0, count: 0 }, lifetime: lifetime[0] || { platformFees: 0, vendorPayable: 0, tax: 0, count: 0 } });
  } catch (err) { next(err); }
});

async function buildSummary() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 30);

  const [newCustomers, bookings, revenueAgg, ratingAgg] = await Promise.all([
    ExternalUser.countDocuments({
      $or: [{ roles: 'CUSTOMER' }, { accountType: 'CUSTOMER' }],
      createdAt: { $gte: from, $lte: now },
    }),
    CoreBooking.countDocuments({ createdAt: { $gte: from, $lte: now } }),
    FinanceLedgerEntry.aggregate([
      { $match: { type: 'SETTLEMENT_RELEASE', postedAt: { $gte: from, $lte: now } } },
      { $group: { _id: null, amount: { $sum: '$tax.platformFee' }, count: { $sum: 1 } } },
    ]),
    VendorReview.aggregate([
      { $match: { createdAt: { $gte: from, $lte: now } } },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]).catch(() => []),
  ]);

  const ratingCount = ratingAgg[0]?.count || 0;
  return {
    period: {
      label: 'Last 30 Days',
      from,
      to: now,
      timezone: 'Asia/Kolkata',
    },
    metrics: {
      newCustomers,
      bookings,
      revenue: Math.round(Number(revenueAgg[0]?.amount || 0)),
      revenueEntries: revenueAgg[0]?.count || 0,
      averageRating: ratingCount ? Number(ratingAgg[0].average || 0) : null,
      ratingCount,
    },
    rows: [
      { report: 'Customer Growth', period: 'Last 30 Days', generatedAt: now, status: 'Ready', value: newCustomers },
      { report: 'Booking Summary', period: 'Last 30 Days', generatedAt: now, status: 'Ready', value: bookings },
      { report: 'Revenue Summary', period: 'Last 30 Days', generatedAt: now, status: 'Ready', value: Math.round(Number(revenueAgg[0]?.amount || 0)) },
      { report: 'Ratings Summary', period: 'Last 30 Days', generatedAt: now, status: ratingCount ? 'Ready' : 'No reviews yet', value: ratingCount ? Number(ratingAgg[0].average || 0).toFixed(2) : 'No reviews yet' },
    ],
    definitions: {
      newCustomers: 'External users with customer role/accountType created within the selected period.',
      bookings: 'Core bookings created within the selected period; not equivalent to payment collections.',
      revenue: 'Platform fee portion from settlement-release ledger entries in the selected period.',
      averageRating: 'Average vendor review rating in the selected period; null means no eligible reviews.',
    },
  };
}

function csvEscape(value) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

router.get('/summary', requireAnyPermission('analytics.read', 'reports.read'), async (req, res, next) => {
  try {
    const summary = await buildSummary();
    res.json({
      ok: true,
      ...summary,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/summary/export.csv', requireAnyPermission('analytics.read', 'reports.read'), async (req, res, next) => {
  try {
    const summary = await buildSummary();
    const lines = [
      ['Report', 'Period', 'Generated At', 'Timezone', 'Status', 'Value'].map(csvEscape).join(','),
      ...summary.rows.map((row) =>
        [row.report, row.period, row.generatedAt, summary.period.timezone, row.status, row.value].map(csvEscape).join(',')
      ),
      '',
      ['Definition', 'Meaning'].map(csvEscape).join(','),
      ...Object.entries(summary.definitions).map(([key, value]) => [key, value].map(csvEscape).join(',')),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="starvnt-report-summary.csv"');
    res.send(`${lines.join('\n')}\n`);
  } catch (err) {
    next(err);
  }
});

export default router;
