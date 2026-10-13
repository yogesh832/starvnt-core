import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';

const { Schema } = mongoose;

const adminApprovalRequestSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['SETTLEMENT_RELEASE', 'REFUND'],
      required: true,
      index: true,
    },
    targetType: { type: String, required: true, default: 'CoreBooking', index: true },
    targetId: { type: String, required: true, index: true },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'USED', 'CANCELLED'], default: 'PENDING', index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
    requestedByEmail: { type: String, default: '' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null, index: true },
    approvedByEmail: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
    usedAt: { type: Date, default: null },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    rejectedByEmail: { type: String, default: '' },
    rejectedAt: { type: Date, default: null },
    reason: { type: String, trim: true, maxlength: 1000, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    requestId: { type: String, default: '' },
  },
  { timestamps: true }
);

adminApprovalRequestSchema.index({ type: 1, targetId: 1, status: 1 });

export const AdminApprovalRequest = adminConn.model('AdminApprovalRequest', adminApprovalRequestSchema);
