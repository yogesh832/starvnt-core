import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';
import { quoteVersionRecord } from '../../common/quoteVersions.js';

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
    creationRequestKey: { type: String, select: false, immutable: true },
    creationRequestHash: { type: String, select: false, immutable: true },
    creationRequestActor: { type: String, select: false, immutable: true },
    creationEnquiryUpdatedAt: { type: Date, immutable: true },
    creationEffects: { type: new Schema({
      state: { type: String, enum: ['PENDING', 'ENQUEUED', 'COMPLETED', 'SUPERSEDED'] },
      snapshot: { type: Schema.Types.Mixed, immutable: true }, hash: { type: String, immutable: true }, completedAt: Date, lastQueueAttemptAt: Date,
    }, { _id: false }), select: false },
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
    bookingReview: { status: { type: String, enum: ['CONFLICT_REVIEW', 'RESOLVED'] }, reason: String, updatedAt: Date },
    commercialSnapshot: { type: Schema.Types.Mixed, default: null },
    commercialVersions: [{ version: Number, contentHash: String, content: Schema.Types.Mixed, recordedAt: Date, provenance: String }],
    category: { type: String, default: '' },
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
    advancePayment: {
      percentage: { type: Number, default: null },
      policySnapshot: { type: Schema.Types.Mixed, default: null },
      amount: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ['NOT_STARTED', 'ORDER_CREATED', 'PROCESSING', 'VERIFIED', 'FAILED'],
        default: 'NOT_STARTED',
      },
      provider: { type: String, default: 'razorpay' },
      providerOrderId: { type: String, default: '' },
      providerPaymentId: { type: String, default: '' },
      couponCode: { type: String, default: '' },
      couponDiscountAmount: { type: Number, default: 0 },
      originalAdvanceAmount: { type: Number, default: 0 },
      couponUsageRecorded: { type: Boolean, default: false },
      paidAt: { type: Date, default: null },
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
  { timestamps: true, optimisticConcurrency: true }
);

quoteSchema.index({ vendor: 1, creationRequestKey: 1 }, { unique: true, partialFilterExpression: { creationRequestKey: { $type: 'string' } } });
quoteSchema.index({ vendor: 1, _id: -1 });
quoteSchema.index({ 'creationEffects.state': 1, 'creationEffects.lastQueueAttemptAt': 1, createdAt: 1, _id: 1 }, { partialFilterExpression: { 'creationEffects.state': 'PENDING' } });
quoteSchema.set('toJSON', { transform: (_doc, value) => { delete value.creationRequestKey; delete value.creationRequestHash; delete value.creationRequestActor; delete value.creationEffects; return value; } });
quoteSchema.pre('validate', async function () {
  const materialFields = ['vendor', 'customer', 'vendorService', 'serviceName', 'eventDate', 'serviceLocation', 'pricingBreakdown', 'notes', 'validUntil'];
  if (!this.isNew && this.commercialSnapshot && materialFields.some(field => this.isModified(field)) && !this.isModified('commercialSnapshot')) throw Object.assign(new Error('Material commercial changes require a new quote version.'), { code: 'IMMUTABLE_QUOTE_VERSION', statusCode: 409 });
  if (!this.isNew && this.isModified('commercialSnapshot') && !this.commercialSnapshot && await this.constructor.exists({ _id: this._id, commercialSnapshot: { $ne: null } })) throw Object.assign(new Error('Submitted commercial evidence cannot be cleared.'), { code: 'IMMUTABLE_QUOTE_VERSION', statusCode: 409 });
  if (!this.isNew && this.isModified('commercialVersions') && !this.isModified('commercialSnapshot')) throw Object.assign(new Error('Archived commercial versions cannot be edited.'), { code: 'IMMUTABLE_QUOTE_VERSION', statusCode: 409 });
  if (!this.isModified('commercialSnapshot') || !this.commercialSnapshot) return;
  const current = quoteVersionRecord(this);
  const previous = this.isNew ? null : await this.constructor.findById(this._id).lean();
  const versions = [...(previous?.commercialVersions || [])];
  if (previous?.commercialSnapshot && !versions.some(row => row.version === previous.commercialSnapshot.version)) versions.push(quoteVersionRecord(previous, 'LEGACY_CURRENT_RECOVERED_AT_REVISION'));
  const prior = versions.find(row => row.version === current.version);
  if ((prior && prior.contentHash !== current.contentHash) || !Number.isSafeInteger(current.version) || current.version < 1 || (previous?.commercialSnapshot && current.version !== previous.commercialSnapshot.version && current.version !== previous.commercialSnapshot.version + 1)) {
    throw Object.assign(new Error('Commercial content requires a new sequential quote version; submitted history cannot be overwritten.'), { code: 'IMMUTABLE_QUOTE_VERSION', statusCode: 409 });
  }
  if (!prior) versions.push(current);
  this.commercialVersions = versions;
});

export const Quote = externalConn.model('Quote', quoteSchema);
