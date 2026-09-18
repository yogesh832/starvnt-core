import { Router } from 'express';
import { checkTrueAvailability } from '../services/availability.service.js';
import { calculateValidatedTotalCost } from '../services/totalCost.service.js';
import { matchVendorsForRequirement } from '../services/matching.service.js';

const router = Router();

// ── Check Operational Feasibility / True Availability (Spec §5, §6) ────────
router.post('/check-availability', async (req, res, next) => {
  try {
    const { vendorId, vendorServiceId, date, startTime, endTime, serviceLocation, requestedResources } =
      req.body || {};

    if (!vendorId || !date) {
      return res.status(400).json({ error: 'VENDOR_ID_AND_DATE_REQUIRED' });
    }

    const result = await checkTrueAvailability({
      vendorId,
      vendorServiceId,
      date,
      startTime,
      endTime,
      serviceLocation,
      requestedResources,
    });

    res.json({ ok: true, availability: result });
  } catch (err) {
    next(err);
  }
});

// ── Calculate Validated Total Cost (Spec §8) ────────────────────────────────
router.post('/calculate-cost', async (req, res, next) => {
  try {
    const { vendorId, vendorServiceId, serviceLocation, guestCount, durationHours, requiresOutstation } =
      req.body || {};

    if (!vendorId || !vendorServiceId) {
      return res.status(400).json({ error: 'VENDOR_ID_AND_SERVICE_ID_REQUIRED' });
    }

    const costBreakdown = await calculateValidatedTotalCost({
      vendorId,
      vendorServiceId,
      serviceLocation,
      guestCount,
      durationHours,
      requiresOutstation,
    });

    res.json({ ok: true, cost: costBreakdown });
  } catch (err) {
    next(err);
  }
});

// ── Match Vendors for Requirement (Spec §8, §9) ─────────────────────────────
router.post('/match', async (req, res, next) => {
  try {
    const { category, serviceLocation, date, startTime, endTime, guestCount, durationHours, requiredStyles } =
      req.body || {};

    if (!category || !date) {
      return res.status(400).json({ error: 'CATEGORY_AND_DATE_REQUIRED' });
    }

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

    res.json({ ok: true, matches: matchResult });
  } catch (err) {
    next(err);
  }
});

export default router;
