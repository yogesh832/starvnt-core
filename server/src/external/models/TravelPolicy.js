import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.TravelPolicies — Logistics & verified travel cost rules (Spec §5, §8).
 */
const travelPolicySchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, unique: true, index: true },
    freeRadiusKm: { type: Number, default: 15, min: 0 },
    perKmRate: { type: Number, default: 40, min: 0 }, // per km beyond freeRadiusKm
    equipmentTransitFee: { type: Number, default: 0, min: 0 },
    tollAndParkingIncluded: { type: Boolean, default: false },
    outstationDailyAllowance: { type: Number, default: 1500, min: 0 },
    accommodationRequiredBeyondKm: { type: Number, default: 120, min: 0 },
  },
  { timestamps: true }
);

export const TravelPolicy = externalConn.model('TravelPolicy', travelPolicySchema);
