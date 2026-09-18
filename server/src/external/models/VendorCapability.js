import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.VendorCapabilities — Category-specific capability and style attributes (Spec §3, §6, §10).
 */
const vendorCapabilitySchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, index: true },
    vendorService: { type: Schema.Types.ObjectId, ref: 'VendorService', required: true, index: true },
    styles: [{ type: String, trim: true }], // e.g. ['Candid', 'Traditional', 'Drone 4K', 'Cinematic']
    format: { type: String, trim: true, default: 'Full day' }, // e.g. 'Full day', 'Half day', '4 hours'
    teamSize: { type: Number, default: 2, min: 1 },
    simultaneousEventLimit: { type: Number, default: 1, min: 1 },
    equipment: [{ type: String, trim: true }],
    categoryAttributes: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

export const VendorCapability = externalConn.model('VendorCapability', vendorCapabilitySchema);
