import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * AdminDB.CoreBooking — Authoritative Platform Booking Contract (Spec §2, §11, §12).
 *
 * Core Platform owns authoritative business truth:
 * - Booking confirmation
 * - Payment verification (PAYMENT_VERIFIED)
 * - Completion validation (COMPLETION_VERIFIED)
 * - Settlement eligibility & release (SETTLEMENT_ELIGIBLE, SETTLED)
 *
 * Vendor frontend/OS cannot declare payment, completion or settlement truth directly.
 */
const coreBookingSchema = new Schema(
  {
    bookingReference: {
      type: String,
      unique: true,
      index: true,
      default: () => `BK-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`,
    },
    quoteId: {
      type: String,
      index: true,
    },
    opportunityId: {
      type: String,
      index: true,
    },
    vendorId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    vendorName: {
      type: String,
      default: '',
    },
    customerId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      default: '',
    },
    serviceName: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      default: 'Photography',
    },
    eventDate: {
      type: String,
      required: true,
      index: true, // YYYY-MM-DD
    },
    serviceLocation: {
      address: { type: String, default: '' },
      locality: { type: String, default: '' },
      city: { type: String, default: 'Kolkata' },
      coordinates: { lat: Number, lng: Number },
    },
    pricing: {
      basePrice: { type: Number, default: 0 },
      travelFee: { type: Number, default: 0 },
      equipmentFee: { type: Number, default: 0 },
      setupFee: { type: Number, default: 0 },
      additionalFee: { type: Number, default: 0 },
      totalAmount: { type: Number, default: 0 },
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    bookingStatus: {
      type: String,
      enum: ['CONFIRMED', 'CANCELLED', 'FAILED'],
      default: 'CONFIRMED',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAYMENT_VERIFIED', 'REFUNDED'],
      default: 'PENDING',
      index: true,
    },
    executionStatus: {
      type: String,
      enum: [
        'NOT_STARTED',
        'SERVICE_SCHEDULED',
        'SERVICE_STARTED',
        'COMPLETION_SUBMITTED',
        'COMPLETION_VERIFIED',
      ],
      default: 'NOT_STARTED',
      index: true,
    },
    settlementStatus: {
      type: String,
      enum: ['NOT_ELIGIBLE', 'SETTLEMENT_ELIGIBLE', 'SETTLEMENT_HOLD', 'SETTLED'],
      default: 'NOT_ELIGIBLE',
      index: true,
    },
    completionEvidence: [
      {
        submittedBy: String,
        submittedAt: { type: Date, default: Date.now },
        deliverablesUrl: { type: String, default: '' },
        checklist: [
          {
            item: String,
            checked: Boolean,
          },
        ],
        notes: { type: String, default: '' },
      },
    ],
    validationAudit: {
      verifiedBy: { type: String, default: null },
      verifiedAt: { type: Date, default: null },
      notes: { type: String, default: '' },
    },
    settlementDetails: {
      settledBy: { type: String, default: null },
      settledAt: { type: Date, default: null },
      amount: { type: Number, default: 0 },
      transactionReference: { type: String, default: '' },
    },
    failureAudit: {
      failedBy: { type: String, default: null },
      failedAt: { type: Date, default: null },
      reason: { type: String, default: '' },
    },
    disputes: [
      {
        reportedBy: { type: String, enum: ['CUSTOMER', 'VENDOR', 'SYSTEM'] },
        reportedAt: { type: Date, default: Date.now },
        issueType: { type: String, default: 'SERVICE_FAILURE' },
        description: { type: String, required: true },
        status: { 
          type: String, 
          enum: ['UNDER_REVIEW', 'RESOLUTION_PROPOSED', 'RESOLVED'], 
          default: 'UNDER_REVIEW' 
        },
        resolution: {
          decision: { 
            type: String, 
            enum: ['SERVICE_ACCEPTED', 'VENDOR_SETTLEMENT', 'PARTIAL_SETTLEMENT', 'REFUND', 'PARTIAL_REFUND', 'REPLACEMENT', 'OTHER_REMEDY'] 
          },
          decidedBy: { type: String },
          decidedAt: { type: Date },
          notes: { type: String },
          refundAmount: { type: Number, default: 0 },
          settlementAmount: { type: Number, default: 0 }
        }
      }
    ],
  },
  { timestamps: true }
);

export const CoreBooking = adminConn.model('CoreBooking', coreBookingSchema);
