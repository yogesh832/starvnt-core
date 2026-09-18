import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.PortfolioItems — Vendor Evidence of Capability (Spec §7, §8, Golden Test M).
 *
 * "The portfolio is evidence of capability, not decoration.
 * Vendor onboarding must support bulk upload and structured organization."
 *
 * Lifecycle:
 * UPLOADED -> PROCESSING -> VENDOR_REVIEW -> PUBLISHED -> VERIFIED -> (OPTIONAL) BOOKING_PROVEN
 */
const portfolioItemSchema = new Schema(
  {
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'VendorOrganization',
      required: true,
      index: true,
    },
    vendorService: {
      type: Schema.Types.ObjectId,
      ref: 'VendorService',
      index: true,
    },
    mediaType: {
      type: String,
      enum: ['IMAGE', 'VIDEO', 'ALBUM', 'REEL', 'HIGHLIGHT_FILM', 'FULL_EVENT'],
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
    },
    thumbnailUrl: {
      type: String,
      default: '',
    },
    originalFilename: {
      type: String,
      default: '',
    },
    mimeType: {
      type: String,
      default: '',
    },
    sizeBytes: {
      type: Number,
      default: 0,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    projectName: {
      type: String,
      default: '',
      index: true,
    },
    title: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    eventType: {
      type: String,
      default: 'Wedding',
      index: true,
    },
    style: {
      type: String,
      default: 'Candid',
      index: true,
    },
    location: {
      venue: { type: String, default: '' },
      locality: { type: String, default: '' },
      city: { type: String, default: 'Kolkata' },
      coordinates: { lat: Number, lng: Number },
    },
    eventDate: {
      type: Date,
    },
    deliverableType: {
      type: String,
      default: 'Digital Delivery',
    },
    tags: [
      {
        type: String,
        index: true,
      },
    ],
    isFeatured: {
      type: Boolean,
      default: false,
    },
    visibility: {
      type: String,
      enum: ['PUBLIC', 'PRIVATE', 'UNLISTED'],
      default: 'PUBLIC',
    },
    status: {
      type: String,
      enum: [
        'UPLOADED',
        'PROCESSING',
        'VENDOR_REVIEW',
        'PUBLISHED',
        'VERIFIED',
        'BOOKING_PROVEN',
      ],
      default: 'UPLOADED',
      index: true,
    },
    provenBookingId: {
      type: String,
      default: null,
      index: true,
    },
    verifiedBy: {
      type: String,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Location-linked evidence index (Spec §7)
portfolioItemSchema.index({ vendor: 1, 'location.locality': 1, 'location.venue': 1 });

export const PortfolioItem = externalConn.model('PortfolioItem', portfolioItemSchema);
