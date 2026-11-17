import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

const followUpSchema = new Schema(
  {
    scope: { type: String, enum: ['VENDOR', 'STAFF'], default: 'VENDOR' },
    requirement: { type: Schema.Types.ObjectId, index: true },
    owner: { type: Schema.Types.ObjectId, index: true },
    requestKey: String,
    requestHash: String,
    history: [{ actor: String, at: Date, action: String, notes: String }],
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required() { return this.scope !== 'STAFF'; }, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'ExternalUser', default: null },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'OVERDUE', 'CANCELLED'], default: 'PENDING', index: true },
  },
  { timestamps: true }
);

followUpSchema.index({ requirement: 1, requestKey: 1 }, { unique: true, partialFilterExpression: { scope: 'STAFF' } });
export const FollowUp = externalConn.model('FollowUp', followUpSchema);
