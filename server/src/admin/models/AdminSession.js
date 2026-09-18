import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * AdminDB.AdminSessions — refresh-token sessions for the ADMIN domain only.
 * Disabling an admin revokes every active session server-side.
 */
const adminSessionSchema = new Schema(
  {
    admin: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

adminSessionSchema.index({ admin: 1, revokedAt: 1 });

export const AdminSession = adminConn.model('AdminSession', adminSessionSchema);
