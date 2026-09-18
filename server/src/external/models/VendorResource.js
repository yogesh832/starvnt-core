import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.VendorResources — Team, equipment, inventory, vehicles, spaces (Spec §6, §7).
 */
const vendorResourceSchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, index: true },
    type: {
      type: String,
      enum: ['TEAM_MEMBER', 'EQUIPMENT', 'INVENTORY', 'VEHICLE', 'SPACE'],
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true }, // e.g. 'Lead Photographer Vikram', 'FX3 Cinema Rig A'
    identifier: { type: String, trim: true, default: '' },
    capacityUnits: { type: Number, default: 1, min: 1 },
    status: {
      type: String,
      enum: ['AVAILABLE', 'ALLOCATED', 'MAINTENANCE', 'RETIRED'],
      default: 'AVAILABLE',
      index: true,
    },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

export const VendorResource = externalConn.model('VendorResource', vendorResourceSchema);
