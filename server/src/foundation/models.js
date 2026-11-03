import mongoose from 'mongoose';
import { externalConn } from '../db/index.js';
const { Schema } = mongoose;
const history = new Schema({ actor: String, action: String, at: Date, reason: String, revision: Number, requestKey: String, requestHash: String, state: Schema.Types.Mixed }, { _id: false });

// Contact claims contain a keyed digest, never OTPs or raw contact details.
const claim = new Schema({ kind: { type: String, enum: ['EMAIL', 'PHONE', 'GOOGLE'], required: true }, digest: { type: String, required: true }, owner: { type: Schema.Types.ObjectId, required: true }, method: String, verifiedAt: Date }, { timestamps: true });
claim.index({ kind: 1, digest: 1 }, { unique: true });
export const IdentityClaim = externalConn.model('IdentityClaim', claim);

const consent = new Schema({ customer: { type: Schema.Types.ObjectId, required: true }, scope: { type: String, required: true }, purpose: { type: String, enum: ['ECOSYSTEM', 'MARKETING', 'PERSONALIZATION'], required: true },
  channel: { type: String, enum: ['ALL', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP'], required: true },
  status: { type: String, enum: ['GRANTED', 'WITHDRAWN'], required: true }, noticeVersion: { type: String, required: true },
  revision: { type: Number, default: 0 }, history: [history] }, { timestamps: true });
consent.index({ customer: 1, scope: 1, purpose: 1, channel: 1 }, { unique: true });
export const CustomerConsent = externalConn.model('CustomerConsent', consent);

const privacy = new Schema({ customer: { type: Schema.Types.ObjectId, required: true, unique: true }, status: { type: String, enum: ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED'], default: 'REQUESTED' },
  requestedAt: Date, approvedBy: String, retentionReason: String, retainedUntil: Date,
  retainedCategories: { type: [String], default: ['COMMERCIAL_RECORDS', 'BUSINESS_AUDIT', 'PROVIDER_MEDIA', 'BACKUPS', 'IDENTITY_TOMBSTONES'] },
  legalHold: { type: Boolean, default: false }, legalHoldReason: String, completedAt: Date, lastError: String, history: [history] }, { timestamps: true });
export const PrivacyRequest = externalConn.model('PrivacyRequest', privacy);

const link = new Schema({ customer: { type: Schema.Types.ObjectId, required: true }, otherCustomer: { type: Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ['REQUESTED', 'LINKED', 'REJECTED', 'REVOKED'], default: 'REQUESTED' },
  // Both owners prove access with current authenticated sessions; records remain separate.
  proofAt: Date, reason: String, history: [history] }, { timestamps: true });
link.index({ customer: 1, otherCustomer: 1 }, { unique: true });
export const IdentityLink = externalConn.model('IdentityLink', link);
