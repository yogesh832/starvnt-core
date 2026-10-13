import { CoreBooking } from '../models/CoreBooking.js';
import { matchVendorsForRequirement } from '../../external/services/matching.service.js';
import { recordLifecycleEventMessage } from '../../customer/services/circle.service.js';
import { VendorFinancialProfile } from '../../external/models/VendorFinancialProfile.js';
import { Payment } from '../../customer/models/index.js';
import { ensureInvoiceForBooking, recordSettlementRelease, settlementMath } from './financeLedger.service.js';
import { recordBusinessAudit } from '../utils/audit.js';

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

  if (booking.paymentStatus === 'PAYMENT_VERIFIED') {
    return booking;
  }

  const reference = String(
    paymentDetails.paymentId ||
      paymentDetails.providerPaymentId ||
      paymentDetails.transactionReference ||
      booking.paymentSummary?.providerPaymentId ||
      ''
  ).trim();
  const orderId = String(paymentDetails.providerOrderId || booking.paymentSummary?.providerOrderId || '').trim();
  const expectedAmount = Number(paymentDetails.paidAmount || 0);
  const referenceClauses = [
    ...(reference ? [{ providerRef: reference }] : []),
    ...(orderId ? [{ providerOrderId: orderId }] : []),
  ];

  if (!referenceClauses.length) {
    const err = new Error('PAYMENT_EVIDENCE_REQUIRED: Provide a verified payment/order reference from the customer payment ledger.');
    err.statusCode = 409;
    err.code = 'PAYMENT_EVIDENCE_REQUIRED';
    throw err;
  }

  const paymentFilter = {
    status: 'verified',
    $or: referenceClauses,
  };
  if (expectedAmount > 0) paymentFilter.amount = expectedAmount;

  const payment = await Payment.findOne(paymentFilter).lean();

  if (!payment) {
    const err = new Error('PAYMENT_NOT_VERIFIED: No matching verified customer payment record was found for this booking.');
    err.statusCode = 409;
    err.code = 'PAYMENT_NOT_VERIFIED';
    throw err;
  }

  const fromState = {
    paymentStatus: booking.paymentStatus,
    executionStatus: booking.executionStatus,
    paymentSummary: booking.paymentSummary,
  };

  booking.paymentStatus = 'PAYMENT_VERIFIED';
  booking.paymentSummary = {
    ...(booking.paymentSummary?.toObject?.() || booking.paymentSummary || {}),
    paidAmount: payment.amount,
    balanceAmount: Math.max(0, Number(booking.totalAmount || 0) - Number(payment.amount || 0)),
    provider: payment.provider || booking.paymentSummary?.provider || 'razorpay',
    providerOrderId: payment.providerOrderId || booking.paymentSummary?.providerOrderId || '',
    providerPaymentId: payment.providerRef || reference || booking.paymentSummary?.providerPaymentId || '',
    paidAt: payment.verifiedAt || payment.updatedAt || new Date(),
    couponCode: payment.coupon?.code || booking.paymentSummary?.couponCode || '',
    couponDiscountAmount: payment.coupon?.discountAmount || booking.paymentSummary?.couponDiscountAmount || 0,
  };
  
  // Advance execution state to SERVICE_SCHEDULED if currently NOT_STARTED
  if (booking.executionStatus === 'NOT_STARTED') {
    booking.executionStatus = 'SERVICE_SCHEDULED';
  }

  await booking.save();
  await recordBusinessAudit({
    who: coreActor,
    actorType: 'ADMIN',
    action: 'BOOKING_PAYMENT_VERIFIED',
    resourceType: 'CoreBooking',
    resourceId: String(booking._id),
    referenceId: payment.providerRef || payment.providerOrderId || String(payment._id),
    fromState,
    toState: {
      paymentStatus: booking.paymentStatus,
      executionStatus: booking.executionStatus,
      paymentSummary: booking.paymentSummary,
    },
    why: paymentDetails.notes || 'Matched booking to an authoritative verified customer payment.',
    source: 'CUSTOMER_PAYMENT_LEDGER',
    authority: 'CORE_FINANCE',
    idempotencyKey: `booking_payment_verified_${booking._id}_${payment._id}`,
    traceContext: paymentDetails.traceContext,
  });
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
export async function submitCompletionEvidence(
  bookingId,
  vendorId,
  { deliverablesUrl, checklist = [], notes = '', files = [], photos = [], videos = [] } = {}
) {
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

  const filePhotos = files
    .filter((f) => (f.resourceType || '').toUpperCase() !== 'VIDEO')
    .map((f) => (typeof f === 'string' ? f : f.url))
    .filter(Boolean);

  const fileVideos = files
    .filter((f) => (f.resourceType || '').toUpperCase() === 'VIDEO')
    .map((f) => (typeof f === 'string' ? f : f.url))
    .filter(Boolean);

  const allPhotos = [...new Set([...(Array.isArray(photos) ? photos : []), ...filePhotos])];
  const allVideos = [...new Set([...(Array.isArray(videos) ? videos : []), ...fileVideos])];

  booking.completionEvidence.push({
    submittedBy: vendorId.toString(),
    submittedAt: new Date(),
    deliverablesUrl: deliverablesUrl || allPhotos[0] || allVideos[0] || '',
    photos: allPhotos,
    videos: allVideos,
    files: Array.isArray(files) ? files : [],
    checklist: checklist.map((item) => (typeof item === 'string' ? { item, checked: true } : item)),
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
  let booking = await CoreBooking.findById(bookingId).catch(() => null);
  if (!booking) {
    booking = await CoreBooking.findOne({
      $or: [{ quoteId: bookingId }, { bookingReference: bookingId }],
    });
  }
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
  await ensureInvoiceForBooking(booking, coreActor);
  booking.validationAudit = {
    verifiedBy: coreActor,
    verifiedAt: new Date(),
    notes: notes || 'Completion verified against checklist and deliverable proof',
  };

  await booking.save();

  if (booking.vendorId) {
    await recordLifecycleEventMessage({
      vendorId: booking.vendorId,
      customerId: booking.customerId,
      eventId: booking.customerEvent,
      bookingId: booking._id,
      sender: 'SYSTEM',
      senderName: 'STARVNT Core',
      text: `✓ Completion Verified: STARVNT Core validated service completion for ${booking.serviceName || 'booking'}. Vendor payout is now eligible for settlement.`,
      type: 'completion',
    }).catch(() => null);
  }

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

  const cleanReference = String(transactionReference || '').trim();
  if (!cleanReference) {
    const err = new Error('SETTLEMENT_REFERENCE_REQUIRED: A real bank/transfer reference is required before settlement can be marked released.');
    err.statusCode = 400;
    err.code = 'SETTLEMENT_REFERENCE_REQUIRED';
    throw err;
  }

  const financialProfile = await VendorFinancialProfile.findOne({ vendor: booking.vendorId }).lean().catch(() => null);
  if (financialProfile?.wallet?.isFrozen) {
    const err = new Error(`SETTLEMENT_WALLET_FROZEN: Vendor wallet is frozen pending review. ${financialProfile.wallet.freezeReason || ''}`.trim());
    err.statusCode = 409;
    err.code = 'SETTLEMENT_WALLET_FROZEN';
    throw err;
  }

  const tax = settlementMath(booking.totalAmount);
  booking.settlementStatus = 'SETTLED';
  booking.settlementDetails = {
    settledBy: coreActor,
    settledAt: new Date(),
    amount: tax.vendorPayable,
    grossAmount: booking.totalAmount,
    platformFee: tax.platformFee,
    gstAmount: tax.gstAmount,
    tdsAmount: tax.tdsAmount,
    vendorPayable: tax.vendorPayable,
    transactionReference: cleanReference,
  };

  await booking.save();
  await recordSettlementRelease(booking, coreActor);

  if (booking.vendorId) {
    await recordLifecycleEventMessage({
      vendorId: booking.vendorId,
      customerId: booking.customerId,
      eventId: booking.customerEvent,
      bookingId: booking._id,
      sender: 'SYSTEM',
      senderName: 'STARVNT Core',
      text: `🎉 Booking Fully Settled: Final settlement (₹${Number(booking.totalAmount || 0).toLocaleString('en-IN')}) released to vendor. Service lifecycle complete!`,
      type: 'payment',
    }).catch(() => null);
  }

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
