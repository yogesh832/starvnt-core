import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';
import { geoPoint } from '../../locationCommerce/rules.js';

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
    address: { type: String, trim: true, default: '' },
    locality: { type: String, trim: true, default: '' },
    city: { type: String, required: true, trim: true }, // e.g. 'Kolkata'
    state: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
    coordinates: {
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 },
    },
    geoPoint: { type: { type: String, enum: ['Point'] }, coordinates: { type: [Number], default: undefined } },
    isPrimary: { type: Boolean, default: false },
    operatingStatus: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    publicVisibility: { type: String, enum: ['CITY_ONLY', 'EXACT'], default: 'CITY_ONLY' },
    history: [{ actor: String, at: Date, action: String, before: Schema.Types.Mixed, after: Schema.Types.Mixed }],
  },
  { timestamps: true }
);

operatingLocationSchema.pre('validate', function () { this.geoPoint = geoPoint(this.coordinates); });
operatingLocationSchema.index({ geoPoint: '2dsphere' });
export const OperatingLocation = externalConn.model('OperatingLocation', operatingLocationSchema);
