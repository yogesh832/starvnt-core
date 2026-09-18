import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.OperatingLocations — Vendor's physical origin points (Spec §4).
 */
const operatingLocationSchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, index: true },
    label: { type: String, required: true, trim: true }, // e.g. 'Barasat Studio', 'Salt Lake Hub'
    type: {
      type: String,
      enum: ['STUDIO', 'HEAD_OFFICE', 'BRANCH', 'WAREHOUSE', 'KITCHEN', 'EQUIPMENT_HUB', 'STORAGE'],
      default: 'STUDIO',
    },
    address: { type: String, required: true, trim: true },
    locality: { type: String, trim: true, default: '' },
    city: { type: String, required: true, trim: true }, // e.g. 'Kolkata'
    state: { type: String, trim: true, default: 'West Bengal' },
    postalCode: { type: String, trim: true, default: '' },
    coordinates: {
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 },
    },
    isPrimary: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const OperatingLocation = externalConn.model('OperatingLocation', operatingLocationSchema);
