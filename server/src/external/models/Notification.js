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
      enum: ['ENQUIRY', 'QUOTE', 'BOOKING', 'PAYMENT', 'SYSTEM'],
      default: 'SYSTEM',
      index: true,
    },
    link: {
      type: String,
      default: '/vendor/dashboard',
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

export const Notification = externalConn.model('Notification', notificationSchema);
