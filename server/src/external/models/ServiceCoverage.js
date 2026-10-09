import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.ServiceCoverages — Where this exact service/capability can be fulfilled (Spec §4, §5).
 */
const serviceCoverageSchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, index: true },
    vendorService: { type: Schema.Types.ObjectId, ref: 'VendorService', required: true, index: true },
    coverageType: {
      type: String,
      enum: ['LOCALITY', 'CITY', 'DISTRICT', 'STATE', 'RADIUS', 'VENUE', 'DESTINATION'],
      default: 'RADIUS',
    },
    localities: [{ type: String, trim: true }], // e.g. ['New Town', 'Salt Lake', 'Rajarhat']
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    radiusKm: { type: Number, default: 40 },
    confidence: {
      type: String,
      enum: ['SELF_DECLARED', 'VERIFIED', 'SYSTEM_OBSERVED', 'BOOKING_PROVEN'],
      default: 'SELF_DECLARED',
      index: true,
    },
    outstationAllowed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

serviceCoverageSchema.index({ vendor: 1, vendorService: 1 });

export const ServiceCoverage = externalConn.model('ServiceCoverage', serviceCoverageSchema);
