import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    discountType: { type: String, enum: ['PERCENTAGE', 'AMOUNT'], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderAmount: { type: Number, default: 0, min: 0 },
    maxDiscountAmount: { type: Number, default: null, min: 0 },
    validFrom: { type: Date, default: Date.now },
    validUntil: { type: Date, default: null },
    usageLimit: { type: Number, default: null, min: 1 },
    usageCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

couponSchema.index({ code: 1 }, { unique: true });

export const Coupon = adminConn.model('Coupon', couponSchema);
