import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

const vendorActivitySchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, index: true },
    type: { type: String, required: true }, // e.g., 'REMINDER', 'CALL', 'EMAIL'
    title: { type: String, required: true },
    description: { type: String, default: '' },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
    status: { type: String, enum: ['OPEN', 'DONE'], default: 'OPEN' },
    relatedEntity: {
      entityType: { type: String }, // e.g., 'FollowUp'
      entityId: { type: String }
    }
  },
  { timestamps: true }
);

export const VendorActivity = externalConn.model('VendorActivity', vendorActivitySchema);
