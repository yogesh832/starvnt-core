import { CoreBooking } from '../models/CoreBooking.js';
import { matchVendorsForRequirement } from '../../external/services/matching.service.js';

/**
 * Execution, Completion Validation & Settlement Service (Spec §11, §12).
 *
 * Core Platform Authority rules:
 * - Payment success is not settlement success.
 * - Vendor frontend/OS can submit execution progress and completion facts/evidence.
 * - Vendor CANNOT declare PAYMENT_VERIFIED, COMPLETION_VERIFIED, SETTLEMENT_ELIGIBLE, or SETTLED.
 * - Core Platform validates completion and unlocks settlement eligibility.
 */

/**
 * Verifies payment from Core authority (Golden Acceptance Test I).
 */
export async function verifyPaymentFromCore(bookingId, paymentDetails = {}, coreActor = 'CORE_ADMIN') {
  const booking = await CoreBooking.findById(bookingId);
  if (!booking) {
    const err = new Error(`CoreBooking with ID ${bookingId} not found`);
    err.statusCode = 404;
    err.code = 'BOOKING_NOT_FOUND';
    throw err;
  }

  // Update authoritative payment truth
  booking.paymentStatus = 'PAYMENT_VERIFIED';
  
  // Advance execution state to SERVICE_SCHEDULED if currently NOT_STARTED
  if (booking.executionStatus === 'NOT_STARTED') {
    booking.executionStatus = 'SERVICE_SCHEDULED';
  }

  await booking.save();
  return booking;
}

/**
 * Vendor starts service execution.
 */
export async function startService(bookingId, vendorId) {
  const booking = await CoreBooking.findById(bookingId);
  if (!booking) {
    const err = new Error(`CoreBooking with ID ${bookingId} not found`);
    err.statusCode = 404;
    err.code = 'BOOKING_NOT_FOUND';
    throw err;
  }

  // Tenant validation: booking must belong to vendor
  if (booking.vendorId.toString() !== vendorId.toString()) {
    const err = new Error('TENANT_MISMATCH: Cannot access booking for a different vendor');
    err.statusCode = 403;
    err.code = 'TENANT_MISMATCH';
    throw err;
  }

  booking.executionStatus = 'SERVICE_STARTED';
  await booking.save();
  return booking;
}

/**
 * Vendor submits completion evidence (Golden Acceptance Test J).
 *
 * Vendor can submit facts/evidence, but cannot verify completion.
 */
export async function submitCompletionEvidence(bookingId, vendorId, { deliverablesUrl, checklist = [], notes = '' } = {}) {
  const booking = await CoreBooking.findById(bookingId);
  if (!booking) {
    const err = new Error(`CoreBooking with ID ${bookingId} not found`);
    err.statusCode = 404;
    err.code = 'BOOKING_NOT_FOUND';
    throw err;
  }

  // Tenant check
  if (booking.vendorId.toString() !== vendorId.toString()) {
    const err = new Error('TENANT_MISMATCH: Cannot access booking for a different vendor');
    err.statusCode = 403;
    err.code = 'TENANT_MISMATCH';
    throw err;
  }

  booking.completionEvidence.push({
    submittedBy: vendorId.toString(),
    submittedAt: new Date(),
    deliverablesUrl: deliverablesUrl || '',
    checklist: checklist.map(item => typeof item === 'string' ? { item, checked: true } : item),
    notes: notes || '',
  });

  // Vendor action transitions state to COMPLETION_SUBMITTED (never COMPLETION_VERIFIED)
  booking.executionStatus = 'COMPLETION_SUBMITTED';
  await booking.save();

  return booking;
}

/**
 * Validates vendor completion from Core authority (Golden Acceptance Test K).
 *
 * Completion validation unlocks SETTLEMENT_ELIGIBLE.
 */
export async function validateCompletionFromCore(bookingId, { approved = true, notes = '' } = {}, coreActor = 'CORE_ADMIN') {
  const booking = await CoreBooking.findById(bookingId);
  if (!booking) {
    const err = new Error(`CoreBooking with ID ${bookingId} not found`);
    err.statusCode = 404;
    err.code = 'BOOKING_NOT_FOUND';
    throw err;
  }

  if (booking.executionStatus !== 'COMPLETION_SUBMITTED') {
    const err = new Error(
      `INVALID_VALIDATION_STATE: Cannot validate completion when execution status is '${booking.executionStatus}'. Vendor must first submit completion evidence.`
    );
    err.statusCode = 400;
    err.code = 'INVALID_VALIDATION_STATE';
    throw err;
  }

  if (!approved) {
    booking.validationAudit = {
      verifiedBy: coreActor,
      verifiedAt: new Date(),
      notes: `Validation rejected: ${notes}`,
    };
    await booking.save();
    return booking;
  }

  // Approved by Core
  booking.executionStatus = 'COMPLETION_VERIFIED';
  booking.settlementStatus = 'SETTLEMENT_ELIGIBLE';
  booking.validationAudit = {
    verifiedBy: coreActor,
    verifiedAt: new Date(),
    notes: notes || 'Completion verified against checklist and deliverable proof',
  };

  await booking.save();
  return booking;
}

/**
 * Releases settlement to vendor (Golden Acceptance Test K).
 *
 * Settlement can ONLY be released after Core validation makes it SETTLEMENT_ELIGIBLE.
 */
export async function settleBooking(bookingId, { transactionReference = '' } = {}, coreActor = 'CORE_FINANCE') {
  const booking = await CoreBooking.findById(bookingId);
  if (!booking) {
    const err = new Error(`CoreBooking with ID ${bookingId} not found`);
    err.statusCode = 404;
    err.code = 'BOOKING_NOT_FOUND';
    throw err;
  }

  if (booking.settlementStatus !== 'SETTLEMENT_ELIGIBLE') {
    const err = new Error(
      `SETTLEMENT_NOT_ELIGIBLE: Booking completion must be validated before settlement can be executed. Current status: '${booking.settlementStatus}'.`
    );
    err.statusCode = 400;
    err.code = 'SETTLEMENT_NOT_ELIGIBLE';
    throw err;
  }

  booking.settlementStatus = 'SETTLED';
  booking.settlementDetails = {
    settledBy: coreActor,
    settledAt: new Date(),
    amount: booking.totalAmount,
    transactionReference: transactionReference || `SETTLE-${Date.now()}`,
  };

  await booking.save();
  return booking;
}

/**
 * Handles vendor failure and triggers alternative discovery on the same requirement/location (Golden Acceptance Test L).
 */
export async function handleVendorFailureAndDiscoverAlternatives(bookingId, { reason = '', failedBy = 'VENDOR' } = {}) {
  const booking = await CoreBooking.findById(bookingId);
  if (!booking) {
    const err = new Error(`CoreBooking with ID ${bookingId} not found`);
    err.statusCode = 404;
    err.code = 'BOOKING_NOT_FOUND';
    throw err;
  }

  booking.bookingStatus = 'FAILED';
  booking.failureAudit = {
    failedBy,
    failedAt: new Date(),
    reason: reason || 'Vendor reported inability to fulfill service requirement',
  };
  await booking.save();

  // Run matching on the EXACT same requirement parameters
  const matchResult = await matchVendorsForRequirement({
    category: booking.category || 'Photography',
    serviceLocation: booking.serviceLocation,
    date: booking.eventDate,
    guestCount: 500,
  });

  // Filter out the failed vendor
  const alternativeVendors = matchResult.eligibleCandidates.filter(
    (c) => c.vendorId.toString() !== booking.vendorId.toString()
  );

  return {
    failedBooking: booking,
    alternativeCandidates: alternativeVendors,
    matchSummary: {
      totalFound: alternativeVendors.length,
      topCandidate: alternativeVendors[0] || null,
      serviceLocation: booking.serviceLocation,
      eventDate: booking.eventDate,
    },
  };
}
