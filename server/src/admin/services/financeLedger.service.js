import { config } from '../../config.js';
import { FinanceLedgerEntry } from '../models/FinanceLedgerEntry.js';
import { recordBusinessAudit } from '../utils/audit.js';

const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function settlementMath(totalAmount, overrides = {}) {
  const gross = money(totalAmount);
  const commissionPercent = Number(overrides.platformCommissionPercent ?? config.platformCommissionPercent);
  const gstPercent = Number(overrides.gstPercent ?? config.gstPercent);
  const tdsPercent = Number(overrides.tdsPercent ?? config.tdsPercent);
  const platformFee = money((gross * commissionPercent) / 100);
  const gstAmount = money((platformFee * gstPercent) / 100);
  const tdsAmount = money((gross * tdsPercent) / 100);
  const vendorPayable = money(Math.max(0, gross - platformFee - tdsAmount));
  return {
    taxableValue: gross,
    platformFee,
    gstPercent,
    gstAmount,
    tdsPercent,
    tdsAmount,
    vendorPayable,
  };
}

export async function ensureInvoiceForBooking(booking, actor = 'CORE_FINANCE') {
  const tax = booking.taxSummary?.invoiceNumber ? booking.taxSummary.toObject?.() || booking.taxSummary : settlementMath(booking.totalAmount, booking.financialPolicySnapshot || {});
  if (!booking.taxSummary?.invoiceNumber) {
    booking.taxSummary = {
      ...tax,
      invoiceNumber: `INV-${String(booking._id).slice(-8).toUpperCase()}`,
      invoiceIssuedAt: new Date(),
    };
  } else {
    booking.taxSummary = {
      ...(booking.taxSummary?.toObject?.() || booking.taxSummary || {}),
      ...tax,
    };
  }

  await FinanceLedgerEntry.findOneAndUpdate(
    { idempotencyKey: `invoice_accrual_${booking._id}` },
    {
      $setOnInsert: {
        booking: booking._id,
        vendorId: booking.vendorId,
        customerId: booking.customerId,
        eventId: booking.customerEvent || null,
        type: 'INVOICE_ACCRUAL',
        debitAccount: 'Customer Receivable',
        creditAccount: 'Vendor Service Revenue',
        amount: tax.taxableValue,
        tax,
        reference: booking.taxSummary.invoiceNumber,
        description: `Invoice accrual for ${booking.bookingReference || booking._id}`,
        idempotencyKey: `invoice_accrual_${booking._id}`,
      },
    },
    { upsert: true, new: true }
  );

  await recordBusinessAudit({
    who: actor,
    actorType: 'SYSTEM',
    action: 'BOOKING_INVOICE_ACCRUED',
    resourceType: 'CoreBooking',
    resourceId: String(booking._id),
    referenceId: booking.taxSummary.invoiceNumber,
    toState: { taxSummary: booking.taxSummary },
    why: 'Validated booking invoice and statutory deductions were calculated.',
    source: 'FINANCE_LEDGER',
    authority: 'CORE_FINANCE',
    idempotencyKey: `booking_invoice_accrued_${booking._id}`,
  });

  return tax;
}

export async function recordSettlementRelease(booking) {
  if (!booking.financeOperations?.some(op => op.kind === 'SETTLEMENT' && op.status === 'CONFIRMED')) throw Object.assign(new Error('Independent finance reconciliation is required.'), { code: 'FINANCE_RECONCILIATION_REQUIRED', statusCode: 409 });
  const { postConfirmedFinanceLedger } = await import('./financeOperations.service.js');
  await postConfirmedFinanceLedger(booking);
  return booking.taxSummary;
}

export async function recordRefund(booking, { amount, reference } = {}) {
  if (!booking.financeOperations?.some(op => op.kind === 'REFUND' && op.status === 'CONFIRMED' && op.amount === Number(amount) && (op.reference === reference || op.providerId === reference))) throw Object.assign(new Error('Independent refund reconciliation is required.'), { code: 'FINANCE_RECONCILIATION_REQUIRED', statusCode: 409 });
  const { postConfirmedFinanceLedger } = await import('./financeOperations.service.js');
  await postConfirmedFinanceLedger(booking);
}

export async function recordDisputeHold(booking, reason = 'Dispute under review') {
  const amount = settlementMath(booking.totalAmount).vendorPayable;
  await FinanceLedgerEntry.findOneAndUpdate(
    { idempotencyKey: `dispute_hold_${booking._id}` },
    {
      $setOnInsert: {
        booking: booking._id,
        vendorId: booking.vendorId,
        customerId: booking.customerId,
        eventId: booking.customerEvent || null,
        type: 'DISPUTE_HOLD',
        debitAccount: 'Vendor Payable',
        creditAccount: 'Settlement Hold Liability',
        amount,
        reference: booking.bookingReference || String(booking._id),
        description: reason,
        idempotencyKey: `dispute_hold_${booking._id}`,
      },
    },
    { upsert: true, new: true }
  );
}
