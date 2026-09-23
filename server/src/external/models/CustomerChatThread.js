import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const customerChatThreadSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalUser', required: true },
  threadId: { type: String, required: true },
  title: { type: String, trim: true, maxlength: 120, default: 'New event plan' },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  messages: [{
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now }
  }],
  extractedContext: {
    type: { type: String },
    dateStr: { type: String },
    isoDate: { type: String },
    venue: { type: String },
    guests: { type: Number },
    budget: { type: String }
  }
}, { timestamps: true });

customerChatThreadSchema.index({ customerId: 1, threadId: 1 }, { unique: true });
customerChatThreadSchema.index({ customerId: 1, lastMessageAt: -1 });

export const CustomerChatThread = externalConn.model('CustomerChatThread', customerChatThreadSchema);
