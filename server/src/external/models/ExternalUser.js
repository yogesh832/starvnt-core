import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.Customers / ExternalUserDB.Vendors
 *
 * ONE collection, ONE authentication flow for both external account types.
 * `accountType` selects the product surface (Customer App vs Vendor OS) —
 * it is NOT a security role: an external user can never become an internal
 * Admin from this database, by design (separate database, separate secrets,
 * separate token audience).
 */
const externalUserSchema = new Schema(
  {
    identityVerification: {
      email: { digest: String, method: String, verifiedAt: Date },
      phone: { digest: String, method: String, verifiedAt: Date },
      googleId: { digest: String, method: String, verifiedAt: Date },
    },
    privacy: { deletionRequestedAt: Date, anonymizedAt: Date, retentionReason: String, retainedUntil: Date },
    sourceAttribution: {
      entryPoint: { type: String, immutable: true },
      authenticationMethod: { type: String, immutable: true },
      capturedAt: { type: Date, immutable: true },
      // Referral codes must be resolved by a future server attribution workflow.
      referralSource: { type: String, default: null, immutable: true },
    },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    phone: { type: String, trim: true, maxlength: 24, index: true },
    phoneIdentityKey: String,
    googleIdentityKey: String,
    passwordHash: { type: String, required: false, select: false, default: null },
    googleId: { type: String, sparse: true, index: true, default: null },
    avatarUrl: { type: String, trim: true, default: '' },
    authProvider: {
      type: String,
      enum: ['EMAIL', 'GOOGLE', 'PHONE'],
      default: 'EMAIL',
      index: true,
    },
    isAppReviewAccount: { type: Boolean, default: false, select: false },
    accountType: {
      type: String,
      enum: ['CUSTOMER', 'VENDOR'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'DISABLED', 'SUSPENDED'],
      default: 'ACTIVE',
      index: true,
    },
    isFlagged: { type: Boolean, default: false, index: true },
    flagReason: { type: String, default: '' },
    flaggedAt: { type: Date, default: null },
    isRestricted: { type: Boolean, default: false, index: true },
    restrictedUntil: { type: Date, default: null },
    restrictionReason: { type: String, default: '' },
    // Historical role list. Sign-in uses accountType as the primary product
    // surface; do not use these roles to switch Customer/Vendor at login.
    // Older documents have no `roles` — see userRoles().
    roles: { type: [{ type: String, enum: ['CUSTOMER', 'VENDOR'] }], default: undefined, index: true },
    vendorOrganization: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

externalUserSchema.pre('validate', function () {
  if ((this.isNew || this.isModified('phone')) && this.phone) this.phoneIdentityKey = this.phone;
  if ((this.isNew || this.isModified('googleId')) && this.googleId) this.googleIdentityKey = this.googleId;
});
externalUserSchema.index({ phoneIdentityKey: 1 }, { unique: true, partialFilterExpression: { phoneIdentityKey: { $type: 'string' } } });
externalUserSchema.index({ googleIdentityKey: 1 }, { unique: true, partialFilterExpression: { googleIdentityKey: { $type: 'string' } } });

/** Roles this identity holds (legacy users: just their accountType). */
export function userRoles(user) {
  return user?.roles?.length ? [...user.roles] : user?.accountType ? [user.accountType] : [];
}

/** The surface this request/session is acting as (set per session, never persisted). */
export function activeAccountType(user) {
  return user?.$locals?.activeAccountType || user?.accountType;
}

externalUserSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    fullName: this.fullName,
    email: this.email,
    phone: this.phone,
    avatarUrl: this.avatarUrl,
    authProvider: this.authProvider,
    accountType: activeAccountType(this),
    roles: userRoles(this),
    status: this.status,
    isFlagged: this.isFlagged,
    flagReason: this.flagReason,
    flaggedAt: this.flaggedAt,
    isRestricted: this.isRestricted,
    restrictedUntil: this.restrictedUntil,
    restrictionReason: this.restrictionReason,
    vendorOrganization: this.vendorOrganization,
    createdAt: this.createdAt,
    verification: {
      email: /DEVELOPMENT|TEST/.test(this.identityVerification?.email?.method || '') ? null : this.identityVerification?.email?.verifiedAt || null,
      phone: /DEVELOPMENT|TEST/.test(this.identityVerification?.phone?.method || '') ? null : this.identityVerification?.phone?.verifiedAt || null,
      name: 'SELF_REPORTED',
    },
    sourceAttribution: this.sourceAttribution,
  };
};

export const ExternalUser = externalConn.model('ExternalUser', externalUserSchema);
