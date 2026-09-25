import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * AdminDB.CorePolicy — Central Policy Engine Configuration (Spec §28).
 *
 * Stores dynamic rules for:
 * - Minimum reservation amounts
 * - Cancellation and Refund rules
 * - Service-specific settlement conditions (e.g., Photography vs. Catering)
 */
const corePolicySchema = new Schema(
  {
    category: {
      type: String, // 'Global', 'Photography', 'Catering', etc.
      required: true,
      unique: true,
      index: true,
    },
    minimumReservationPercent: {
      type: Number,
      default: 10,
    },
    vendorCancellationPenaltyPercent: {
      type: Number,
      default: 0,
    },
    customerCancellationRefunds: {
      // Days before event -> % Refund
      type: Map,
      of: Number,
      default: { '30': 100, '14': 50, '7': 0 }
    },
    settlementCondition: {
      // What must happen for SETTLEMENT_ELIGIBLE
      type: String,
      enum: ['EVENT_DATE_PASSED', 'DELIVERABLES_UPLOADED', 'MANUAL_APPROVAL_REQUIRED'],
      default: 'EVENT_DATE_PASSED'
    },
    settlementDelayDays: {
      type: Number,
      default: 0,
    },
    updatedBy: {
      type: String,
      default: 'SYSTEM',
    }
  },
  { timestamps: true }
);

export const CorePolicy = adminConn.model('CorePolicy', corePolicySchema);
