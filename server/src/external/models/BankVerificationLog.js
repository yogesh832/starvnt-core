import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.BankVerificationLogs — Audit logs and idempotency for bank account verification.
 * Spec §6, §7, §8, §18, §19, §20:
 * Stores verification_id, vendor_id, bank_account_id, provider, transaction details,
 * name match status, status transitions, and audit timestamps.
 * Strictly used for verification — NEVER for payout or settlement.
 */
const bankVerificationLogSchema = new Schema(
  {
    verificationId: { type: String, required: true, unique: true, index: true },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'VendorOrganization',
      required: true,
      index: true,
    },
    bankAccountId: { type: String, trim: true, default: '' },
    bankFingerprint: { type: String, default: '' },
    provider: { type: String, trim: true, default: 'RAZORPAY' },
    providerTransactionId: { type: String, trim: true, default: '' },
    verificationReference: { type: String, trim: true, default: '', index: true },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    accountHolderName: { type: String, trim: true, required: true },
    submittedAccountNumber: { type: String, trim: true, required: true },
    ifsc: { type: String, trim: true, required: true, uppercase: true },
    verificationStatus: {
      type: String,
      enum: [
        'NOT_VERIFIED',
        'VERIFICATION_REQUESTED',
        'PROCESSING',
        'VERIFIED',
        'FAILED',
        'PENDING',
      ],
      default: 'PROCESSING',
      index: true,
    },
    nameMatchStatus: {
      type: String,
      enum: ['EXACT', 'HIGH', 'MEDIUM', 'LOW', 'MISMATCH', 'NONE'],
      default: 'NONE',
    },
    providerResponse: { type: Schema.Types.Mixed, default: null },
    requestedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    failureReason: { type: String, trim: true, default: '' },
    requestedBy: { type: String, trim: true, default: 'VENDOR' },
  },
  { timestamps: true }
);

// Only the new Razorpay provider participates; legacy audit records are unchanged.
bankVerificationLogSchema.index({ vendor: 1, provider: 1 }, { unique: true, partialFilterExpression: { provider: 'RAZORPAY', verificationStatus: 'PROCESSING' } });

export const BankVerificationLog = externalConn.model(
  'BankVerificationLog',
  bankVerificationLogSchema
);
