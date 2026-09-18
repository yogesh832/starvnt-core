import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';
import { invalidPermissions, ADMIN_ROLES } from '../constants/permissions.js';

const { Schema } = mongoose;

/**
 * AdminDB.AdminUsers — internal staff identities ONLY.
 *
 * Customers and Vendors are NEVER stored here, and an AdminUser can never
 * authenticate against the external API. `role`:
 *   - SUPER_ADMIN → bypasses per-permission checks (ALL_PERMISSIONS)
 *   - ADMIN       → exactly the permissions listed in `permissions[]`
 */
const adminUserSchema = new Schema(
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
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ADMIN_ROLES, default: 'ADMIN', index: true },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator(values) {
          return invalidPermissions(values).length === 0;
        },
        message: 'permissions contain values outside the catalog',
      },
    },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE', index: true },
    // MFA scaffolding — enforcement layers on top of these flags later.
    mfaEnabled: { type: Boolean, default: false },
    mfaRequired: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true }
);

adminUserSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    fullName: this.fullName,
    email: this.email,
    role: this.role,
    permissions: this.permissions,
    // SUPER_ADMIN effectively holds every permission.
    effectivePermissions: this.role === 'SUPER_ADMIN' ? ['*'] : this.permissions,
    status: this.status,
    mfaEnabled: this.mfaEnabled,
    mfaRequired: this.mfaRequired,
    createdAt: this.createdAt,
    lastLoginAt: this.lastLoginAt,
  };
};

export const AdminUser = adminConn.model('AdminUser', adminUserSchema);
