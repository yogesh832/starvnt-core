import mongoose from 'mongoose';
import { externalConn } from '../db/index.js';
const observation = new mongoose.Schema({ action: { type: String, required: true, index: true }, outcome: String, reference: String, reported: { type: Boolean, default: false } }, { timestamps: true });
export const ProductObservation = externalConn.model('ProductObservation', observation);
const feedback = new mongoose.Schema({ customer: { type: mongoose.Schema.Types.ObjectId, required: true }, kind: { type: String, enum: ['EVENT', 'NOTIFICATION'], required: true }, reference: { type: mongoose.Schema.Types.ObjectId, required: true }, score: { type: Number, required: true, min: 1, max: 5 } }, { timestamps: true });
feedback.index({ customer: 1, kind: 1, reference: 1 }, { unique: true });
export const CustomerFeedback = externalConn.model('CustomerFeedback', feedback);
export async function observeProduct(action, outcome, reference = '', reported = false) {
  try { await ProductObservation.create({ action, outcome, reference: String(reference), reported }); }
  catch (err) { console.warn('[product-observation]', action, err.message); }
}
