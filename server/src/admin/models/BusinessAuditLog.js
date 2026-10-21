import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';

const { Schema } = mongoose;

const businessAuditLogSchema = new Schema(
  {
    who: { type: String, default: '' },
    actorId: { type: String, default: '' },
    actorType: { type: String, default: '' },
    organizationId: { type: String, default: '' },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, default: '' },
    resourceId: { type: String, default: '' },
    referenceId: { type: String, default: '' },
    fromState: { type: Schema.Types.Mixed, default: null },
    toState: { type: Schema.Types.Mixed, default: null },
    why: { type: String, default: '' },
    source: { type: String, default: '' },
    authority: { type: String, default: 'CORE' },
    idempotencyKey: { type: String, default: null },
    traceContext: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
businessAuditLogSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

export const BusinessAuditLog = adminConn.model('BusinessAuditLog', businessAuditLogSchema);
