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
    verificationSource: {
      type: String,
      enum: ['MANUAL', 'GSTIN_API', 'PAN_API'],
      default: 'MANUAL',
      index: true,
    },
    verificationResult: {
      matched: { type: Boolean, default: false },
      confidence: { type: String, enum: ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'EXACT'], default: 'NONE' },
      legalName: { type: String, trim: true, default: '' },
      tradeName: { type: String, trim: true, default: '' },
      registeredName: { type: String, trim: true, default: '' },
      pan: { type: String, trim: true, default: '' },
      panStatus: { type: String, trim: true, default: '' },
      entityType: { type: String, trim: true, default: '' },
      taxpayerType: { type: String, trim: true, default: '' },
      gstinStatus: { type: String, trim: true, default: '' },
      registrationDate: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '' },
      raw: { type: Schema.Types.Mixed, default: null },
      checkedAt: { type: Date, default: null },
      error: { type: String, trim: true, default: '' },
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
