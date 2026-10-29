import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;
const METRICS = ['SUBMITTED_QUOTES', 'CONFIRMED_BOOKINGS', 'COMPLETED_BOOKINGS'];

const vendorBusinessGoalSchema = new Schema({
  vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  metric: { type: String, required: true, enum: METRICS },
  targetValue: { type: Number, required: true, min: 1 },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'PAUSED'], default: 'ACTIVE', index: true },
  history: [{
    changedAt: { type: Date, default: Date.now },
    action: { type: String, enum: ['CREATED', 'UPDATED', 'STATUS_CHANGED', 'DELETED'] },
    changedBy: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
  }],
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

vendorBusinessGoalSchema.index({ vendor: 1, status: 1 });

export const VendorBusinessGoal = externalConn.model('VendorBusinessGoal', vendorBusinessGoalSchema);
export const VENDOR_GOAL_METRICS = METRICS;
