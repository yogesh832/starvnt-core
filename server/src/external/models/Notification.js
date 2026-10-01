import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.Notifications — Real-time operational notifications for vendors.
 */
const notificationSchema = new Schema(
  {
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'VendorOrganization',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['ENQUIRY', 'QUOTE', 'BOOKING', 'PAYMENT', 'MESSAGE', 'SYSTEM'],
      default: 'SYSTEM',
      index: true,
    },
    priority: {
      type: String,
      enum: ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'],
      default: 'NORMAL',
      index: true,
    },
    channel: {
      type: String,
      default: 'IN_APP',
      index: true,
    },
    templateId: {
      type: String,
      default: null,
    },
    recipient: {
      type: String,
      default: null,
    },
    link: {
      type: String,
      default: '/vendor/dashboard',
    },
    idempotencyKey: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RETRY', 'PERMANENT_FAILURE'],
      default: 'DELIVERED',
      index: true,
    },
    provider: {
      type: String,
      default: 'STARVNT_CORE',
    },
    providerMessageId: {
      type: String,
      default: null,
    },
    queuedAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: Date.now,
    },
    readAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);
notificationSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

export const Notification = externalConn.model('Notification', notificationSchema);
