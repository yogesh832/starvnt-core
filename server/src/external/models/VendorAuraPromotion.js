import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const schema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  code: { type: String, required: true, immutable: true },
  startedAt: { type: Date, required: true, immutable: true },
  expiresAt: { type: Date, required: true, immutable: true },
  redeemedBy: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
}, { timestamps: true });

export const VendorAuraPromotion = externalConn.model('VendorAuraPromotion', schema);
