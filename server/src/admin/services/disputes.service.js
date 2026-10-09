import { CoreBooking } from '../models/CoreBooking.js';
import { handleVendorFailureAndDiscoverAlternatives } from './executionSettlement.service.js';
import { VendorFinancialProfile } from '../../external/models/VendorFinancialProfile.js';
import { recordBusinessAudit } from '../utils/audit.js';
import { recordDisputeHold, settlementMath } from './financeLedger.service.js';

async function freezeVendorWalletForDispute(booking, reason) {
  if (!booking.vendorId) return;
  const payable = settlementMath(booking.totalAmount).vendorPayable;
  await VendorFinancialProfile.findOneAndUpdate(
    { vendor: booking.vendorId },
    {
      $set: {
        'wallet.isFrozen': true,
        'wallet.freezeReason': reason,
        'wallet.frozenAt': new Date(),
        'wallet.frozenBalance': payable,
      },
    },
    { upsert: true, new: true }
  );
  await recordDisputeHold(booking, reason);
  await recordBusinessAudit({
    actorType: 'SYSTEM',
    action: 'VENDOR_WALLET_FROZEN',
    resourceType: 'VendorFinancialProfile',
    resourceId: String(booking.vendorId),
    referenceId: String(booking._id),
    toState: { walletFrozen: true, frozenBalance: payable },
    why: reason,
    source: 'DISPUTE_ENGINE',
    authority: 'CORE_FINANCE',
    idempotencyKey: `vendor_wallet_frozen_${booking._id}`,
  });
}

async function releaseVendorWalletFreezeIfResolved(booking, reason) {
  if (!booking.vendorId) return;
  const hasOpenDispute = booking.disputes.some((d) => d.status !== 'RESOLVED');
  if (hasOpenDispute) return;
  await VendorFinancialProfile.findOneAndUpdate(
    { vendor: booking.vendorId },
    {
      $set: {
        'wallet.isFrozen': false,
        'wallet.freezeReason': '',
        'wallet.frozenBalance': 0,
        'wallet.unfrozenAt': new Date(),
      },
    }
  );
  await recordBusinessAudit({
    actorType: 'SYSTEM',
    action: 'VENDOR_WALLET_UNFROZEN',
    resourceType: 'VendorFinancialProfile',
    resourceId: String(booking.vendorId),
    referenceId: String(booking._id),
    toState: { walletFrozen: false },
    why: reason,
    source: 'DISPUTE_ENGINE',
    authority: 'CORE_FINANCE',
    idempotencyKey: `vendor_wallet_unfrozen_${booking._id}`,
  });
}

/**
 * Dispute & Issue Management Service (Spec §29, §30, §31, §32).
 *
 * Core Platform Authority rules:
 * - A vendor's completion claim does not automatically authorize settlement.
 * - Customer claim does not automatically prove vendor fault.
 * - An unresolved service issue keeps the applicable settlement decision under review.
 */

/**
 * Report a customer or vendor issue (Golden Acceptance Test M - Customer Issue).
 * 
 * Automatically places the settlement on HOLD pending review.
 */
export async function reportIssue(bookingId, { reportedBy = 'CUSTOMER', issueType = 'SERVICE_FAILURE', description }) {
  const booking = await CoreBooking.findById(bookingId);
  if (!booking) {
    const err = new Error(`CoreBooking with ID ${bookingId} not found`);
    err.statusCode = 404;
    err.code = 'BOOKING_NOT_FOUND';
    throw err;
  }

  // Add the dispute to the booking
  booking.disputes.push({
    reportedBy,
    reportedAt: new Date(),
    issueType,
    description,
    status: 'UNDER_REVIEW',
  });

  // Principle: Unresolved applicable service dispute -> Vendor settlement does not proceed.
  // We place the settlement on HOLD immediately.
  if (booking.settlementStatus !== 'SETTLED') {
    booking.settlementStatus = 'SETTLEMENT_HOLD';
  }

  await booking.save();
  await freezeVendorWalletForDispute(booking, description || issueType);
  return booking;
}

/**
 * Resolve an ongoing dispute (Golden Acceptance Test N - Resolution).
 * 
 * Outcome determines whether the vendor gets settled, the customer gets refunded,
 * or if alternative remediation is needed.
 */
export async function resolveDispute(bookingId, disputeId, { decision, notes, refundAmount = 0, settlementAmount = 0 }, coreActor = 'CORE_ADMIN') {
  const booking = await CoreBooking.findById(bookingId);
  if (!booking) {
    const err = new Error(`CoreBooking with ID ${bookingId} not found`);
    err.statusCode = 404;
    err.code = 'BOOKING_NOT_FOUND';
    throw err;
  }

  const dispute = booking.disputes.id(disputeId);
  if (!dispute) {
    const err = new Error(`Dispute with ID ${disputeId} not found on this booking`);
    err.statusCode = 404;
    err.code = 'DISPUTE_NOT_FOUND';
    throw err;
  }

  if (dispute.status === 'RESOLVED') {
    const err = new Error('Dispute is already resolved.');
    err.statusCode = 400;
    err.code = 'DISPUTE_ALREADY_RESOLVED';
    throw err;
  }

  // Update dispute resolution details
  dispute.status = 'RESOLVED';
  dispute.resolution = {
    decision,
    decidedBy: coreActor,
    decidedAt: new Date(),
    notes: notes || `Resolved via Core Admin with outcome: ${decision}`,
    refundAmount,
    settlementAmount
  };

  // State machine adjustments based on outcome (Spec §32)
  switch (decision) {
    case 'SERVICE_ACCEPTED':
    case 'VENDOR_SETTLEMENT':
      // The vendor successfully completed, issue dismissed or settled
      booking.executionStatus = 'COMPLETION_VERIFIED';
      booking.settlementStatus = 'SETTLEMENT_ELIGIBLE';
      break;

    case 'PARTIAL_SETTLEMENT':
      // Partial payout
      booking.executionStatus = 'COMPLETION_VERIFIED';
      booking.settlementStatus = 'SETTLEMENT_ELIGIBLE';
      // In a full implementation, you would adjust the payable amount here
      booking.pricing.totalAmount = settlementAmount;
      booking.totalAmount = settlementAmount || booking.totalAmount;
      break;

    case 'REFUND':
    case 'PARTIAL_REFUND':
      // Vendor fails or partial fail, refund to customer
      booking.paymentStatus = 'REFUNDED'; // Or PARTIAL_REFUND
      // Keep settlement on NOT_ELIGIBLE or leave as HOLD since they won't be fully paid.
      booking.settlementStatus = 'NOT_ELIGIBLE'; 
      break;

    case 'REPLACEMENT':
      // System handles vendor replacement
      booking.settlementStatus = 'NOT_ELIGIBLE';
      await booking.save(); // Save before kicking off async flow
      const replacementResult = await handleVendorFailureAndDiscoverAlternatives(bookingId, {
        reason: notes || 'Replaced due to dispute resolution',
        failedBy: coreActor
      });
      return replacementResult;

    default:
      // OTHER_REMEDY leaves it up to manual financial intervention
      break;
  }

  await booking.save();
  await releaseVendorWalletFreezeIfResolved(booking, `Dispute resolved: ${decision}`);
  return booking;
}
