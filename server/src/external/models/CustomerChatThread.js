import mongoose from 'mongoose';

const customerChatThreadSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalUser', required: true },
  threadId: { type: String, required: true },
  messages: [{
    role: { type: String, required: true },
    content: { type: String, required: true },
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

export const CustomerChatThread = mongoose.model('CustomerChatThread', customerChatThreadSchema);
