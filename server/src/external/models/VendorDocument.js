import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.VendorDocuments — Authentic vendor business documents and KYC verification records.
 * Spec §3, §6, §17: Controlled onboarding storage for GST, PAN, banking, and business licenses.
 */
const vendorDocumentSchema = new Schema(
  {
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'VendorOrganization',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['GST', 'PAN', 'BANK_PROOF', 'BUSINESS_REG', 'INSURANCE', 'ID_PROOF', 'OTHER'],
      default: 'OTHER',
      index: true,
    },
    documentNumber: {
      type: String,
      trim: true,
      default: '',
    },
    fileName: {
      type: String,
      trim: true,
      default: '',
    },
    fileUrl: {
      type: String,
      trim: true,
      default: '',
    },
    fileSize: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED'],
      default: 'SUBMITTED',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    expiryDate: {
      type: String,
      default: '',
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export const VendorDocument = externalConn.model('VendorDocument', vendorDocumentSchema);
