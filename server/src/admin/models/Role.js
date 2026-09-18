import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';
import { invalidPermissions } from '../constants/permissions.js';

const { Schema } = mongoose;

/**
 * AdminDB.Roles — extensibility container for FUTURE roles
 * (e.g. OPERATIONS_ADMIN, REVENUE_ADMIN). Not wired into authentication in
 * V1: AdminUser.role remains ADMIN | SUPER_ADMIN. Seeded here only so new
 * roles can later bundle permission sets without schema changes.
 */
const roleSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
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
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Role = adminConn.model('Role', roleSchema);
