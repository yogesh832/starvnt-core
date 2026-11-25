import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';
const { Schema } = mongoose;
const schema = new Schema({
  vendor: { type: Schema.Types.ObjectId, required: true, index: true },
  code: { type: String, required: true }, status: { type: String, enum: ['REQUESTED', 'WITHDRAWN'], required: true },
  revision: { type: Number, default: 1 }, noticeVersion: String,
  history: [{ _id: false, actor: Schema.Types.ObjectId, at: Date, action: String, revision: Number, noticeVersion: String }],
}, { timestamps: true });
schema.index({ vendor: 1, code: 1 }, { unique: true });
export const PartnerOfferRequest = externalConn.model('PartnerOfferRequest', schema);
