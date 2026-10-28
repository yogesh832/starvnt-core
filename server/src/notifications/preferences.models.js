import mongoose from 'mongoose';
import { externalConn } from '../db/index.js';
const policy = new mongoose.Schema({ _id: String, timezone: String, quietHours: { enabled: Boolean, start: String, end: String }, channels: { PUSH: Boolean }, disabledTypes: [String], history: [{ at: Date, actor: String, policy: mongoose.Schema.Types.Mixed }] }, { timestamps: true });
export const NotificationPreference = externalConn.model('NotificationPreference', policy);
const reminder = new mongoose.Schema({ customer: { type: mongoose.Schema.Types.ObjectId, required: true, index: true }, event: { type: mongoose.Schema.Types.ObjectId, required: true }, title: { type: String, required: true, maxlength: 140 }, dueAt: { type: Date, required: true, index: true }, status: { type: String, enum: ['PENDING', 'PROCESSING', 'DELIVERED', 'CANCELLED', 'SUPPRESSED'], default: 'PENDING' }, idempotencyKey: String, lease: String, lockedUntil: Date, attempts: { type: Number, default: 0 }, retryAt: { type: Date, default: Date.now }, lastError: String }, { timestamps: true });
reminder.index({ customer: 1, idempotencyKey: 1 }, { unique: true });
reminder.index({ status: 1, dueAt: 1, retryAt: 1, lockedUntil: 1 });
export const CustomerReminder = externalConn.model('CustomerReminder', reminder);
