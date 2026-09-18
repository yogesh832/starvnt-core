import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.VendorBlockouts — Explicit blackout dates & times (Spec §5).
 */
const vendorBlockoutSchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, index: true },
    date: { type: String, required: true, index: true }, // Format: YYYY-MM-DD
    startTime: { type: String, default: '00:00' },
    endTime: { type: String, default: '23:59' },
    allDay: { type: Boolean, default: true },
    reason: { type: String, trim: true, default: 'Unavailable' },
  },
  { timestamps: true }
);

vendorBlockoutSchema.index({ vendor: 1, date: 1 });

export const VendorBlockout = externalConn.model('VendorBlockout', vendorBlockoutSchema);
