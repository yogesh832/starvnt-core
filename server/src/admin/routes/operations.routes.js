import express from 'express';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';
import { CoreBooking } from '../models/CoreBooking.js';
import {
  verifyPaymentFromCore,
  validateCompletionFromCore,
  settleBooking,
  handleVendorFailureAndDiscoverAlternatives,
} from '../services/executionSettlement.service.js';

const router = express.Router();

// Require admin authentication for all Core Operations routes
router.use(requireAdminAuth);

/**
 * List authoritative Core bookings with filtering.
 */
router.get('/bookings', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.bookingStatus = req.query.status;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    if (req.query.executionStatus) filter.executionStatus = req.query.executionStatus;
    if (req.query.settlementStatus) filter.settlementStatus = req.query.settlementStatus;
    if (req.query.vendorId) filter.vendorId = req.query.vendorId;

    const bookings = await CoreBooking.find(filter).sort({ createdAt: -1 });
    res.json({ ok: true, count: bookings.length, bookings });
  } catch (err) {
    next(err);
  }
});

/**
 * Get booking details.
 */
router.get('/bookings/:id', async (req, res, next) => {
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
router.post('/bookings/:id/verify-payment', async (req, res) => {
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
router.post('/bookings/:id/validate-completion', async (req, res) => {
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
router.post('/bookings/:id/settle', async (req, res) => {
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
router.post('/bookings/:id/fail-and-reassign', async (req, res) => {
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
