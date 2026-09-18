import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.Quotes — Vendor Commercial Quotes (Spec §9, §10).
 *
 * Quote Lifecycle:
 * DRAFT -> SUBMITTED -> APPROVED / REJECTED / EXPIRED
 *
 * Invalid transitions are rejected server-side with INVALID_QUOTE_TRANSITION.
 */
const quoteSchema = new Schema(
  {
    quoteReference: {
      type: String,
      unique: true,
      index: true,
      default: () => `QT-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`,
    },
    opportunity: {
      type: Schema.Types.ObjectId,
      ref: 'Opportunity',
      index: true,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'VendorOrganization',
      required: true,
      index: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'ExternalUser',
      required: true,
      index: true,
    },
    vendorService: {
      type: Schema.Types.ObjectId,
      ref: 'VendorService',
      required: true,
    },
    serviceName: {
      type: String,
      required: true,
    },
    eventDate: {
      type: String,
      required: true,
      index: true,
    },
    serviceLocation: {
      address: { type: String, default: '' },
      locality: { type: String, default: '' },
      city: { type: String, default: 'Kolkata' },
      coordinates: { lat: Number, lng: Number },
    },
    pricingBreakdown: {
      basePrice: { type: Number, required: true },
      travelFee: { type: Number, default: 0 },
      equipmentFee: { type: Number, default: 0 },
      setupFee: { type: Number, default: 0 },
      additionalFee: { type: Number, default: 0 },
      totalAmount: { type: Number, required: true },
    },
    notes: {
      type: String,
      default: '',
    },
    validUntil: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days validity
    },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'EXPIRED'],
      default: 'DRAFT',
      index: true,
    },
    history: [
      {
        fromStatus: String,
        toStatus: String,
        changedBy: String,
        timestamp: { type: Date, default: Date.now },
        reason: String,
      },
    ],
  },
  { timestamps: true }
);

export const Quote = externalConn.model('Quote', quoteSchema);
