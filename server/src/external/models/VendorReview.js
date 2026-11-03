import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.VendorReviews — Authentic client reviews and ratings.
 * Strictly DB/API driven. Never seeded or hardcoded in frontend UI.
 */
const vendorReviewSchema = new Schema(
  {
    experienceKey: { type: String },
    source: { type: String, enum: ['STARVNT', 'VENDOR_PRIVATE'] },
    proofDigest: { type: String, select: false },
    experience: { type: Schema.Types.ObjectId },
    revision: { type: Number, default: 0 },
    criteria: { quality: Number, punctuality: Number, staff: Number, communication: Number },
    feedbackPermissions: { noticeVersion: String, ecosystem: { type: Boolean, default: false }, marketing: { type: Boolean, default: false }, channel: { type: String, default: 'NONE' }, withdrawnAt: Date, deletionRequestedAt: Date },
    reviewHistory: [{ actor: String, action: String, at: Date, reason: String, key: String, hash: String }],
    reports: [{ actor: String, reason: String, at: Date }],
    suspicionFlags: [String],
    photos: [{ publicId: String, resourceType: String, format: String }],
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'VendorOrganization',
      required: true,
      index: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'ExternalUser',
      default: null,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerEmail: {
      type: String,
      trim: true,
      default: '',
    },
    booking: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    bookingReference: {
      type: String,
      trim: true,
      default: '',
    },
    serviceName: {
      type: String,
      trim: true,
      default: 'Photography',
    },
    eventType: {
      type: String,
      trim: true,
      default: 'Wedding',
    },
    eventDate: {
      type: String,
      trim: true,
      default: '',
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    reviewText: {
      type: String,
      required: true,
      trim: true,
    },
    wouldRecommend: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: true,
    },
    vendorReply: {
      text: { type: String, trim: true, default: '' },
      repliedAt: { type: Date, default: null },
    },
    status: {
      type: String,
      enum: ['PUBLISHED', 'PENDING', 'HIDDEN'],
      default: 'PUBLISHED',
      index: true,
    },
  },
  { timestamps: true }
);

vendorReviewSchema.index({ experienceKey: 1 }, { unique: true, partialFilterExpression: { experienceKey: { $type: 'string' } } });

export const VendorReview = externalConn.model('VendorReview', vendorReviewSchema);
