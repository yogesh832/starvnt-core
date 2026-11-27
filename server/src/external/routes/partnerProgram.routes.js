import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { PARTNER_OFFER, addCalendarMonths, validatePartnerPromo } from '../../common/partnerProgram.js';
import { VendorAuraPromotion } from '../models/VendorAuraPromotion.js';

export const partnerProgramRoutes = Router();
const h = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
partnerProgramRoutes.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
partnerProgramRoutes.use(rateLimit({ windowMs: 60000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false }));

const entitlementView = (row, now = new Date()) => row ? {
  code: row.code, startedAt: row.startedAt, expiresAt: row.expiresAt,
  status: new Date(row.expiresAt) > now ? 'ACTIVE' : 'EXPIRED',
  autoRenewsToPaid: false,
} : null;

partnerProgramRoutes.get('/', h(async (req, res) => {
  const entitlement = await VendorAuraPromotion.findOne({ vendor: req.vendorId }).lean();
  res.json({ offer: PARTNER_OFFER, entitlement: entitlementView(entitlement) });
}));

partnerProgramRoutes.post('/validate', h(async (req, res) => res.json(validatePartnerPromo(req.body?.code))));

partnerProgramRoutes.post('/redeem', h(async (req, res) => {
  const promo = validatePartnerPromo(req.body?.code);
  if (!promo.recognized) return res.status(400).json({ error: 'PROMO_UNAVAILABLE', message: promo.message });
  if (['SUSPENDED', 'REJECTED'].includes(req.vendor.status) || req.vendor.isRestricted || req.vendor.isFlagged) {
    return res.status(403).json({ error: 'VENDOR_REVIEW_REQUIRED', message: 'Your business status needs review before redeeming this offer.' });
  }
  const startedAt = new Date();
  let row;
  let replay = false;
  try {
    row = await VendorAuraPromotion.findOneAndUpdate(
      { vendor: req.vendorId },
      { $setOnInsert: { vendor: req.vendorId, code: PARTNER_OFFER.code, startedAt, expiresAt: addCalendarMonths(startedAt, PARTNER_OFFER.durationMonths), redeemedBy: req.externalUser._id } },
      { upsert: true, new: true, includeResultMetadata: true },
    );
    replay = Boolean(row.lastErrorObject?.updatedExisting);
    row = row.value;
  } catch (error) {
    if (error.code !== 11000) throw error;
    row = await VendorAuraPromotion.findOne({ vendor: req.vendorId });
    if (!row) throw error;
    replay = true;
  }
  res.status(replay ? 200 : 201).json({ entitlement: entitlementView(row), replay });
}));
