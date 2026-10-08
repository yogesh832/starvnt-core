import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.VendorFinancialProfiles — Decoupled PAN, GST, and Bank Account financial profile.
 * Spec §1, §2, §3, §5, §11, §14, §17:
 * - PAN: Required for all vendors.
 * - GST: Mandatory flag (YES/NO). Optional registration. GST missing does NOT block vendor.
 * - BANK: Independent module from GST. ₹0.02 Penny Drop verification.
 * - Financial Profile maintains independence between PAN, GST and Bank Account.
 */
const vendorFinancialProfileSchema = new Schema(
  {
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'VendorOrganization',
      required: true,
      unique: true,
      index: true,
    },
    pan: {
      panNumber: { type: String, trim: true, default: '', uppercase: true },
      verificationStatus: {
        type: String,
        enum: ['NOT_VERIFIED', 'VERIFIED', 'FAILED'],
        default: 'NOT_VERIFIED',
      },
      legalName: { type: String, trim: true, default: '' },
      entityType: { type: String, trim: true, default: '' },
      verifiedAt: { type: Date, default: null },
      raw: { type: Schema.Types.Mixed, default: null },
    },
    gst: {
      isRegistered: { type: Boolean, required: true, default: false },
      gstin: { type: String, trim: true, default: '', uppercase: true },
      verificationStatus: {
        type: String,
        enum: ['NOT_VERIFIED', 'VERIFIED', 'FAILED', 'NOT_APPLICABLE'],
        default: 'NOT_APPLICABLE',
      },
      legalName: { type: String, trim: true, default: '' },
      tradeName: { type: String, trim: true, default: '' },
      gstinStatus: { type: String, trim: true, default: '' },
      verifiedAt: { type: Date, default: null },
      raw: { type: Schema.Types.Mixed, default: null },
    },
    bankAccount: {
      accountHolderName: { type: String, trim: true, default: '' },
      accountNumber: { type: String, trim: true, default: '' },
      ifsc: { type: String, trim: true, default: '', uppercase: true },
      bankName: { type: String, trim: true, default: '' },
      accountType: {
        type: String,
        enum: ['SAVINGS', 'CURRENT', 'CC_OD', 'OTHER'],
        default: 'SAVINGS',
      },
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
        default: 'NOT_VERIFIED',
      },
      nameMatchStatus: {
        type: String,
        enum: ['EXACT', 'HIGH', 'MEDIUM', 'LOW', 'MISMATCH', 'NONE'],
        default: 'NONE',
      },
      lastVerifiedAt: { type: Date, default: null },
      failureReason: { type: String, trim: true, default: '' },
    },
    isSettlementEligible: { type: Boolean, default: false, index: true },
    wallet: {
      availableBalance: { type: Number, default: 0 },
      pendingBalance: { type: Number, default: 0 },
      frozenBalance: { type: Number, default: 0 },
      isFrozen: { type: Boolean, default: false, index: true },
      freezeReason: { type: String, trim: true, default: '' },
      frozenAt: { type: Date, default: null },
      unfrozenAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

export const VendorFinancialProfile = externalConn.model(
  'VendorFinancialProfile',
  vendorFinancialProfileSchema
);
