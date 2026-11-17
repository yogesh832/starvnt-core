import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;
const membership = new Schema({
  event: { type: Schema.Types.ObjectId, required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  user: { type: Schema.Types.ObjectId, default: null, index: true },
  role: { type: String, enum: ['VIEWER', 'PARTICIPANT', 'COORDINATOR'], required: true },
  state: { type: String, enum: ['INVITED', 'ACTIVE', 'REVOKED'], default: 'INVITED' },
  expiresAt: { type: Date, required: true },
  invitedBy: { type: Schema.Types.ObjectId, required: true },
  requestKey: { type: String, required: true },
  history: [{
    actor: String, action: String, at: Date, from: String, to: String, requestKey: String,
  }],
}, { timestamps: true, collection: 'customer_event_circle_members' });
membership.index({ event: 1, email: 1 }, { unique: true });
membership.index({ event: 1, requestKey: 1 }, { unique: true });
export const EventCircleMember = externalConn.model('EventCircleMember', membership);
