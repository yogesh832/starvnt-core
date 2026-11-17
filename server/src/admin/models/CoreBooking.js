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
    customerBookingId: { type: Schema.Types.ObjectId },
    projectionSyncPending: { type: Boolean, default: false, index: true },
    reservationId: { type: Schema.Types.ObjectId },
    source: { type: String, enum: ['STARVNT'], default: 'STARVNT', immutable: true },
    cancellation: { actor: String, at: Date, reason: String, refundStatus: String },
    history: [{ actor: String, action: String, at: Date, reason: String }],
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
    customerEvent: { type: Schema.Types.ObjectId, default: null, index: true },
    vendorId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    vendorService: { type: Schema.Types.ObjectId, default: null },
    assignedResources: [{ type: Schema.Types.ObjectId }],
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
      default: '',
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
    taxSummary: {
      taxableValue: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 },
      gstPercent: { type: Number, default: 0 },
      gstAmount: { type: Number, default: 0 },
      tdsPercent: { type: Number, default: 0 },
      tdsAmount: { type: Number, default: 0 },
      vendorPayable: { type: Number, default: 0 },
      invoiceNumber: { type: String, default: '' },
      invoiceIssuedAt: { type: Date, default: null },
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    paymentSummary: {
      advancePercentage: { type: Number, default: null },
      advanceAmount: { type: Number, default: 0 },
      paidAmount: { type: Number, default: 0 },
      balanceAmount: { type: Number, default: 0 },
      provider: { type: String, default: 'razorpay' },
      providerOrderId: { type: String, default: '' },
      providerPaymentId: { type: String, default: '' },
      couponCode: { type: String, default: '' },
      couponDiscountAmount: { type: Number, default: 0 },
      paidAt: { type: Date, default: null },
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
        'CHECKED_IN',
        'SERVICE_STARTED',
        'COMPLETION_SUBMITTED',
        'COMPLETION_VERIFIED',
      ],
      default: 'NOT_STARTED',
      index: true,
    },
    protectionStatus: {
      type: String,
      enum: [
        'NONE',
        'AT_RISK',
        'PROTECTED',
        'ISSUE_REPORTED',
        'UNDER_REVIEW',
        'RESOLUTION_PROPOSED',
        'RESOLVED',
      ],
      default: 'NONE',
      index: true,
    },
    settlementStatus: {
      type: String,
      enum: ['NOT_ELIGIBLE', 'SETTLEMENT_ELIGIBLE', 'SETTLEMENT_HOLD', 'SETTLED'],
      default: 'NOT_ELIGIBLE',
      index: true,
    },
    financialPolicySnapshot: { type: Schema.Types.Mixed, default: null },
    commercialSnapshot: { type: Schema.Types.Mixed, default: null },
    replacementDecision: { type: Schema.Types.Mixed, default: null },
    requirementSnapshot: { type: Schema.Types.Mixed, default: null },
    workflowVersion: { type: Number, default: 0 },
    execution: {
      checkedInAt: Date, startedAt: Date, submittedAt: Date,
      milestones: [{ key: String, detail: String, at: Date, actor: String, correctedAt: Date, correctionReason: String, corrections: [{ previousDetail: String, detail: String, actor: String, at: Date, reason: String }] }],
      customerAcknowledgement: { actor: String, at: Date, notes: String },
    },
    completionPolicySnapshot: { type: Schema.Types.Mixed, default: null },
    operationReceipts: [{ key: String, hash: String, action: String, actor: String, at: Date }],
    workflowEvents: [{ key: String, action: String, actor: String, actorType: String, at: Date, reason: String, fromState: Schema.Types.Mixed, toState: Schema.Types.Mixed, dispatchedAt: Date }],
    financeOperations: [{
      operationId: String, key: String, kind: { type: String, enum: ['REFUND', 'SETTLEMENT'] }, amount: Number,
      status: { type: String, enum: ['REQUESTED', 'APPROVED', 'PROCESSING', 'CONFIRMED', 'FAILED', 'UNDER_REVIEW', 'REJECTED'] },
      method: { type: String, enum: ['MANUAL', 'RAZORPAY'] }, reason: String, requestedBy: String, requestedAt: Date,
      approvedBy: String, approvedAt: Date, processedBy: String, processedAt: Date,
      evidence: [{ assetId: String, url: String, note: String }], reference: String, providerId: String,
      reconciledBy: String, confirmedAt: Date, lastError: String, ledgerPostedAt: Date,
    }],
    payoutReviewAt: { type: Date, default: null, index: true },
    completionEvidence: [
      {
        submittedBy: String,
        submittedAt: { type: Date, default: Date.now },
        deliverablesUrl: { type: String, default: '' },
        photos: [{ type: String }],
        videos: [{ type: String }],
        files: [
          {
            assetId: String,
            url: { type: String, default: '' },
            thumbnailUrl: { type: String, default: '' },
            publicId: { type: String, default: '' },
            resourceType: { type: String, default: 'IMAGE' },
            name: { type: String, default: '' },
            size: { type: String, default: '' },
          },
        ],
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
      grossAmount: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 },
      gstAmount: { type: Number, default: 0 },
      tdsAmount: { type: Number, default: 0 },
      vendorPayable: { type: Number, default: 0 },
      transactionReference: { type: String, default: '' },
    },
    failureAudit: {
      failedBy: { type: String, default: null },
      failedAt: { type: Date, default: null },
      reason: { type: String, default: '' },
    },
    disputes: [
      {
        requestKey: String, requestHash: String, actorId: String, assignedTo: String, assignedAt: Date,
        evidence: [{ actor: String, actorType: String, at: Date, note: String, files: [{ assetId: String, url: String, note: String }] }],
        response: { actor: String, at: Date, notes: String },
        proposal: { actor: String, at: Date, decision: String, notes: String, refundAmount: Number, settlementAmount: Number },
        history: [{ actor: String, at: Date, action: String, reason: String }],
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
  { timestamps: true, optimisticConcurrency: true }
);

coreBookingSchema.index({ customerBookingId: 1 }, { unique: true, partialFilterExpression: { customerBookingId: { $type: 'objectId' } } });
coreBookingSchema.index({ reservationId: 1 }, { unique: true, partialFilterExpression: { reservationId: { $type: 'objectId' } } });
export const CoreBooking = adminConn.model('CoreBooking', coreBookingSchema);
