import express from 'express';
import { requireAdminAuth, requirePermission } from '../middleware/requireAdminAuth.js';
import { CoreBooking } from '../models/CoreBooking.js';
import { FinanceLedgerEntry } from '../models/FinanceLedgerEntry.js';
import { Payment } from '../../customer/models/index.js';
import {
  verifyPaymentFromCore,
  validateCompletionFromCore,
  settleBooking,
  handleVendorFailureAndDiscoverAlternatives,
} from '../services/executionSettlement.service.js';

const router = express.Router();

function requireAnyPermission(...allowed) {
  return (req, res, next) => {
    const admin = req.admin;
    if (!admin) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    if (admin.role === 'SUPER_ADMIN') return next();
    if (allowed.some((permission) => admin.permissions.includes(permission))) return next();
    return res.status(403).json({ error: 'FORBIDDEN', requiredAnyOf: allowed });
  };
}

function escapeRegex(text = '') {
  return String(text).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

// Require admin authentication for all Core Operations routes
router.use(requireAdminAuth);

/**
 * List authoritative Core bookings with multi-field search, vendor filtering,
 * category, city, and status tabs.
 */
router.get('/bookings', requirePermission('operations.read'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const skip = parseInt(req.query.skip) || 0;
    const filter = {};

    // Tab filter
    const tab = req.query.tab || req.query.status;
    if (tab && tab !== 'All') {
      const lower = tab.toLowerCase();
      if (lower === 'pending') {
        filter.$or = [{ paymentStatus: 'PENDING' }, { bookingStatus: 'PENDING' }];
      } else if (lower === 'confirmed') {
        filter.bookingStatus = 'CONFIRMED';
      } else if (lower === 'in progress' || lower === 'in_progress') {
        filter.executionStatus = { $in: ['SERVICE_SCHEDULED', 'SERVICE_STARTED', 'COMPLETION_SUBMITTED'] };
      } else if (lower === 'completed') {
        filter.$or = [{ executionStatus: 'COMPLETION_VERIFIED' }, { settlementStatus: 'SETTLED' }];
      } else if (lower === 'disputed' || lower === 'issues') {
        filter.$or = [
          { 'disputes.0': { $exists: true } },
          { bookingStatus: 'FAILED' },
        ];
      } else {
        filter.bookingStatus = tab;
      }
    }

    // Specific status overrides
    if (req.query.bookingStatus && req.query.bookingStatus !== 'All') filter.bookingStatus = req.query.bookingStatus;
    if (req.query.paymentStatus && req.query.paymentStatus !== 'All') filter.paymentStatus = req.query.paymentStatus;
    if (req.query.executionStatus && req.query.executionStatus !== 'All') filter.executionStatus = req.query.executionStatus;
    if (req.query.settlementStatus && req.query.settlementStatus !== 'All') filter.settlementStatus = req.query.settlementStatus;

    // Vendor filter (by ID or exact name)
    if (req.query.vendorId && req.query.vendorId !== 'All') {
      filter.vendorId = req.query.vendorId;
    } else if (req.query.vendorName && req.query.vendorName !== 'All') {
      filter.vendorName = req.query.vendorName;
    }

    // Category filter
    if (req.query.category && req.query.category !== 'All') {
      filter.category = req.query.category;
    }

    // City filter
    if (req.query.city && req.query.city !== 'All') {
      filter['serviceLocation.city'] = { $regex: new RegExp(`^${escapeRegex(req.query.city)}$`, 'i') };
    }

    // Global Search across bookingReference, serviceName, vendorName, customerName, location, category
    if (req.query.search && req.query.search.trim()) {
      const term = escapeRegex(req.query.search.trim());
      const regex = { $regex: term, $options: 'i' };
      const searchConditions = [
        { bookingReference: regex },
        { serviceName: regex },
        { vendorName: regex },
        { customerName: regex },
        { category: regex },
        { 'serviceLocation.city': regex },
        { 'serviceLocation.locality': regex },
        { 'serviceLocation.address': regex },
      ];

      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }

    const [bookings, total, distinctVendors, distinctCategories, distinctCities, statsAgg] = await Promise.all([
      CoreBooking.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CoreBooking.countDocuments(filter),
      CoreBooking.aggregate([
        { $group: { _id: '$vendorId', name: { $first: '$vendorName' }, count: { $sum: 1 } } },
        { $sort: { name: 1 } },
      ]),
      CoreBooking.distinct('category'),
      CoreBooking.distinct('serviceLocation.city'),
      CoreBooking.aggregate([
        {
          $group: {
            _id: null,
            totalGmv: { $sum: '$totalAmount' },
            totalBookings: { $sum: 1 },
            inProgressCount: {
              $sum: {
                $cond: [
                  { $in: ['$executionStatus', ['SERVICE_SCHEDULED', 'SERVICE_STARTED', 'COMPLETION_SUBMITTED']] },
                  1,
                  0,
                ],
              },
            },
            completedCount: {
              $sum: {
                $cond: [
                  { $or: [{ $eq: ['$executionStatus', 'COMPLETION_VERIFIED'] }, { $eq: ['$settlementStatus', 'SETTLED'] }] },
                  1,
                  0,
                ],
              },
            },
            pendingPaymentCount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'PENDING'] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const stats = statsAgg[0] || {
      totalGmv: 0,
      totalBookings: 0,
      inProgressCount: 0,
      completedCount: 0,
      pendingPaymentCount: 0,
    };

    res.json({
      ok: true,
      total,
      count: bookings.length,
      bookings,
      vendorsList: distinctVendors.map((v) => ({ id: v._id, name: v.name || 'Unnamed Vendor', count: v.count })),
      categoriesList: distinctCategories.filter(Boolean),
      citiesList: distinctCities.filter(Boolean),
      stats,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Get booking details.
 */
router.get('/bookings/:id', requirePermission('operations.read'), async (req, res, next) => {
  try {
    const booking = await CoreBooking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: 'BOOKING_NOT_FOUND' });
    }
    res.json({ ok: true, booking });
  } catch (err) {
    next(err);
  }
});

/**
 * Authoritative Payments & Settlements summary.
 *
 * Keeps booking GMV, collected customer payments, platform ledger entries,
 * refunds and vendor settlement releases separate for reconciliation.
 */
router.get('/finance-summary', requireAnyPermission('payments.read', 'settlements.read'), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = parseInt(req.query.skip) || 0;
    const tab = String(req.query.tab || 'Customer Payments').toLowerCase();

    const [
      customerPaymentAgg,
      heldAgg,
      settlementAgg,
      refundAgg,
      gmvAgg,
    ] = await Promise.all([
      Payment.aggregate([
        { $match: { status: 'verified' } },
        { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      CoreBooking.aggregate([
        {
          $match: {
            paymentStatus: 'PAYMENT_VERIFIED',
            settlementStatus: { $ne: 'SETTLED' },
            bookingStatus: 'CONFIRMED',
          },
        },
        {
          $group: {
            _id: null,
            amount: { $sum: '$paymentSummary.paidAmount' },
            count: { $sum: 1 },
          },
        },
      ]),
      FinanceLedgerEntry.aggregate([
        { $match: { type: 'SETTLEMENT_RELEASE' } },
        { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      FinanceLedgerEntry.aggregate([
        { $match: { type: 'REFUND' } },
        { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      CoreBooking.aggregate([
        { $match: { bookingStatus: 'CONFIRMED' } },
        { $group: { _id: null, amount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
    ]);

    let rows = [];
    let total = 0;
    if (tab.includes('settlement')) {
      [rows, total] = await Promise.all([
        FinanceLedgerEntry.find({ type: 'SETTLEMENT_RELEASE' }).sort({ postedAt: -1 }).skip(skip).limit(limit).lean(),
        FinanceLedgerEntry.countDocuments({ type: 'SETTLEMENT_RELEASE' }),
      ]);
      rows = rows.map((row) => ({
        id: String(row._id),
        kind: 'Vendor Settlement',
        reference: row.reference || row.idempotencyKey,
        bookingId: row.booking ? String(row.booking) : '',
        party: row.vendorId ? String(row.vendorId) : 'Vendor',
        amount: money(row.amount),
        currency: row.currency || 'INR',
        status: 'POSTED',
        date: row.postedAt || row.createdAt,
      }));
    } else if (tab.includes('refund')) {
      [rows, total] = await Promise.all([
        FinanceLedgerEntry.find({ type: 'REFUND' }).sort({ postedAt: -1 }).skip(skip).limit(limit).lean(),
        FinanceLedgerEntry.countDocuments({ type: 'REFUND' }),
      ]);
      rows = rows.map((row) => ({
        id: String(row._id),
        kind: 'Refund',
        reference: row.reference || row.idempotencyKey,
        bookingId: row.booking ? String(row.booking) : '',
        party: row.customerId ? String(row.customerId) : 'Customer',
        amount: money(row.amount),
        currency: row.currency || 'INR',
        status: 'POSTED',
        date: row.postedAt || row.createdAt,
      }));
    } else {
      [rows, total] = await Promise.all([
        Payment.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Payment.countDocuments(),
      ]);
      rows = rows.map((row) => ({
        id: String(row._id),
        kind: 'Customer Payment',
        reference: row.providerPaymentId || row.providerOrderId || row.providerRef || String(row._id),
        bookingId: row.reservation ? String(row.reservation) : '',
        party: row.customer ? String(row.customer) : 'Customer',
        amount: money(row.amount),
        currency: row.currency || 'INR',
        status: row.status || 'pending',
        date: row.verifiedAt || row.createdAt,
      }));
    }

    res.json({
      ok: true,
      total,
      count: rows.length,
      rows,
      stats: {
        totalCollected: money(customerPaymentAgg[0]?.amount),
        totalCollectedCount: customerPaymentAgg[0]?.count || 0,
        heldBalance: money(heldAgg[0]?.amount),
        heldBookingCount: heldAgg[0]?.count || 0,
        releasedToVendors: money(settlementAgg[0]?.amount),
        releasedSettlementCount: settlementAgg[0]?.count || 0,
        refunds: money(refundAgg[0]?.amount),
        refundCount: refundAgg[0]?.count || 0,
        bookingGmv: money(gmvAgg[0]?.amount),
        bookingCount: gmvAgg[0]?.count || 0,
      },
      definitions: {
        totalCollected: 'Sum of customer payment records with status=verified.',
        heldBalance: 'Sum of paid advance amounts on confirmed Core bookings whose payment is verified and settlement is not settled.',
        releasedToVendors: 'Sum of FinanceLedgerEntry records with type=SETTLEMENT_RELEASE.',
        refunds: 'Sum of FinanceLedgerEntry records with type=REFUND.',
        bookingGmv: 'Sum of totalAmount on confirmed Core bookings; not equivalent to collected cash.',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Authoritative Payment Verification from Core (Golden Test I).
 */
router.post('/bookings/:id/verify-payment', requirePermission('payments.approve'), async (req, res) => {
  try {
    const coreActor = req.admin ? req.admin.email : 'CORE_ADMIN';
    const booking = await verifyPaymentFromCore(
      req.params.id,
      { ...(req.body || {}), traceContext: { requestId: req.requestId } },
      coreActor
    );
    res.json({ ok: true, booking });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'PAYMENT_VERIFICATION_ERROR', message: err.message });
  }
});

/**
 * Authoritative Completion Validation from Core (Golden Test K).
 */
router.post(['/bookings/:id/validate-completion', '/bookings/:id/verify-completion'], requirePermission('operations.manage'), async (req, res) => {
  try {
    const coreActor = req.admin ? req.admin.email : 'CORE_ADMIN';
    const { approved = true, notes } = req.body || {};
    const booking = await validateCompletionFromCore(req.params.id, { approved, notes }, coreActor);
    res.json({ ok: true, booking });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'VALIDATION_ERROR', message: err.message });
  }
});

/**
 * Authoritative Settlement Execution from Core (Golden Test K).
 */
router.post('/bookings/:id/settle', requirePermission('settlements.release'), async (req, res) => {
  try {
    const coreActor = req.admin ? req.admin.email : 'CORE_FINANCE';
    const booking = await settleBooking(req.params.id, req.body, coreActor);
    res.json({ ok: true, booking });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'SETTLEMENT_ERROR', message: err.message });
  }
});

/**
 * Handle vendor failure and discover alternatives on the same requirement/location (Golden Test L).
 */
router.post('/bookings/:id/fail-and-reassign', requirePermission('operations.manage'), async (req, res) => {
  try {
    const { reason, failedBy } = req.body || {};
    const result = await handleVendorFailureAndDiscoverAlternatives(req.params.id, {
      reason,
      failedBy: failedBy || req.admin?.email || 'CORE_OPS',
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'FAILURE_HANDLING_ERROR', message: err.message });
  }
});

export default router;
