import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.VendorBlockouts — Explicit blackout dates & times (Spec §5).
 */
const vendorBlockoutSchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'VendorOrganization', required: true, index: true },
    date: { type: String, required: true, index: true }, // Format: YYYY-MM-DD
    startTime: { type: String, default: '00:00' },
    endTime: { type: String, default: '23:59' },
    allDay: { type: Boolean, default: true },
    endDate: String,
    startAt: Date,
    endAt: Date,
    timezone: { type: String, default: 'Asia/Kolkata' },
    recordType: { type: String, enum: ['VENDOR_BLOCK', 'EXTERNAL_COMMITMENT'], default: 'VENDOR_BLOCK' },
    source: { type: String, enum: ['VENDOR_PRIVATE'], default: 'VENDOR_PRIVATE', immutable: true },
    externalBooking: {
      acquisitionChannel: { type: String, immutable: true },
      lifecycle: { type: String, enum: ['ENQUIRY', 'NEGOTIATION', 'QUOTE_SENT', 'ON_HOLD', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
      holdExpiresAt: Date, totalAmount: { type: Number, min: 0 },
      eventName: String, guestCount: { type: Number, min: 1 }, nextPaymentDueAt: Date,
      lineItems: [{ service: Schema.Types.ObjectId, name: String, quantity: Number, unitPrice: Number }],
      allocations: [{ resource: Schema.Types.ObjectId, units: Number }],
      buffers: { setupMinutes: Number, teardownMinutes: Number, travelBeforeMinutes: Number, travelAfterMinutes: Number },
      attachments: [{ key: String, name: String, kind: { type: String, enum: ['INVOICE', 'RECEIPT', 'OTHER'] }, publicId: String, resourceType: String, format: String, actor: String, at: Date }],
      refunds: [{ key: String, amount: Number, receivedAt: Date, method: String, reference: String, reason: String, attachmentId: Schema.Types.ObjectId, actor: String, recordedAt: Date }],
      // Vendor-reported receipts stay outside Core payments/revenue.
      receipts: [{ key: String, amount: Number, receivedAt: Date, method: String, reference: String, attachmentUrl: String, attachmentId: Schema.Types.ObjectId, actor: String, recordedAt: Date }],
    },
    status: { type: String, enum: ['ACTIVE', 'CONFLICT_REVIEW', 'CANCELLED'], default: 'ACTIVE' },
    verificationStatus: { type: String, enum: ['REPORTED'], default: 'REPORTED' },
    scope: { type: String, enum: ['BUSINESS', 'SERVICE', 'RESOURCE'], default: 'BUSINESS' },
    vendorService: { type: Schema.Types.ObjectId, ref: 'VendorService', default: null },
    resourceIds: [{ type: Schema.Types.ObjectId, ref: 'VendorResource' }],
    external: { customerName: String, customerPhone: String, eventType: String, location: String, notes: String, reference: String },
    serviceLocation: { address: String, locality: String, city: String, coordinates: { lat: Number, lng: Number } },
    idempotencyKey: { type: String, default: null },
    requestHash: String,
    revision: { type: Number, default: 0 },
    history: [{ actor: String, role: String, action: String, at: Date, reason: String, before: Schema.Types.Mixed, after: Schema.Types.Mixed, idempotencyKey: String, requestHash: String }],
    reason: { type: String, trim: true, default: 'Unavailable' },
  },
  { timestamps: true }
);

vendorBlockoutSchema.index({ vendor: 1, date: 1 });
vendorBlockoutSchema.index({ vendor: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
vendorBlockoutSchema.index({ vendor: 1, startAt: 1, endAt: 1, status: 1 });

export const VendorBlockout = externalConn.model('VendorBlockout', vendorBlockoutSchema);
