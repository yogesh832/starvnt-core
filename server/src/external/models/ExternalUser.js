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
    passwordHash: { type: String, required: false, select: false, default: null },
    googleId: { type: String, sparse: true, index: true, default: null },
    avatarUrl: { type: String, trim: true, default: '' },
    authProvider: {
      type: String,
      enum: ['EMAIL', 'GOOGLE', 'PHONE'],
      default: 'EMAIL',
      index: true,
    },
    accountType: {
      type: String,
      enum: ['CUSTOMER', 'VENDOR'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'DISABLED'],
      default: 'ACTIVE',
      index: true,
    },
    vendorOrganization: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

externalUserSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    fullName: this.fullName,
    email: this.email,
    phone: this.phone,
    avatarUrl: this.avatarUrl,
    authProvider: this.authProvider,
    accountType: this.accountType,
    status: this.status,
    vendorOrganization: this.vendorOrganization,
    createdAt: this.createdAt,
  };
};

export const ExternalUser = externalConn.model('ExternalUser', externalUserSchema);
