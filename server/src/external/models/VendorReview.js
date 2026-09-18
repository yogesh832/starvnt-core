import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.VendorReviews — Authentic client reviews and ratings.
 * Strictly DB/API driven. Never seeded or hardcoded in frontend UI.
 */
const vendorReviewSchema = new Schema(
  {
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

export const VendorReview = externalConn.model('VendorReview', vendorReviewSchema);
