import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.VendorServices — What the vendor sells/fulfills (Spec §3, §4).
 */
const vendorServiceSchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 }, // e.g. 'Wedding Photography'
    category: { type: String, required: true, trim: true }, // e.g. 'Photography'
    description: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'],
      default: 'DRAFT',
      index: true,
    },
    pricing: {
      pricingType: {
        type: String,
        enum: ['FIXED', 'HOURLY', 'PER_PERSON', 'TIERED', 'CUSTOM'],
        default: 'FIXED',
      },
      basePrice: { type: Number, required: true, min: 0 },
      unit: { type: String, default: 'event' }, // event, hour, day, plate, guest
      taxIncluded: { type: Boolean, default: true },
      conditionalCharges: [
        {
          name: { type: String, required: true },
          amount: { type: Number, required: true },
          condition: { type: String, default: '' },
        },
      ],
    },
    leadTimeDays: { type: Number, default: 7 },
    cancellationPolicy: { type: String, default: 'Standard 48-hour' },
    deliverables: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

vendorServiceSchema.index({ vendor: 1, category: 1 });

export const VendorService = externalConn.model('VendorService', vendorServiceSchema);
