import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';
import { SEO_FACTS, SEO_RECORDS, SEO_DRAFT_FIELDS } from '../../common/vendorSeoContract.js';
const { Schema } = mongoose;
const evidence = new Schema({
  id: String, field: { type: String, enum: Object.keys(SEO_FACTS) }, value: String,
  sourceUrl: String, observedAt: String, identityConfirmed: Boolean, publicUseApproved: Boolean,
}, { _id: false });
const record = new Schema({
  id: String, kind: { type: String, enum: Object.keys(SEO_RECORDS) }, title: String, detail: String,
  sourceUrl: String, observedAt: String, language: String, location: String,
  basis: { type: String, enum: ['NEEDS_DATA', 'OBSERVATION', 'ESTIMATE', 'RECOMMENDATION'] },
  target: { type: String, enum: ['STARVNT', 'VENDOR_WEBSITE', 'EXTERNAL_PROFILE'] },
  period: { type: String, enum: ['', '30', '60', '90'] }, completed: Boolean,
  metric: String, value: Number, startDate: String, endDate: String,
}, { _id: false });
const schema = new Schema({
  vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, unique: true },
  revision: { type: Number, default: 0 }, evidence: { type: [evidence], default: [] }, records: { type: [record], default: [] },
  draft: { type: new Schema(Object.fromEntries(Object.keys(SEO_DRAFT_FIELDS).map(key => [key, { type: String, default: '' }])), { _id: false }), default: () => ({}) },
  review: { at: Date, actor: Schema.Types.ObjectId, fingerprint: String, revision: Number },
  history: [{ _id: false, at: Date, actor: Schema.Types.ObjectId, action: String, revision: Number }],
}, { timestamps: true });
export const VendorSeoWorkspace = externalConn.model('VendorSeoWorkspace', schema);
