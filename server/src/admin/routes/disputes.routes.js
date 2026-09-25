import express from 'express';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';
import { CoreBooking } from '../models/CoreBooking.js';
import { reportIssue, resolveDispute } from '../services/disputes.service.js';

const router = express.Router();

// Require admin authentication for all dispute routes
router.use(requireAdminAuth);

/**
 * Get all disputes across all bookings (useful for Admin Dashboard)
 */
router.get('/', async (req, res, next) => {
  try {
    // Find any booking that has disputes
    const bookingsWithDisputes = await CoreBooking.find({ 'disputes.0': { $exists: true } });
    
    // Extract and flatten the disputes
    const allDisputes = [];
    bookingsWithDisputes.forEach(booking => {
      booking.disputes.forEach(dispute => {
        allDisputes.push({
          bookingId: booking._id,
          bookingReference: booking.bookingReference,
          customerName: booking.customerName,
          vendorName: booking.vendorName,
          dispute
        });
      });
    });

    // Optional: Filter by status in memory (or could do via aggregation framework)
    const statusFilter = req.query.status;
    const filteredDisputes = statusFilter 
      ? allDisputes.filter(d => d.dispute.status === statusFilter)
      : allDisputes;

    res.json({ ok: true, count: filteredDisputes.length, disputes: filteredDisputes });
  } catch (err) {
    next(err);
  }
});

/**
 * Report a new issue on a booking, putting settlement on HOLD.
 */
router.post('/booking/:id/report', async (req, res) => {
  try {
    const { reportedBy, issueType, description } = req.body;
    
    if (!description) {
      return res.status(400).json({ error: 'MISSING_DATA', message: 'Description is required to report an issue.' });
    }

    const booking = await reportIssue(req.params.id, { reportedBy, issueType, description });
    res.json({ ok: true, message: 'Issue reported and settlement placed on hold.', booking });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.code || 'REPORT_ISSUE_ERROR', message: err.message });
  }
});

/**
 * Resolve an ongoing dispute on a booking.
 */
router.post('/booking/:id/resolve/:disputeId', async (req, res) => {
  try {
    const coreActor = req.admin ? req.admin.email : 'CORE_ADMIN';
    const { decision, notes, refundAmount, settlementAmount } = req.body;

    if (!decision) {
      return res.status(400).json({ error: 'MISSING_DATA', message: 'Resolution decision is required.' });
    }

    const result = await resolveDispute(req.params.id, req.params.disputeId, {
      decision,
      notes,
      refundAmount,
      settlementAmount
    }, coreActor);

    res.json({ ok: true, message: `Dispute resolved with decision: ${decision}`, result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.code || 'RESOLVE_DISPUTE_ERROR', message: err.message });
  }
});

export default router;
