import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

const vendorActivitySchema = new Schema(
  {
    adminOwner: { type: Schema.Types.ObjectId, index: true },
    requestKey: String,
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required() { return !this.adminOwner; }, index: true },
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

vendorActivitySchema.index({ requestKey: 1 }, { unique: true, partialFilterExpression: { requestKey: { $type: 'string' } } });
export const VendorActivity = externalConn.model('VendorActivity', vendorActivitySchema);
