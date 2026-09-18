import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * AdminDB.IdempotencyKeys — Centralized deduplication guard (Spec §12, §17).
 * Prevents duplicate bookings, duplicate approvals, and double processing.
 */
const idempotencyKeySchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    scope: {
      type: String,
      required: true,
      index: true, // e.g. 'QUOTE_APPROVAL', 'BOOKING_REQUEST', 'PAYMENT_CONFIRMATION'
    },
    status: {
      type: String,
      enum: ['STARTED', 'COMPLETED', 'FAILED'],
      default: 'STARTED',
      index: true,
    },
    result: {
      type: Schema.Types.Mixed,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day TTL
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

export const IdempotencyKey = adminConn.model('IdempotencyKey', idempotencyKeySchema);
