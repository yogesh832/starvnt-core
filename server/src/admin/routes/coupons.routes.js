import express from 'express';
import { Coupon } from '../models/Coupon.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const skip = parseInt(req.query.skip) || 0;
    const coupons = await Coupon.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    const total = await Coupon.countDocuments();
    res.json({ ok: true, coupons, total });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const coupon = await Coupon.create(req.body);
    res.status(201).json({ ok: true, coupon });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'COUPON_EXISTS' });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ ok: true, coupon });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
