import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.VendorMessageThreads — Real-time contextual client & operational messages (Spec §9, §14, §19).
 *
 * Messages are strictly contextual to structured opportunities, quotes, active bookings, or STARVNT operations.
 */
const messageItemSchema = new Schema(
  {
    sender: {
      type: String,
      enum: ['VENDOR', 'CLIENT', 'SYSTEM', 'SUPPORT'],
      required: true,
    },
    senderName: {
      type: String,
      default: '',
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

const vendorMessageThreadSchema = new Schema(
  {
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'VendorOrganization',
      required: true,
      index: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'ExternalUser',
      default: null,
      index: true,
    },
    opportunity: {
      type: Schema.Types.ObjectId,
      ref: 'Opportunity',
      default: null,
      index: true,
    },
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'CoreBooking',
      default: null,
      index: true,
    },
    clientName: {
      type: String,
      required: true,
      trim: true,
    },
    clientPhone: {
      type: String,
      default: '',
    },
    clientEmail: {
      type: String,
      default: '',
    },
    eventName: {
      type: String,
      default: 'Event Inquiry',
    },
    eventType: {
      type: String,
      default: 'General',
    },
    eventDate: {
      type: String,
      default: '',
    },
    venueLocation: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'ARCHIVED', 'BLOCKED'],
      default: 'ACTIVE',
      index: true,
    },
    lastMessageText: {
      type: String,
      default: '',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    unreadVendorCount: {
      type: Number,
      default: 0,
    },
    messages: [messageItemSchema],
  },
  { timestamps: true }
);

export const VendorMessageThread = externalConn.model('VendorMessageThread', vendorMessageThreadSchema);
