import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.VendorOrganizations — business identity & activation lifecycle.
 * Spec §3, §4:
 * Activation Lifecycle:
 * DRAFT -> REGISTERED -> PROFILE_INCOMPLETE -> VERIFICATION_PENDING -> VERIFIED -> ELIGIBLE -> ACTIVE
 */
const vendorOrganizationSchema = new Schema(
  {
    businessName: { type: String, required: true, trim: true, maxlength: 160 },
    brandName: { type: String, trim: true, default: '', maxlength: 160 },
    category: { type: String, trim: true, default: '' }, // Photography, Catering, Venue, Decoration…
    owner: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true, index: true },
    status: {
      type: String,
      enum: [
        'DRAFT',
        'REGISTERED',
        'PENDING',
        'PROFILE_INCOMPLETE',
        'VERIFICATION_PENDING',
        'UNDER_REVIEW',
        'VERIFIED',
        'ELIGIBLE',
        'ACTIVE',
        'REJECTED',
        'SUSPENDED',
      ],
      default: 'PENDING',
      index: true,
    },
    isFlagged: { type: Boolean, default: false, index: true },
    flagReason: { type: String, default: '' },
    flaggedAt: { type: Date, default: null },
    isRestricted: { type: Boolean, default: false, index: true },
    restrictedUntil: { type: Date, default: null },
    restrictionReason: { type: String, default: '' },
    activationState: {
      type: String,
      enum: [
        'DRAFT',
        'REGISTERED',
        'PROFILE_INCOMPLETE',
        'VERIFICATION_PENDING',
        'UNDER_REVIEW',
        'REJECTED',
        'SUSPENDED',
        'VERIFIED',
        'ELIGIBLE',
        'ACTIVE',
      ],
      default: 'REGISTERED',
      index: true,
    },
    isCommerciallyActive: { type: Boolean, default: false, index: true },
    activationHistory: [{ actor: String, role: String, at: Date, action: String, reason: String, fromState: String, toState: String, idempotencyKey: String }],
    activationReview: { status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'INFORMATION_REQUESTED', 'SUSPENDED'], default: 'PENDING' }, reason: String, requestedAt: Date, reviewedAt: Date, reviewedBy: Schema.Types.ObjectId },
    isProfileCompleted: { type: Boolean, default: false, index: true },
    verificationLadderLevel: {
      type: String,
      enum: [
        'SELF_DECLARED',
        'PHONE_VERIFIED',
        'KYC_VERIFIED',
        'DOCUMENT_VERIFIED',
        'PORTFOLIO_VERIFIED',
        'BOOKING_VERIFIED',
        'STARVNT_VERIFIED',
      ],
      default: 'SELF_DECLARED',
      index: true,
    },
    location: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, default: '' },
    profilePicUrl: { type: String, trim: true, default: '' },
    verification: {
      isVerified: { type: Boolean, default: false },
      verifiedAt: { type: Date, default: null },
      verifiedBy: { type: Schema.Types.ObjectId, default: null },
      documentType: { type: String, default: null },
      documentRef: { type: String, default: null },
      notes: { type: String, default: '' },
    },
    manualReview: {
      status: { type: String, enum: ['NONE', 'NEEDS_REVIEW', 'IN_REVIEW', 'APPROVED', 'REJECTED'], default: 'NONE', index: true },
      reason: { type: String, trim: true, default: '' },
      provider: { type: String, trim: true, default: '' },
      documentRef: { type: Schema.Types.ObjectId, ref: 'VendorDocument', default: null },
      requestedAt: { type: Date, default: null },
      assignedTo: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
      reviewedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
      reviewedAt: { type: Date, default: null },
      notes: { type: String, trim: true, default: '' },
    },
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },
    googlePlaceId: { type: String, default: null, trim: true },
    workingHours: {
      type: Schema.Types.Mixed,
      default: {
        Monday: { isOpen: true, hours: '9 AM – 7 PM' },
        Tuesday: { isOpen: true, hours: '9 AM – 7 PM' },
        Wednesday: { isOpen: true, hours: '9 AM – 7 PM' },
        Thursday: { isOpen: true, hours: '9 AM – 7 PM' },
        Friday: { isOpen: true, hours: '9 AM – 9 PM' },
        Saturday: { isOpen: true, hours: 'Full day' },
        Sunday: { isOpen: false, hours: 'Off' },
      },
    },
  },
  { timestamps: true }
);

export const VendorOrganization = externalConn.model('VendorOrganization', vendorOrganizationSchema);
