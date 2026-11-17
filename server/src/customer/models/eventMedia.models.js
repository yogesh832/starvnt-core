import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;
const asset = new Schema({
  event: { type: Schema.Types.ObjectId, required: true, index: true },
  booking: { type: Schema.Types.ObjectId, default: null },
  uploader: { type: Schema.Types.ObjectId, required: true },
  uploaderType: { type: String, required: true },
  purpose: { type: String, enum: ['EVENT', 'COMPLETION_EVIDENCE', 'CASE_EVIDENCE', 'FINANCE_EVIDENCE'], default: 'EVENT', required: true, index: true },
  kind: { type: String, enum: ['PHOTO', 'VIDEO', 'UPDATE', 'DOCUMENT'], required: true },
  caption: { type: String, trim: true, maxlength: 2000, default: '' },
  state: { type: String, enum: ['PENDING', 'PUBLISHED', 'REJECTED', 'WITHDRAWN'], default: 'PENDING', index: true },
  rightsConfirmed: { type: Boolean, required: true },
  review: { privacy: Boolean, safety: Boolean, rights: Boolean, actor: String, at: Date, reason: String },
  liveEligible: { type: Boolean, default: false },
  memoryIncluded: { type: Boolean, default: false },
  highlight: { type: Boolean, default: false },
  occurredAt: { type: Date, default: Date.now },
  storage: { type: new Schema({ publicId: String, resourceType: String, format: String, mime: String, bytes: Number }, { _id: false }), select: false },
  requestKey: { type: String, required: true },
  requestHash: { type: String, required: true },
  history: [{ actor: String, action: String, at: Date, from: String, to: String, key: String, hash: String }],
}, { timestamps: true, collection: 'customer_event_media' });
asset.index({ event: 1, uploader: 1, requestKey: 1 }, { unique: true });

const publication = new Schema({
  event: { type: Schema.Types.ObjectId, required: true, unique: true },
  liveEnabled: { type: Boolean, default: false },
  memoryShared: { type: Boolean, default: false },
  tokenHash: { type: String, default: null, select: false, index: true },
  history: [{ actor: String, action: String, at: Date, key: String, hash: String }],
}, { timestamps: true, collection: 'customer_event_publication' });
export const EventMedia = externalConn.model('EventMedia', asset);
export const EventPublication = externalConn.model('EventPublication', publication);
