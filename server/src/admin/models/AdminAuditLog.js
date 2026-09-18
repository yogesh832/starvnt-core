import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * AdminDB.AdminAuditLogs — immutable record of every sensitive admin action.
 * Captures WHO / WHAT / WHEN / FROM_STATE / TO_STATE / WHY / SOURCE /
 * REFERENCE / IP / device / idempotency key.
 */
const adminAuditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null, index: true },
    actorEmail: { type: String, default: '' }, // preserved even if actor is deleted
    action: { type: String, required: true, index: true }, // e.g. ADMIN_LOGIN_SUCCESS, ADMIN_CREATE, PERMISSIONS_UPDATED
    targetType: { type: String, default: '' },
    targetId: { type: String, default: '' },
    fromState: { type: Schema.Types.Mixed, default: null },
    toState: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, default: '' },
    source: { type: String, enum: ['ADMIN_API', 'SEED', 'SYSTEM'], default: 'ADMIN_API' },
    reference: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

adminAuditLogSchema.index({ actor: 1, createdAt: -1 });
adminAuditLogSchema.index({ action: 1, createdAt: -1 });

export const AdminAuditLog = adminConn.model('AdminAuditLog', adminAuditLogSchema);
