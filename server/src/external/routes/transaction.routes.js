import express from 'express';
import { requireExternalAuth, requireAccountType } from '../middleware/requireExternalAuth.js';
import { Opportunity } from '../models/Opportunity.js';
import { Quote } from '../models/Quote.js';
import { Notification } from '../models/Notification.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { matchVendorsForRequirement } from '../services/matching.service.js';
import { createQuote, transitionQuote } from '../services/quoteStateMachine.service.js';
import { startService, submitCompletionEvidence } from '../../admin/services/executionSettlement.service.js';

const router = express.Router();

// ── OPPORTUNITIES (Spec §9, §10, Golden Test F) ──────────────────────────

/**
 * Transforms a structured customer requirement into actionable vendor opportunities.
 */
router.post('/opportunities/generate', requireExternalAuth, async (req, res, next) => {
  try {
    const {
      category,
      serviceLocation,
      date,
      startTime = '10:00',
      endTime = '18:00',
      guestCount = 500,
      durationHours = 8,
      requiredStyles = [],
      requiredCapability = '',
    } = req.body || {};

    if (!category || !date) {
      return res.status(400).json({ error: 'CATEGORY_AND_DATE_REQUIRED' });
    }

    // Run qualification & commercial matching engine
    const matchResult = await matchVendorsForRequirement({
      category,
      serviceLocation,
      date,
      startTime,
      endTime,
      guestCount,
      durationHours,
      requiredStyles,
    });

    const createdOpportunities = [];

    // Create an actionable Opportunity for each eligible candidate
    for (const candidate of matchResult.eligibleCandidates) {
      const opp = await Opportunity.create({
        vendor: candidate.vendorId,
        customer: req.externalUser._id,
        vendorService: candidate.serviceId,
        serviceName: candidate.serviceName,
        eventDate: date,
        serviceLocation: serviceLocation || {},
        guestCount,
        requiredCapability:
          requiredCapability ||
          `${candidate.capability?.styles?.join(', ') || 'Standard service'} (${guestCount} guests, ${durationHours} hrs)`,
        estimatedTravel: candidate.cost?.travelBreakdown?.originLocality
          ? `${candidate.cost.travelBreakdown.originLocality} -> ${serviceLocation?.locality || serviceLocation?.city || 'Venue'}`
          : `${serviceLocation?.locality || serviceLocation?.city || 'Local'}`,
        travelCost: candidate.cost?.travelCost || 0,
        status: 'NEW',
        action: 'Respond / Quote',
      });
      createdOpportunities.push(opp);

      // Create live notification for candidate vendor
      await Notification.create({
        vendor: candidate.vendorId,
        title: 'New Enquiry Received',
        message: `${candidate.serviceName} · ${date} · ${serviceLocation?.locality || 'New Town'} · ${guestCount} guests`,
        type: 'ENQUIRY',
        link: '/vendor/enquiries',
        metadata: { opportunityId: opp._id },
      });
    }

    res.json({
      ok: true,
      eligibleCount: matchResult.eligibleCount,
      excludedCount: matchResult.excludedCount,
      opportunities: createdOpportunities,
      matchingFunnel: matchResult,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Vendor retrieves their structured opportunities.
 */
router.get('/vendor/opportunities', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const filter = { vendor: vendorId };
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const opportunities = await Opportunity.find(filter)
      .populate('customer', 'fullName email phone')
      .sort({ createdAt: -1 });

    res.json({ ok: true, count: opportunities.length, opportunities });
  } catch (err) {
    next(err);
  }
});

// ── QUOTE LIFECYCLE (Spec §9, Golden Test G) ──────────────────────────────

/**
 * Retrieves quotes for the authenticated user (vendor or customer).
 */
router.get('/quotes', requireExternalAuth, async (req, res, next) => {
  try {
    const filter = {};
    if (req.externalUser.accountType === 'VENDOR') {
      const vendorId = req.externalUser.vendorOrganization;
      if (!vendorId) {
        return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
      }
      filter.vendor = vendorId;
    } else {
      filter.customer = req.externalUser._id;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const quotes = await Quote.find(filter)
      .populate('customer', 'fullName email phone')
      .populate('vendor', 'businessName category location')
      .sort({ createdAt: -1 });

    res.json({ ok: true, count: quotes.length, quotes });
  } catch (err) {
    next(err);
  }
});

/**
 * Vendor-specific endpoint to retrieve quotes.
 */
router.get('/vendor/quotes', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const filter = { vendor: vendorId };
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const quotes = await Quote.find(filter)
      .populate('customer', 'fullName email phone')
      .sort({ createdAt: -1 });

    res.json({ ok: true, count: quotes.length, quotes });
  } catch (err) {
    next(err);
  }
});

/**
 * Creates a new Quote proposal (DRAFT or SUBMITTED).
 */
router.post('/quotes', requireExternalAuth, async (req, res, next) => {
  try {
    const {
      opportunityId,
      customerId,
      vendorId: inputVendorId,
      vendorServiceId,
      serviceName,
      eventDate,
      serviceLocation,
      pricingBreakdown,
      notes,
      status = 'SUBMITTED',
    } = req.body || {};

    const resolvedVendorId =
      req.externalUser.accountType === 'VENDOR'
        ? req.externalUser.vendorOrganization
        : inputVendorId;

    if (!resolvedVendorId) {
      return res.status(400).json({ error: 'VENDOR_ID_REQUIRED' });
    }

    const quote = await createQuote({
      opportunityId,
      vendorId: resolvedVendorId,
      customerId: customerId || req.externalUser._id,
      vendorServiceId,
      serviceName: serviceName || 'Event Service',
      eventDate,
      serviceLocation,
      pricingBreakdown,
      notes,
      status,
      actor: req.externalUser.fullName || req.externalUser.email,
    });

    res.status(201).json({ ok: true, quote });
  } catch (err) {
    next(err);
  }
});

/**
 * Fetches quote by ID.
 */
router.get('/quotes/:id', requireExternalAuth, async (req, res, next) => {
  try {
    const quote = await Quote.findById(req.params.id)
      .populate('vendor', 'businessName category rating location')
      .populate('customer', 'fullName email');

    if (!quote) {
      return res.status(404).json({ error: 'QUOTE_NOT_FOUND' });
    }

    res.json({ ok: true, quote });
  } catch (err) {
    next(err);
  }
});

/**
 * Transitions quote status (Golden Test G).
 * Rejects illegal transitions server-side with controlled 400 and audit.
 */
router.post('/quotes/:id/transition', requireExternalAuth, async (req, res) => {
  try {
    const { targetStatus, reason } = req.body || {};
    if (!targetStatus) {
      return res.status(400).json({ error: 'TARGET_STATUS_REQUIRED' });
    }

    const quote = await transitionQuote(req.params.id, targetStatus, {
      actor: req.externalUser.fullName || req.externalUser.email,
      reason,
    });

    if (targetStatus === 'APPROVED') {
      await Notification.create({
        vendor: quote.vendor,
        title: 'Client Approved Your Quote! 🎉',
        message: `Quote for ${quote.serviceName} (${quote.eventDate}) approved at ₹${(quote.pricingBreakdown?.totalAmount || 0).toLocaleString()}. Core Booking created.`,
        type: 'QUOTE',
        link: '/vendor/bookings',
        metadata: { quoteId: quote._id },
      });
    }

    res.json({ ok: true, quote });
  } catch (err) {
    return res.status(err.statusCode || 400).json({
      error: err.code || 'INVALID_QUOTE_TRANSITION',
      message: err.message,
      details: err.details || null,
    });
  }
});

// ── VENDOR EXECUTION WORKSPACE (Spec §11, §17, Golden Test J) ──────────────

/**
 * Vendor retrieves their assigned bookings.
 */
router.get('/vendor/bookings', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    if (!vendorId) {
      return res.status(403).json({ error: 'NO_VENDOR_ORGANIZATION' });
    }

    const bookings = await CoreBooking.find({ vendorId }).sort({ eventDate: 1 });
    res.json({ ok: true, count: bookings.length, bookings });
  } catch (err) {
    next(err);
  }
});

/**
 * Vendor marks service execution as started.
 */
router.post('/vendor/bookings/:id/start', requireExternalAuth, requireAccountType('VENDOR'), async (req, res, next) => {
  try {
    const vendorId = req.externalUser.vendorOrganization;
    const booking = await startService(req.params.id, vendorId);
    res.json({ ok: true, booking });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'EXECUTION_ERROR', message: err.message });
  }
});

/**
 * Vendor submits completion evidence (Golden Test J).
 */
router.post(
  '/vendor/bookings/:id/submit-completion',
  requireExternalAuth,
  requireAccountType('VENDOR'),
  async (req, res) => {
    try {
      const vendorId = req.externalUser.vendorOrganization;
      const { deliverablesUrl, checklist, notes } = req.body || {};

      const booking = await submitCompletionEvidence(req.params.id, vendorId, {
        deliverablesUrl,
        checklist,
        notes,
      });

      res.json({ ok: true, booking });
    } catch (err) {
      res.status(err.statusCode || 400).json({ error: err.code || 'COMPLETION_ERROR', message: err.message });
    }
  }
);

/**
 * NON-NEGOTIABLE CORE AUTHORITY GUARDS:
 * Vendor cannot declare PAYMENT_VERIFIED, COMPLETION_VERIFIED, or SETTLEMENT_ELIGIBLE (Golden Test J, Spec §3, §11).
 */
router.post(
  '/vendor/bookings/:id/verify-completion',
  requireExternalAuth,
  requireAccountType('VENDOR'),
  (req, res) => {
    return res.status(403).json({
      error: 'CORE_AUTHORITY_VIOLATION',
      message: 'Vendor cannot declare COMPLETION_VERIFIED. Completion validation is strictly Core Platform authority.',
    });
  }
);

router.post(
  '/vendor/bookings/:id/verify-payment',
  requireExternalAuth,
  requireAccountType('VENDOR'),
  (req, res) => {
    return res.status(403).json({
      error: 'CORE_AUTHORITY_VIOLATION',
      message: 'Vendor cannot declare PAYMENT_VERIFIED. Payment verification is strictly Core Platform authority.',
    });
  }
);

export default router;
