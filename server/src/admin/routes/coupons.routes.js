import express from 'express';
import { Coupon } from '../models/Coupon.js';
import { requirePermission } from '../middleware/requireAdminAuth.js';

const router = express.Router();

function escapeRegex(text = '') {
  return String(text).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

router.get('/', requirePermission('settings.read'), async (req, res, next) => {
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

router.post('/', requirePermission('settings.update'), async (req, res, next) => {
  try {
    const payload = { ...req.body, code: String(req.body?.code || '').trim().toUpperCase() };
    const coupon = await Coupon.create(payload);
    res.status(201).json({ ok: true, coupon });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'COUPON_EXISTS' });
    next(err);
  }
});

router.put('/:id', requirePermission('settings.update'), async (req, res, next) => {
  try {
    const payload = { ...req.body };
    if (payload.code) payload.code = String(payload.code).trim().toUpperCase();
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, payload, { new: true });
    res.json({ ok: true, coupon });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requirePermission('settings.update'), async (req, res, next) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
