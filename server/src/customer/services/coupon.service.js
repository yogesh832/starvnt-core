import { Coupon } from '../../admin/models/Coupon.js';
import { badRequest } from '../utils/http.js';

export function normalizeCouponCode(code) {
  return String(code || '').trim().toUpperCase();
}

export function publicCoupon(coupon, { discountAmount = 0, baseAmount = 0, orderAmount = 0 } = {}) {
  if (!coupon) return null;
  return {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountAmount,
    baseAmount,
    orderAmount,
    payableAmount: Math.max(1, Number(baseAmount || 0) - Number(discountAmount || 0)),
    description: coupon.description || '',
  };
}

export async function validateCouponForPayment(code, { orderAmount, baseAmount }) {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return { coupon: null, discountAmount: 0 };

  const coupon = await Coupon.findOne({ code: normalized }).lean();
  if (!coupon || !coupon.isActive) {
    throw badRequest('COUPON_INVALID', 'This coupon code is not valid.');
  }

  const now = new Date();
  if (coupon.validFrom && new Date(coupon.validFrom) > now) {
    throw badRequest('COUPON_NOT_STARTED', 'This coupon is not active yet.');
  }
  if (coupon.validUntil && new Date(coupon.validUntil) < now) {
    throw badRequest('COUPON_EXPIRED', 'This coupon has expired.');
  }
  if (coupon.usageLimit && Number(coupon.usageCount || 0) >= Number(coupon.usageLimit)) {
    throw badRequest('COUPON_USAGE_LIMIT_REACHED', 'This coupon has already been fully used.');
  }
  if (Number(orderAmount || 0) < Number(coupon.minOrderAmount || 0)) {
    throw badRequest('COUPON_MIN_ORDER_NOT_MET', `This coupon requires a minimum order of ₹${Number(coupon.minOrderAmount || 0).toLocaleString('en-IN')}.`);
  }

  const payableBase = Math.max(0, Math.round(Number(baseAmount || 0)));
  let discountAmount = 0;
  if (coupon.discountType === 'PERCENTAGE') {
    discountAmount = Math.floor((payableBase * Number(coupon.discountValue || 0)) / 100);
    if (coupon.maxDiscountAmount) {
      discountAmount = Math.min(discountAmount, Number(coupon.maxDiscountAmount));
    }
  } else {
    discountAmount = Number(coupon.discountValue || 0);
  }

  discountAmount = Math.max(0, Math.min(payableBase - 1, Math.round(discountAmount)));
  if (!discountAmount) {
    throw badRequest('COUPON_NO_DISCOUNT', 'This coupon does not reduce this payment.');
  }

  return { coupon, discountAmount };
}

export async function recordCouponUsageOnce(code) {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return null;
  return Coupon.findOneAndUpdate(
    {
      code: normalized,
      isActive: true,
      $or: [
        { usageLimit: { $exists: false } },
        { usageLimit: null },
        { $expr: { $lt: ['$usageCount', '$usageLimit'] } },
      ],
    },
    { $inc: { usageCount: 1 } },
    { new: true },
  ).lean();
}
