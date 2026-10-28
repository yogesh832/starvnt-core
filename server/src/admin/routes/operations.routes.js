import express from 'express';
import { requireAdminAuth, requirePermission } from '../middleware/requireAdminAuth.js';
import { CoreBooking } from '../models/CoreBooking.js';
import { FinanceLedgerEntry } from '../models/FinanceLedgerEntry.js';
import { AdminApprovalRequest } from '../models/AdminApprovalRequest.js';
import { Payment } from '../../customer/models/index.js';
import { recordRefund } from '../services/financeLedger.service.js';
import { calculateEligibleAdvanceRefund } from '../../common/policyResolver.js';
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

function approvalSummary(row) {
  if (!row) return null;
  return {
    id: String(row._id),
    type: row.type,
    targetType: row.targetType,
    targetId: row.targetId,
    status: row.status,
    requestedByEmail: row.requestedByEmail,
    approvedByEmail: row.approvedByEmail,
    reason: row.reason,
    payload: row.payload,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
  };
}

function adminCanApproveRequest(admin, approval) {
  if (admin?.role === 'SUPER_ADMIN') return true;
  const needed = approval?.type === 'REFUND' ? 'payments.refund' : 'settlements.approve';
  return admin?.permissions?.includes(needed);
}

// Require admin authentication for all Core Operations routes
router.use(requireAdminAuth);

/**
 * List authoritative Core bookings with multi-field search, vendor filtering,
 * category, city, and status tabs.
 */
router.get('/bookings', requireAnyPermission('bookings.read', 'operations.read'), async (req, res, next) => {
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
router.get('/bookings/:id', requireAnyPermission('bookings.read', 'operations.read'), async (req, res, next) => {
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

router.get('/finance-ledger', requireAnyPermission('payments.read', 'settlements.read'), async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const filter = {};
    if (req.query.type && req.query.type !== 'All') filter.type = String(req.query.type).toUpperCase();
    const [entries, total] = await Promise.all([
      FinanceLedgerEntry.find(filter).sort({ postedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      FinanceLedgerEntry.countDocuments(filter),
    ]);
    res.json({ ok: true, entries, total, count: entries.length, limit, skip });
  } catch (err) { next(err); }
});

router.get('/approvals', requireAnyPermission('settlements.read', 'settlements.approve'), async (req, res, next) => {
  try {
    const status = String(req.query.status || 'PENDING').toUpperCase();
    const filter = {};
    if (status && status !== 'ALL') filter.status = status;
    if (req.query.type) filter.type = String(req.query.type).toUpperCase();
    const approvals = await AdminApprovalRequest.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit || 50), 100)).lean();
    res.json({ ok: true, approvals: approvals.map(approvalSummary) });
  } catch (err) {
    next(err);
  }
});

router.post('/approvals/:id/approve', requireAnyPermission('settlements.approve', 'payments.refund'), async (req, res, next) => {
  try {
    const approval = await AdminApprovalRequest.findById(req.params.id);
    if (!approval) return res.status(404).json({ error: 'APPROVAL_NOT_FOUND' });
    if (!adminCanApproveRequest(req.admin, approval)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (approval.status !== 'PENDING') return res.status(409).json({ error: 'APPROVAL_NOT_PENDING' });
    if (String(approval.requestedBy) === String(req.admin._id)) {
      return res.status(403).json({ error: 'MAKER_CHECKER_REQUIRED', message: 'The requesting admin cannot approve the same finance action.' });
    }
    approval.status = 'APPROVED';
    approval.approvedBy = req.admin._id;
    approval.approvedByEmail = req.admin.email;
    approval.approvedAt = new Date();
    if (req.body?.reason) approval.reason = `${approval.reason}\nApproval note: ${String(req.body.reason).trim()}`;
    await approval.save();
    res.json({ ok: true, approval: approvalSummary(approval) });
  } catch (err) {
    next(err);
  }
});

router.post('/approvals/:id/reject', requireAnyPermission('settlements.approve', 'payments.refund'), async (req, res, next) => {
  try {
    const approval = await AdminApprovalRequest.findById(req.params.id);
    if (!approval) return res.status(404).json({ error: 'APPROVAL_NOT_FOUND' });
    if (!adminCanApproveRequest(req.admin, approval)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (approval.status !== 'PENDING') return res.status(409).json({ error: 'APPROVAL_NOT_PENDING' });
    approval.status = 'REJECTED';
    approval.rejectedBy = req.admin._id;
    approval.rejectedByEmail = req.admin.email;
    approval.rejectedAt = new Date();
    approval.reason = `${approval.reason}\nRejected: ${String(req.body?.reason || 'No reason provided').trim()}`;
    await approval.save();
    res.json({ ok: true, approval: approvalSummary(approval) });
  } catch (err) {
    next(err);
  }
});

router.post('/bookings/:id/refund', requirePermission('payments.refund'), async (req, res) => {
  try {
    const booking = await CoreBooking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'BOOKING_NOT_FOUND' });

    const approvedRequest = req.body?.approvalId ? await AdminApprovalRequest.findOne({
      _id: req.body.approvalId, type: 'REFUND', targetId: String(req.params.id), status: 'APPROVED',
    }) : null;
    const amount = money(req.body?.amount ?? approvedRequest?.payload?.amount ?? booking.paymentSummary?.paidAmount);
    const reference = String(req.body?.reference || req.body?.transactionReference || approvedRequest?.payload?.reference || '').trim();
    if (amount <= 0) return res.status(400).json({ error: 'REFUND_AMOUNT_REQUIRED', message: 'Refund amount must be greater than zero.' });
    if (!reference) return res.status(400).json({ error: 'REFUND_REFERENCE_REQUIRED', message: 'A real refund/payment provider reference is required.' });

    let refundLimit = null;
    const refundTiers = booking.financialPolicySnapshot?.customerCancellationRefunds;
    if (refundTiers && typeof refundTiers === 'object') {
      const eventDate = String(booking.eventDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return res.status(409).json({ error: 'REFUND_EVENT_DATE_REQUIRED', message: 'The event date is required to calculate this booking’s approved refund terms.' });
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const daysBeforeEvent = Math.floor((Date.parse(`${eventDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
      const previousRefunds = await FinanceLedgerEntry.aggregate([
        { $match: { booking: booking._id, type: 'REFUND' } },
        { $group: { _id: null, amount: { $sum: '$amount' } } },
      ]);
      refundLimit = calculateEligibleAdvanceRefund({
        eligibleAdvance: booking.paymentSummary?.advanceAmount ?? booking.paymentSummary?.paidAmount,
        refundTiers,
        daysBeforeEvent,
        alreadyRefunded: previousRefunds[0]?.amount || 0,
      });
      if (!refundLimit) return res.status(409).json({ error: 'REFUND_POLICY_UNRESOLVED', message: 'This booking has no applicable approved refund tier for the current date.' });
      if (amount > refundLimit.amount) return res.status(400).json({ error: 'REFUND_EXCEEDS_POLICY_LIMIT', maximumRefund: refundLimit.amount, eligiblePercent: refundLimit.percent });
    }

    if (!req.body?.approvalId) {
      const existing = await AdminApprovalRequest.findOne({
        type: 'REFUND',
        targetId: String(req.params.id),
        status: 'PENDING',
      }).lean();
      const approval = existing || await AdminApprovalRequest.create({
        type: 'REFUND',
        targetType: 'CoreBooking',
        targetId: String(req.params.id),
        requestedBy: req.admin._id,
        requestedByEmail: req.admin.email,
        reason: String(req.body?.reason || req.body?.notes || 'Refund requested').trim(),
        payload: {
          amount,
          reference,
          notes: req.body?.notes || '',
        },
        requestId: req.requestId || '',
      });
      return res.status(202).json({
        ok: true,
        pendingApproval: true,
        approval: approvalSummary(approval),
        message: 'Refund request created. A different authorized admin must approve it before ledger posting.',
      });
    }

    const approval = approvedRequest;
    if (!approval) {
      return res.status(403).json({ error: 'APPROVAL_REQUIRED', message: 'Approved maker-checker request is required before refund posting.' });
    }
    if (String(approval.requestedBy) === String(req.admin._id)) {
      return res.status(403).json({ error: 'MAKER_CHECKER_REQUIRED', message: 'The requesting admin cannot execute the same approved refund.' });
    }

    const approvedAmount = money(approval.payload?.amount);
    const approvedReference = String(approval.payload?.reference || '').trim();
    if (amount !== approvedAmount || reference !== approvedReference) {
      return res.status(409).json({ error: 'APPROVED_REFUND_TERMS_MISMATCH', message: 'The refund amount and provider reference must match the approved request.' });
    }

    booking.paymentStatus = 'REFUNDED';
    booking.settlementStatus = booking.settlementStatus === 'SETTLED' ? booking.settlementStatus : 'NOT_ELIGIBLE';
    await booking.save();
    await recordRefund(
      booking,
      {
        amount: approvedAmount,
        reference: approvedReference,
        reason: req.body.reason || req.body.notes || approval.reason,
      },
      req.admin.email
    );
    approval.status = 'USED';
    approval.usedAt = new Date();
    await approval.save();
    res.json({ ok: true, booking });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'REFUND_ERROR', message: err.message });
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
    const transactionReference = String(req.body?.transactionReference || '').trim();
    if (!transactionReference) {
      return res.status(400).json({ error: 'SETTLEMENT_REFERENCE_REQUIRED', message: 'A real bank/transfer reference is required.' });
    }

    if (!req.body?.approvalId) {
      const existing = await AdminApprovalRequest.findOne({
        type: 'SETTLEMENT_RELEASE',
        targetId: String(req.params.id),
        status: 'PENDING',
      }).lean();
      const approval = existing || await AdminApprovalRequest.create({
        type: 'SETTLEMENT_RELEASE',
        targetType: 'CoreBooking',
        targetId: String(req.params.id),
        requestedBy: req.admin._id,
        requestedByEmail: req.admin.email,
        reason: String(req.body?.reason || req.body?.notes || 'Settlement release requested').trim(),
        payload: {
          transactionReference,
          notes: req.body?.notes || '',
        },
        requestId: req.requestId || '',
      });
      return res.status(202).json({
        ok: true,
        pendingApproval: true,
        approval: approvalSummary(approval),
        message: 'Settlement release request created. A different authorized admin must approve it before payout release.',
      });
    }

    const approval = await AdminApprovalRequest.findOne({
      _id: req.body.approvalId,
      type: 'SETTLEMENT_RELEASE',
      targetId: String(req.params.id),
      status: 'APPROVED',
    });
    if (!approval) {
      return res.status(403).json({ error: 'APPROVAL_REQUIRED', message: 'Approved maker-checker request is required before settlement release.' });
    }
    if (String(approval.requestedBy) === String(req.admin._id)) {
      return res.status(403).json({ error: 'MAKER_CHECKER_REQUIRED', message: 'The requesting admin cannot execute the same approved settlement release.' });
    }

    const booking = await settleBooking(req.params.id, { ...approval.payload, ...req.body, approvalId: String(approval._id) }, coreActor);
    approval.status = 'USED';
    approval.usedAt = new Date();
    await approval.save();
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
