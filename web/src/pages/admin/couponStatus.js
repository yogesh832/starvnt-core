export function couponStatus(coupon, now = Date.now()) {
  if (!coupon.isActive) return 'Inactive';
  if (coupon.validUntil && new Date(coupon.validUntil).getTime() < now) return 'Expired';
  if (coupon.validFrom && new Date(coupon.validFrom).getTime() > now) return 'Scheduled';
  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) return 'Used up';
  return 'Active';
}
