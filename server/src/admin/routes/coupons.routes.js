import express from 'express';
import { Coupon } from '../models/Coupon.js';
import { requireAnyPermission } from '../middleware/requireAdminAuth.js';
import { auditContext, recordAudit } from '../utils/audit.js';

const router = express.Router();

function escapeRegex(text = '') {
  return String(text).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

function endOfKolkataDate(value) {
  if (!value) return null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T23:59:59.999+05:30`);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function couponPayload(body = {}) {
  const code = String(body.code || '').trim().toUpperCase();
  const discountType = body.discountType;
  const discountValue = Number(body.discountValue);
  const minOrderAmount = Number(body.minOrderAmount || 0);
  const maxDiscountAmount = body.maxDiscountAmount == null || body.maxDiscountAmount === '' ? null : Number(body.maxDiscountAmount);
  const usageLimit = body.usageLimit == null || body.usageLimit === '' ? null : Number(body.usageLimit);
  const validUntil = endOfKolkataDate(body.validUntil);

  if (!code) return { error: 'CODE_REQUIRED' };
  if (!['PERCENTAGE', 'AMOUNT'].includes(discountType)) return { error: 'INVALID_DISCOUNT_TYPE' };
  if (!Number.isFinite(discountValue) || discountValue <= 0) return { error: 'INVALID_DISCOUNT_VALUE' };
  if (discountType === 'PERCENTAGE' && discountValue > 100) return { error: 'PERCENTAGE_TOO_HIGH' };
  if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0) return { error: 'INVALID_MIN_ORDER' };
  if (maxDiscountAmount !== null && (!Number.isFinite(maxDiscountAmount) || maxDiscountAmount <= 0)) return { error: 'INVALID_MAX_DISCOUNT' };
  if (usageLimit !== null && (!Number.isFinite(usageLimit) || usageLimit < 1)) return { error: 'INVALID_USAGE_LIMIT' };

  return {
    payload: {
      code,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      validUntil,
      usageLimit,
      isActive: Boolean(body.isActive),
      description: String(body.description || '').trim(),
    },
  };
}

router.get('/', requireAnyPermission('settings.read', 'financeCoupons.read'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const skip = parseInt(req.query.skip) || 0;
    const filter = {};
    const tab = req.query.tab || req.query.status;
    const now = new Date();
    if (tab && tab !== 'All') {
      const lower = String(tab).toLowerCase();
      if (lower === 'active') {
        filter.isActive = true;
        filter.$or = [{ validUntil: { $exists: false } }, { validUntil: null }, { validUntil: { $gte: now } }];
      } else if (lower === 'expired') {
        filter.$or = [{ validUntil: { $lt: now } }, { isActive: false }];
      }
    }
    if (req.query.search && req.query.search.trim()) {
      const regex = { $regex: escapeRegex(req.query.search.trim()), $options: 'i' };
      filter.$and = [
        ...(filter.$or ? [{ $or: filter.$or }] : []),
        { $or: [{ code: regex }, { description: regex }, { discountType: regex }] },
      ];
      delete filter.$or;
    }
    const coupons = await Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    const total = await Coupon.countDocuments(filter);
    res.json({ ok: true, coupons, total });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAnyPermission('settings.update', 'financeCoupons.manage'), async (req, res, next) => {
  try {
    const { payload, error } = couponPayload(req.body);
    if (error) return res.status(400).json({ error });
    const coupon = await Coupon.create(payload);
    await recordAudit({
      ...auditContext(req),
      action: 'COUPON_CREATE',
      targetType: 'Coupon',
      targetId: String(coupon._id),
      toState: coupon.toObject(),
      reason: req.body?.reason || '',
      idempotencyKey: req.body?.idempotencyKey,
    });
    res.status(201).json({ ok: true, coupon });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'COUPON_EXISTS' });
    next(err);
  }
});

router.put('/:id', requireAnyPermission('settings.update', 'financeCoupons.manage'), async (req, res, next) => {
  try {
    const existing = await Coupon.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ error: 'COUPON_NOT_FOUND' });
    const { payload, error } = couponPayload({ ...existing, ...req.body });
    if (error) return res.status(400).json({ error });
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    await recordAudit({
      ...auditContext(req),
      action: 'COUPON_UPDATE',
      targetType: 'Coupon',
      targetId: String(coupon._id),
      fromState: existing,
      toState: coupon.toObject(),
      reason: req.body?.reason || '',
      idempotencyKey: req.body?.idempotencyKey,
    });
    res.json({ ok: true, coupon });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAnyPermission('settings.update', 'financeCoupons.manage'), async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!coupon) return res.status(404).json({ error: 'COUPON_NOT_FOUND' });
    await recordAudit({
      ...auditContext(req),
      action: 'COUPON_DEACTIVATE',
      targetType: 'Coupon',
      targetId: String(coupon._id),
      toState: { isActive: false },
      reason: req.body?.reason || '',
      idempotencyKey: req.body?.idempotencyKey,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
