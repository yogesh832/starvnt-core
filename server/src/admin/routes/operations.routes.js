import express from 'express';
import { requireAdminAuth, requirePermission } from '../middleware/requireAdminAuth.js';
import { CoreBooking } from '../models/CoreBooking.js';
import {
  verifyPaymentFromCore,
  validateCompletionFromCore,
  settleBooking,
  handleVendorFailureAndDiscoverAlternatives,
} from '../services/executionSettlement.service.js';

const router = express.Router();

function escapeRegex(text = '') {
  return String(text).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
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
 * Authoritative Payment Verification from Core (Golden Test I).
 */
router.post('/bookings/:id/verify-payment', requirePermission('operations.manage'), async (req, res) => {
  try {
    const coreActor = req.admin ? req.admin.email : 'CORE_ADMIN';
    const booking = await verifyPaymentFromCore(req.params.id, req.body, coreActor);
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
router.post('/bookings/:id/settle', requirePermission('operations.manage'), async (req, res) => {
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
