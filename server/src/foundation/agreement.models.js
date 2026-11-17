import { Schema } from 'mongoose';
import { adminConn } from '../db/index.js';

export const relationshipTypes = ['LISTING', 'LEAD', 'MANAGED', 'STRATEGIC'];
const history = new Schema({ actor: String, action: String, at: Date, reason: String, revision: Number, requestHash: String }, { _id: false });
const version = new Schema({
  family: { type: String, required: true, immutable: true },
  version: { type: Number, required: true, immutable: true },
  title: { type: String, required: true, immutable: true },
  body: { type: String, required: true, immutable: true },
  contentHash: { type: String, required: true, immutable: true },
  relationshipTypes: { type: [{ type: String, enum: relationshipTypes }], immutable: true },
  effectiveFrom: { type: Date, required: true, immutable: true },
  expiresAt: { type: Date, immutable: true },
  state: { type: String, enum: ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT' },
  revision: { type: Number, default: 0 },
  createdBy: { type: String, required: true, immutable: true },
  requestKey: { type: String, required: true, immutable: true },
  requestHash: { type: String, required: true, immutable: true },
  legalReview: { reviewedBy: String, reference: String, at: Date },
  history: [history],
}, { timestamps: true });
version.index({ family: 1, version: 1 }, { unique: true });
version.index({ createdBy: 1, requestKey: 1 }, { unique: true });
version.index({ state: 1, effectiveFrom: -1 });
const assignment = new Schema({
  vendor: { type: Schema.Types.ObjectId, required: true, immutable: true, index: true },
  versionId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  relationshipType: { type: String, enum: relationshipTypes, required: true, immutable: true },
  snapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
  scope: { type: Schema.Types.Mixed, required: true, immutable: true },
  scopeHash: { type: String, required: true, immutable: true },
  referenceKey: { type: String, required: true, immutable: true },
  state: { type: String, enum: ['ASSIGNED', 'ACCEPTED', 'WITHDRAWN'], default: 'ASSIGNED' },
  revision: { type: Number, default: 0 },
  assignedBy: { type: String, required: true, immutable: true },
  acceptance: { actor: String, signatoryFullName: String, authorityConfirmed: Boolean, acceptedAt: Date, method: String, documentHash: String, scopeHash: String, requestKey: String, requestHash: String },
  history: [history],
}, { timestamps: true, minimize: false });
assignment.index({ vendor: 1, versionId: 1, referenceKey: 1 }, { unique: true });
export const AgreementVersion = adminConn.model('AgreementVersion', version);
export const VendorAgreement = adminConn.model('VendorAgreement', assignment);
