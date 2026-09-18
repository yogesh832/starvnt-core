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
        'VERIFIED',
        'ELIGIBLE',
        'ACTIVE',
        'REJECTED',
      ],
      default: 'PENDING',
      index: true,
    },
    activationState: {
      type: String,
      enum: [
        'DRAFT',
        'REGISTERED',
        'PROFILE_INCOMPLETE',
        'VERIFICATION_PENDING',
        'VERIFIED',
        'ELIGIBLE',
        'ACTIVE',
      ],
      default: 'REGISTERED',
      index: true,
    },
    isCommerciallyActive: { type: Boolean, default: false, index: true },
    location: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, default: '' },
    verification: {
      isVerified: { type: Boolean, default: false },
      verifiedAt: { type: Date, default: null },
      verifiedBy: { type: Schema.Types.ObjectId, default: null },
      documentType: { type: String, default: null },
      documentRef: { type: String, default: null },
      notes: { type: String, default: '' },
    },
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const VendorOrganization = externalConn.model('VendorOrganization', vendorOrganizationSchema);
