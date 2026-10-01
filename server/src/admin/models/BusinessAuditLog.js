import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';

const { Schema } = mongoose;

const businessAuditLogSchema = new Schema(
  {
    actorId: { type: String, default: '' },
    actorType: { type: String, default: '' },
    organizationId: { type: String, default: '' },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, default: '' },
    resourceId: { type: String, default: '' },
    beforeState: { type: Schema.Types.Mixed, default: null },
    afterState: { type: Schema.Types.Mixed, default: null },
    source: { type: String, default: '' },
    traceContext: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const BusinessAuditLog = adminConn.model('BusinessAuditLog', businessAuditLogSchema);
