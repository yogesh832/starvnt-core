import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.ExternalSessions — refresh-token sessions for the EXTERNAL
 * domain only. Never accepted by the internal Admin API.
 */
const externalSessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

externalSessionSchema.index({ user: 1, revokedAt: 1 });

export const ExternalSession = externalConn.model('ExternalSession', externalSessionSchema);
