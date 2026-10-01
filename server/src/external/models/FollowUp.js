import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

const followUpSchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', default: null },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'OVERDUE', 'CANCELLED'], default: 'PENDING', index: true },
  },
  { timestamps: true }
);

export const FollowUp = externalConn.model('FollowUp', followUpSchema);
