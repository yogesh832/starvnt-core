import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';

const { Schema } = mongoose;

const financeLedgerEntrySchema = new Schema(
  {
    booking: { type: Schema.Types.ObjectId, ref: 'CoreBooking', required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, required: true, index: true },
    eventId: { type: Schema.Types.ObjectId, default: null, index: true },
    type: {
      type: String,
      enum: ['INVOICE_ACCRUAL', 'SETTLEMENT_RELEASE', 'REFUND', 'ADJUSTMENT', 'DISPUTE_HOLD', 'DISPUTE_RELEASE'],
      required: true,
      index: true,
    },
    debitAccount: { type: String, required: true },
    creditAccount: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    tax: {
      gstAmount: { type: Number, default: 0 },
      tdsAmount: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 },
      vendorPayable: { type: Number, default: 0 },
    },
    reference: { type: String, default: '' },
    description: { type: String, default: '' },
    idempotencyKey: { type: String, required: true, unique: true },
    postedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

financeLedgerEntrySchema.index({ type: 1, postedAt: -1 });

export const FinanceLedgerEntry = adminConn.model('FinanceLedgerEntry', financeLedgerEntrySchema);
