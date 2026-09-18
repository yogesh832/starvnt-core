import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.VendorBookingSlots — Tracks operational commitments and service locations (Spec §5, §6).
 */
const vendorBookingSlotSchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, index: true },
    vendorService: { type: Schema.Types.ObjectId, ref: 'VendorService', required: true },
    date: { type: String, required: true, index: true }, // Format: YYYY-MM-DD
    startTime: { type: String, required: true, default: '09:00' }, // Format: HH:mm
    endTime: { type: String, required: true, default: '18:00' }, // Format: HH:mm
    serviceLocation: {
      address: { type: String, default: '' },
      locality: { type: String, default: '' },
      city: { type: String, default: 'Kolkata' },
      coordinates: {
        lat: { type: Number, default: 0 },
        lng: { type: Number, default: 0 },
      },
    },
    status: {
      type: String,
      enum: ['CONFIRMED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'CONFIRMED',
      index: true,
    },
    assignedResources: [{ type: Schema.Types.ObjectId, ref: 'VendorResource' }],
  },
  { timestamps: true }
);

vendorBookingSlotSchema.index({ vendor: 1, date: 1 });

export const VendorBookingSlot = externalConn.model('VendorBookingSlot', vendorBookingSlotSchema);
