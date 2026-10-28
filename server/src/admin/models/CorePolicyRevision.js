import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';

const { Schema } = mongoose;

const corePolicyRevisionSchema = new Schema({
  category: { type: String, required: true, trim: true, maxlength: 80, index: true },
  version: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'REJECTED'], default: 'DRAFT', index: true },
  values: { type: Schema.Types.Mixed, required: true },
  contentHash: { type: String, required: true },
  submittedHash: { type: String, default: '' },
  baseActiveVersion: { type: Number, default: 0 },
  effectiveFrom: { type: Date, required: true, index: true },
  reason: { type: String, required: true, maxlength: 500 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true },
  createdByEmail: { type: String, required: true, lowercase: true },
  submittedAt: { type: Date, default: null },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  approvedByEmail: { type: String, default: '' },
  approvedAt: { type: Date, default: null },
  rejectedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  rejectedByEmail: { type: String, default: '' },
  rejectedAt: { type: Date, default: null },
  decisionReason: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

corePolicyRevisionSchema.index({ category: 1, version: 1 }, { unique: true });
corePolicyRevisionSchema.index({ category: 1, status: 1, effectiveFrom: 1 });

export const CorePolicyRevision = adminConn.model('CorePolicyRevision', corePolicyRevisionSchema);
