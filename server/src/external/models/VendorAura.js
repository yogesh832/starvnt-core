import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

// Vendor Aura+ conversations. `_id` is the client-generated session id.
const vendorAuraSessionSchema = new Schema(
  {
    _id: { type: String },
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'ExternalUser', required: true },
    // A setup action Aura+ proposed and is waiting for the vendor to confirm (see setupActions.js).
    pending: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true, collection: 'vendor_aura_sessions' }
);

const vendorAuraMessageSchema = new Schema(
  {
    session: { type: String, required: true, index: true },
    role: { type: String, enum: ['user', 'model'], required: true },
    content: { type: String, required: true, maxlength: 4000 },
    actions: { type: [{ label: String, to: String, _id: false }], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'vendor_aura_messages' }
);

export const VendorAuraSession = externalConn.model('VendorAuraSession', vendorAuraSessionSchema);
export const VendorAuraMessage = externalConn.model('VendorAuraMessage', vendorAuraMessageSchema);
