import { Router } from 'express';
import { readFileSync } from 'node:fs';
import rateLimit from 'express-rate-limit';
import { PARTNER_OFFER, PARTNER_OFFER_NOTICE_VERSION, addCalendarMonths, validatePartnerPromo } from '../../common/partnerProgram.js';
import { PartnerOfferRequest } from '../models/PartnerOfferRequest.js';
import { VendorAuraPromotion } from '../models/VendorAuraPromotion.js';
const legal = JSON.parse(readFileSync(new URL('../data/partnerLegalDrafts.json', import.meta.url), 'utf8'));
export const partnerProgramRoutes = Router();
const h = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
partnerProgramRoutes.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
partnerProgramRoutes.use(rateLimit({ windowMs: 60000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false }));
const project = row => row ? { code: row.code, status: row.status, revision: row.revision, requestedAt: row.createdAt, updatedAt: row.updatedAt, history: row.history.map(h => ({ at: h.at, action: h.action, revision: h.revision, noticeVersion: h.noticeVersion })) } : null;
const entitlementView = (row, now = new Date()) => row ? {
  code: row.code, startedAt: row.startedAt, expiresAt: row.expiresAt,
  status: new Date(row.expiresAt) > now ? 'ACTIVE' : 'EXPIRED',
  autoRenewsToPaid: false,
} : null;
partnerProgramRoutes.get('/', h(async (req, res) => {
  const [request, entitlement] = await Promise.all([
    PartnerOfferRequest.findOne({ vendor: req.vendorId, code: PARTNER_OFFER.code }).lean(),
    VendorAuraPromotion.findOne({ vendor: req.vendorId }).lean(),
  ]);
  res.json({ offer: PARTNER_OFFER, noticeVersion: PARTNER_OFFER_NOTICE_VERSION, request: project(request), entitlement: entitlementView(entitlement), legal });
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
partnerProgramRoutes.post('/request', h(async (req, res) => {
  const { code, acknowledged, noticeVersion, revision } = req.body || {};
  const promo = validatePartnerPromo(code);
  if (!promo.recognized) return res.status(400).json({ error: 'PROMO_UNAVAILABLE', message: promo.message });
  if (acknowledged !== true || noticeVersion !== PARTNER_OFFER_NOTICE_VERSION || !Number.isSafeInteger(revision) || revision < 0) return res.status(409).json({ error: 'OFFER_NOTICE_CHANGED', message: 'Review the current request-only notice and confirm it before submitting.' });
  if (['SUSPENDED', 'REJECTED'].includes(req.vendor.status) || req.vendor.isRestricted || req.vendor.isFlagged) return res.status(403).json({ error: 'VENDOR_REVIEW_REQUIRED', message: 'Your business status needs review before requesting this offer.' });
  const filter = { vendor: req.vendorId, code: PARTNER_OFFER.code };
  const existing = await PartnerOfferRequest.findOne(filter).lean();
  if (existing?.status === 'REQUESTED') return res.json({ request: project(existing), replay: true, subscriptionActivated: false });
  const event = { actor: req.externalUser._id, at: new Date(), action: 'REQUESTED', revision: revision + 1, noticeVersion };
  try {
    const row = await PartnerOfferRequest.findOneAndUpdate({ ...filter, revision }, { $set: { status: 'REQUESTED', noticeVersion }, $inc: { revision: 1 }, $push: { history: event } }, { upsert: !existing && revision === 0, new: true, runValidators: true });
    if (!row) return res.status(409).json({ error: 'STALE_REVISION', message: 'This offer request changed. Reload and retry.' });
    res.status(existing ? 200 : 201).json({ request: project(row), subscriptionActivated: false });
  } catch (error) { if (error.code !== 11000) throw error; res.status(409).json({ error: 'STALE_REVISION', message: 'This offer request changed. Reload and retry.' }); }
}));
partnerProgramRoutes.post('/withdraw', h(async (req, res) => {
  const revision = req.body?.revision;
  if (!Number.isSafeInteger(revision) || revision < 1) return res.status(400).json({ error: 'INVALID_REVISION' });
  const row = await PartnerOfferRequest.findOneAndUpdate({ vendor: req.vendorId, code: PARTNER_OFFER.code, revision, status: 'REQUESTED' }, { $set: { status: 'WITHDRAWN' }, $inc: { revision: 1 }, $push: { history: { actor: req.externalUser._id, at: new Date(), action: 'WITHDRAWN', revision: revision + 1, noticeVersion: PARTNER_OFFER_NOTICE_VERSION } } }, { new: true });
  if (!row) return res.status(409).json({ error: 'STALE_REVISION', message: 'This request changed. Reload and retry.' });
  res.json({ request: project(row), subscriptionActivated: false });
}));
