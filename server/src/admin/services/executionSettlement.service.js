import { workflowError, runBookingCommand, requireCoreActor, hasOpenDisputes, evidenceFiles, authorizeEvidenceFiles, requestHash, findCoreBooking, assertBookingActor } from './bookingWorkflow.service.js';
import { getCommercialPolicyForCategory } from '../../common/policyResolver.js';
import { Quote } from '../../external/models/Quote.js';
import { Opportunity } from '../../external/models/Opportunity.js';
import { Booking, EventRequirement, CustomerEvent } from '../../customer/models/index.js';
import { CoreBooking } from '../models/CoreBooking.js';
import { matchVendorsForRequirement } from '../../external/services/matching.service.js';
import { recordLifecycleEventMessage } from '../../customer/services/circle.service.js';
import { VendorFinancialProfile } from '../../external/models/VendorFinancialProfile.js';
import { Payment, Reservation } from '../../customer/models/index.js';
import { ensureInvoiceForBooking, recordSettlementRelease, settlementMath } from './financeLedger.service.js';
import { recordBusinessAudit } from '../utils/audit.js';
import { config } from '../../config.js';

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
    customer: booking.customerId,
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
  const reservation = await Reservation.findOne({ _id: payment.reservation, customer: booking.customerId }).lean();
  const sameReservation = booking.reservationId && String(booking.reservationId) === String(payment.reservation);
  const sameQuote = booking.quoteId && reservation && String(reservation.quote) === String(booking.quoteId);
  if ((!sameReservation && !sameQuote) || (booking.customerEvent && String(booking.customerEvent) !== String(payment.event))) {
    throw Object.assign(new Error('Verified receipt does not belong to this booking.'), { code: 'PAYMENT_CONTEXT_MISMATCH', statusCode: 409 });
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

export function getExecutionProjection(booking) {
  return { bookingId: String(booking._id), version: booking.workflowVersion || 0,
    bookingStatus: booking.bookingStatus, paymentStatus: booking.paymentStatus,
    executionStatus: booking.executionStatus, protectionStatus: booking.protectionStatus,
    execution: booking.execution?.toObject?.() || booking.execution || {},
    completionEvidence: booking.completionEvidence || [], validation: booking.validationAudit,
    completionPolicy: booking.completionPolicySnapshot || booking.financialPolicySnapshot || null };
}

export function completionRequirements(booking) {
  const snapshot = booking.completionPolicySnapshot || booking.financialPolicySnapshot;
  if (!snapshot?.completionRequirements || !(snapshot.version > 0 || snapshot.policyVersion > 0)) {
    throw workflowError('COMPLETION_POLICY_REQUIRED', 'Core must attach an approved service-specific completion policy before validation.', 409);
  }
  return snapshot.completionRequirements;
}

export async function assignCompletionPolicy(bookingId, input, actor) {
  requireCoreActor(actor);
  const booking = await findCoreBooking(bookingId);
  const policy = await getCommercialPolicyForCategory(booking.category);
  if (!policy.policyActive || !policy.completionRequirements) throw workflowError('COMPLETION_POLICY_REQUIRED', 'Approve completion requirements for this service category first.', 409);
  return runBookingCommand(bookingId, { actor, action: 'COMPLETION_POLICY_ATTACHED', input, key: input.idempotencyKey, expectedVersion: input.expectedVersion }, row => {
    if (row.executionStatus === 'COMPLETION_VERIFIED' || row.financeOperations.some(op => op.status === 'CONFIRMED')) throw workflowError('POLICY_LOCKED', 'Verified services retain their agreed completion policy.', 409);
    row.completionPolicySnapshot = { policyId: policy.policyId, category: policy.policyCategory, version: policy.policyVersion,
      source: 'APPROVED', appliedBy: actor.id, appliedAt: new Date(), completionRequirements: policy.completionRequirements };
  });
}

export async function recordExecutionAction(bookingId, vendorId, input = {}, actorId = vendorId) {
  const actor = { id: String(actorId), vendorId: String(vendorId), type: 'VENDOR' };
  const { action, milestone, notes = '' } = input;
  return runBookingCommand(bookingId, { actor, action: `EXECUTION_${action}`, input, key: input.idempotencyKey, expectedVersion: input.expectedVersion }, booking => {
    if (booking.bookingStatus !== 'CONFIRMED' || booking.paymentStatus !== 'PAYMENT_VERIFIED') throw workflowError('BOOKING_NOT_EXECUTABLE', 'A confirmed booking and verified required payment are needed.', 409);
    if (['COMPLETION_SUBMITTED', 'COMPLETION_VERIFIED'].includes(booking.executionStatus)) throw workflowError('INVALID_EXECUTION_STATE', 'Completion has already been submitted.', 409);
    if (action === 'CHECK_IN') {
      if (booking.execution.checkedInAt || !['NOT_STARTED', 'SERVICE_SCHEDULED'].includes(booking.executionStatus)) throw workflowError('INVALID_EXECUTION_STATE', 'Check-in must precede service start.', 409);
      booking.execution.checkedInAt = new Date();
      booking.executionStatus = 'CHECKED_IN';
    } else if (action === 'START') {
      const requirements = (booking.completionPolicySnapshot || booking.financialPolicySnapshot)?.completionRequirements;
      if (requirements?.requireCheckIn && !booking.execution.checkedInAt) throw workflowError('CHECK_IN_REQUIRED', 'Record check-in before starting this service.', 409);
      if (booking.executionStatus === 'SERVICE_STARTED') return;
      if (!['NOT_STARTED', 'SERVICE_SCHEDULED', 'CHECKED_IN'].includes(booking.executionStatus)) throw workflowError('INVALID_EXECUTION_STATE', 'This service cannot start from its current state.', 409);
      booking.execution.startedAt = new Date();
      booking.executionStatus = 'SERVICE_STARTED';
    } else if (action === 'MILESTONE') {
      if (booking.executionStatus !== 'SERVICE_STARTED') throw workflowError('SERVICE_NOT_STARTED', 'Start the service before recording milestones.', 409);
      const key = String(milestone?.key || '').trim();
      if (!key || key.length > 100 || booking.execution.milestones.some(item => item.key === key)) throw workflowError('INVALID_MILESTONE', 'Provide a new milestone identifier. Corrections require Core review.', 409);
      booking.execution.milestones.push({ key, detail: String(milestone.detail || notes).slice(0, 2000), at: new Date(), actor: actor.id });
    } else if (action === 'CORRECT_MILESTONE') {
      const item = booking.execution.milestones.find(item => item.key === milestone?.key);
      if (!item || !String(input.reason || '').trim()) throw workflowError('CORRECTION_REASON_REQUIRED', 'Select a recorded milestone and explain the correction.');
      const policy = completionRequirements(booking);
      if (!policy.allowMilestoneCorrection) throw workflowError('CORRECTION_REVIEW_REQUIRED', 'The approved policy requires Core review for this correction.', 409);
      item.corrections.push({ previousDetail: item.detail, detail: String(milestone.detail || '').slice(0, 2000), actor: actor.id, at: new Date(), reason: String(input.reason).slice(0, 1000) });
      item.detail = String(milestone.detail || '').slice(0, 2000);
      item.correctedAt = new Date(); item.correctionReason = String(input.reason).slice(0, 1000);
    } else throw workflowError('INVALID_EXECUTION_ACTION', 'Choose check-in, start or milestone.');
  });
}

export function startService(bookingId, vendorId, input = {}, actorId = vendorId) {
  return recordExecutionAction(bookingId, vendorId, { ...input, action: 'START', idempotencyKey: input.idempotencyKey || `legacy-start-${bookingId}` }, actorId);
}

export async function submitCompletionEvidence(bookingId, vendorId, input = {}, actorId = vendorId) {
  const files = evidenceFiles([...(input.files || []), ...(input.photos || []), ...(input.videos || [])]);
  const notes = String(input.notes || '').trim().slice(0, 4000);
  if (!files.length && !notes) throw workflowError('COMPLETION_EVIDENCE_REQUIRED', 'Add completion evidence or an explanation.');
  if (!Array.isArray(input.checklist || []) || (input.checklist || []).length > 50) throw workflowError('INVALID_CHECKLIST', 'Add up to 50 checklist entries.');
  const actor = { id: String(actorId), vendorId: String(vendorId), type: 'VENDOR' };
  return runBookingCommand(bookingId, { actor, action: 'COMPLETION_SUBMITTED', input,
    key: input.idempotencyKey || `legacy-evidence-${requestHash(input)}`, expectedVersion: input.expectedVersion }, async booking => {
    await authorizeEvidenceFiles(files, booking, actor, 'COMPLETION_EVIDENCE');
    if (booking.bookingStatus !== 'CONFIRMED' || booking.paymentStatus !== 'PAYMENT_VERIFIED') throw workflowError('BOOKING_NOT_EXECUTABLE', 'Verified payment is required.', 409);
    if (!['SERVICE_STARTED', 'COMPLETION_SUBMITTED'].includes(booking.executionStatus)) throw workflowError('INVALID_EXECUTION_STATE', 'Start the service before submitting completion.', 409);
    if (input.deliverablesUrl && !files.length) throw workflowError('PRIVATE_EVIDENCE_REQUIRED', 'Attach deliverables through the authorized private evidence upload.');
    booking.completionEvidence.push({ submittedBy: actor.id, submittedAt: new Date(), deliverablesUrl: files[0]?.url || '', files,
      checklist: (input.checklist || []).map(item => typeof item === 'string' ? { item, checked: true } : { item: String(item.item).slice(0, 150), checked: item.checked === true }), notes });
    booking.execution.submittedAt = new Date();
    booking.execution.customerAcknowledgement = undefined;
    booking.executionStatus = 'COMPLETION_SUBMITTED';
  });
}

export async function acknowledgeCompletion(bookingId, customerId, input = {}) {
  const actor = { id: String(customerId), type: 'CUSTOMER' };
  const current = await findCoreBooking(bookingId);
  const evidenceIdentity = current.completionEvidence.at(-1)?._id || current.execution?.submittedAt || 'none';
  return runBookingCommand(bookingId, { actor, action: 'CUSTOMER_ACKNOWLEDGED', input,
    key: input.idempotencyKey || `legacy-ack-${bookingId}-${evidenceIdentity}`, expectedVersion: input.expectedVersion }, booking => {
    if (!['COMPLETION_SUBMITTED', 'COMPLETION_VERIFIED'].includes(booking.executionStatus)) throw workflowError('BOOKING_NOT_READY', 'The vendor must submit completion evidence first.', 409);
    booking.execution.customerAcknowledgement = { actor: actor.id, at: new Date(), notes: String(input.notes || '').slice(0, 2000) };
  });
}

export function assertCompletionEvidence(booking) {
  const requirements = completionRequirements(booking);
  const evidence = booking.completionEvidence.at(-1);
  if (!evidence) throw workflowError('COMPLETION_EVIDENCE_REQUIRED', 'Completion evidence is required.', 409);
  const checklist = new Set(evidence.checklist.filter(item => item.checked).map(item => item.item));
  const milestones = new Set(booking.execution.milestones.map(item => item.key));
  const missing = [...(requirements.requiredChecklist || []).filter(item => !checklist.has(item)),
    ...(requirements.requiredMilestones || []).filter(item => !milestones.has(item))];
  if (missing.length) throw workflowError('COMPLETION_REQUIREMENTS_MISSING', `Missing required evidence or milestones: ${missing.join(', ')}`, 409);
  if (requirements.evidenceRequired && !evidence.files.length && !evidence.deliverablesUrl && !evidence.photos.length && !evidence.videos.length) throw workflowError('COMPLETION_EVIDENCE_REQUIRED', 'The approved policy requires supporting media or documents.', 409);
  if (requirements.customerAcknowledgementRequired && !booking.execution.customerAcknowledgement?.at) throw workflowError('CUSTOMER_ACKNOWLEDGEMENT_REQUIRED', 'The approved policy requires customer acknowledgement.', 409);
  if (requirements.requireCheckIn && !booking.execution.checkedInAt) throw workflowError('CHECK_IN_REQUIRED', 'The approved policy requires a recorded check-in.', 409);
}

export async function validateCompletionFromCore(bookingId, input = {}, actor) {
  requireCoreActor(actor);
  return runBookingCommand(bookingId, { actor, action: input.approved === false ? 'COMPLETION_REJECTED' : 'COMPLETION_VERIFIED', input,
    key: input.idempotencyKey || `validate-${bookingId}-${requestHash(input)}`, expectedVersion: input.expectedVersion }, booking => {
    if (booking.executionStatus !== 'COMPLETION_SUBMITTED') throw workflowError('INVALID_VALIDATION_STATE', 'The vendor must submit completion evidence before Core review.', 409);
    if (!String(input.notes || '').trim()) throw workflowError('REVIEW_NOTES_REQUIRED', 'Record the evidence review decision.');
    if (input.approved === false) {
      booking.validationAudit = { verifiedBy: actor.id, verifiedAt: null, notes: `Further evidence required: ${input.notes}` };
      return;
    }
    assertCompletionEvidence(booking);
    const policy = booking.financialPolicySnapshot;
    if (!policy || !(policy.version > 0 || policy.policyVersion > 0) || !Number.isInteger(policy.settlementDelayDays)) throw workflowError('SETTLEMENT_POLICY_REQUIRED', 'An approved settlement policy is required.', 409);
    if (policy.settlementCondition === 'EVENT_DATE_PASSED' && booking.eventDate >= new Date().toISOString().slice(0, 10)) throw workflowError('EVENT_NOT_FINISHED', 'The approved policy requires the service date to pass.', 409);
    booking.executionStatus = 'COMPLETION_VERIFIED';
    if (!booking.taxSummary?.invoiceNumber) booking.taxSummary = { ...settlementMath(booking.totalAmount, booking.financialPolicySnapshot), invoiceNumber: `INV-${String(booking._id).slice(-8).toUpperCase()}`, invoiceIssuedAt: new Date() };
    booking.payoutReviewAt = new Date(Date.now() + policy.settlementDelayDays * 86400000);
    booking.settlementStatus = hasOpenDisputes(booking) ? 'SETTLEMENT_HOLD' : policy.settlementDelayDays ? 'NOT_ELIGIBLE' : 'SETTLEMENT_ELIGIBLE';
    booking.validationAudit = { verifiedBy: actor.id, verifiedAt: new Date(), notes: input.notes };
  });
}

export async function originalBookingRequirement(booking) {
  if (booking.requirementSnapshot) return booking.requirementSnapshot;
  const quote = booking.quoteId ? await Quote.findById(booking.quoteId).lean().catch(() => null) : null;
  const opportunityId = booking.opportunityId || quote?.opportunity;
  const opportunity = opportunityId ? await Opportunity.findById(opportunityId).lean().catch(() => null) : null;
  const customerBooking = booking.customerBookingId ? await Booking.findById(booking.customerBookingId).lean() : null;
  const requirementId = booking.requirementId || opportunity?.customerRequirement || customerBooking?.requirement;
  const requirement = requirementId ? await EventRequirement.findById(requirementId).lean() : null;
  const eventId = booking.customerEvent || opportunity?.customerEvent || customerBooking?.event;
  const event = eventId ? await CustomerEvent.findOne({ _id: eventId, customer: booking.customerId }).lean() : null;
  const preferences = requirement?.preferences || {};
  return { category: booking.category, vendorService: booking.vendorService || quote?.vendorService,
    date: booking.eventDate, serviceLocation: booking.serviceLocation,
    guestCount: preferences.guestCount ?? opportunity?.guestCount ?? event?.guestCount ?? null,
    durationHours: preferences.durationHours ?? null, startTime: preferences.startTime ?? null, endTime: preferences.endTime ?? null,
    requiredStyles: preferences.styles || (preferences.style ? [preferences.style] : []), deliverables: preferences.deliverables || null,
    operationalConstraints: requirement?.specialRequirements || event?.specialRequirements || '',
    budget: preferences.budget ?? event?.budget ?? null, commercialSnapshot: booking.commercialSnapshot || quote?.commercialSnapshot || booking.pricing,
    requirementId, eventId, provenance: 'PERSISTED_BOOKING_REQUIREMENT' };
}

export async function replacementOptions(bookingId, actor) {
  const booking = await findCoreBooking(bookingId);
  assertBookingActor(booking, actor);
  if (!['FAILED', 'CANCELLED'].includes(booking.bookingStatus)) throw workflowError('REPLACEMENT_REVIEW_REQUIRED', 'Report the service problem before requesting replacement options.', 409);
  const originalRequirement = await originalBookingRequirement(booking);
  const missing = ['category', 'date', 'guestCount', 'durationHours', 'startTime', 'endTime'].filter(key => originalRequirement[key] == null || originalRequirement[key] === '');
  if (!originalRequirement.serviceLocation?.city) missing.push('serviceLocation');
  if (missing.length) return { originalBookingId: String(booking._id), originalRequirement, alternativeCandidates: [], matchSummary: { status: 'REQUIREMENT_CLARIFICATION_REQUIRED', missing } };
  const matches = await matchVendorsForRequirement({ ...originalRequirement, excludeVendorIds: [booking.vendorId] });
  return { originalBookingId: String(booking._id), originalRequirement, alternativeCandidates: matches.eligibleCandidates,
    matchSummary: { status: 'ALTERNATIVES_REQUIRE_CUSTOMER_DECISION', totalFound: matches.eligibleCandidates.length } };
}

export async function chooseReplacement(bookingId, input, actor) {
  if (actor?.type !== 'CUSTOMER') throw workflowError('CUSTOMER_DECISION_REQUIRED', 'The booking customer must choose the replacement.', 403);
  const options = await replacementOptions(bookingId, actor);
  const option = options.alternativeCandidates.find(candidate => String(candidate.serviceId) === String(input.vendorServiceId));
  if (!option) throw workflowError('REPLACEMENT_OPTION_UNAVAILABLE', 'Refresh the available replacement options.', 409);
  return runBookingCommand(bookingId, { actor, action: 'REPLACEMENT_SELECTED', input, key: input.idempotencyKey, expectedVersion: input.expectedVersion }, booking => {
    booking.replacementDecision = { actor: actor.id, at: new Date(), vendorId: option.vendorId, vendorServiceId: option.serviceId,
      status: 'QUOTE_AND_VERIFIED_PAYMENT_REQUIRED', originalBookingId: String(booking._id), requirement: options.originalRequirement };
  });
}

export async function handleVendorFailureAndDiscoverAlternatives(bookingId, input = {}) {
  const initial = await findCoreBooking(bookingId);
  const actor = input.actor;
  if (!actor) throw workflowError('FAILURE_ACTOR_REQUIRED', 'An authenticated actor must report the failure.', 403);
  const originalRequirement = await originalBookingRequirement(initial);
  const failedBooking = await runBookingCommand(bookingId, { actor, action: 'VENDOR_FAILURE_REPORTED', input,
    key: input.idempotencyKey, expectedVersion: input.expectedVersion }, booking => {
    if (!String(input.reason || '').trim()) throw workflowError('FAILURE_REASON_REQUIRED', 'Explain why the booking cannot be fulfilled.');
    if (booking.bookingStatus !== 'CONFIRMED' || booking.executionStatus === 'COMPLETION_VERIFIED') throw workflowError('FAILURE_REVIEW_REQUIRED', 'Report a protection case for an already completed or closed booking.', 409);
    booking.bookingStatus = 'FAILED'; booking.protectionStatus = 'UNDER_REVIEW';
    if (booking.settlementStatus !== 'SETTLED') booking.settlementStatus = 'SETTLEMENT_HOLD';
    booking.requirementSnapshot = originalRequirement;
    booking.failureAudit = { failedBy: actor.id, failedAt: new Date(), reason: input.reason };
    booking.disputes.push({ reportedBy: actor.type === 'VENDOR' ? 'VENDOR' : actor.type === 'CUSTOMER' ? 'CUSTOMER' : 'SYSTEM', actorId: actor.id,
      requestKey: input.idempotencyKey, description: input.reason, issueType: 'VENDOR_FAILURE', status: 'UNDER_REVIEW' });
  });
  const missing = ['category', 'date', 'guestCount', 'durationHours', 'startTime', 'endTime'].filter(key => originalRequirement[key] == null || originalRequirement[key] === '');
  if (!originalRequirement.serviceLocation?.city) missing.push('serviceLocation');
  if (missing.length) return { failedBooking, originalRequirement, alternativeCandidates: [], matchSummary: { status: 'REQUIREMENT_CLARIFICATION_REQUIRED', missing } };
  const matches = await matchVendorsForRequirement({ ...originalRequirement, excludeVendorIds: [failedBooking.vendorId] });
  return { failedBooking, originalRequirement, alternativeCandidates: matches.eligibleCandidates,
    matchSummary: { status: 'ALTERNATIVES_REQUIRE_CUSTOMER_DECISION', totalFound: matches.eligibleCandidates.length,
      serviceLocation: originalRequirement.serviceLocation, eventDate: originalRequirement.date, originalBookingId: String(failedBooking._id) } };
}

export async function assertEventCompletionReady(eventId, customerId) {
  const event = await CustomerEvent.findOne({ _id: eventId, customer: customerId }).lean();
  if (!event) throw workflowError('EVENT_NOT_FOUND', 'Event not found.', 404);
  const bookings = await CoreBooking.find({ customerEvent: eventId, customerId }).lean();
  if (!bookings.length) throw workflowError('EVENT_COMPLETION_BOOKINGS_REQUIRED', 'Core service records are required to validate event completion.', 409);
  const blockers = [];
  for (const booking of bookings) {
    let reason;
    if (hasOpenDisputes(booking)) reason = 'OPEN_PROTECTION_CASE';
    else if (booking.bookingStatus === 'CONFIRMED' && booking.executionStatus !== 'COMPLETION_VERIFIED') reason = 'CORE_COMPLETION_REVIEW_REQUIRED';
    else if (booking.bookingStatus !== 'CONFIRMED' && booking.paymentStatus !== 'REFUNDED' && Number(booking.paymentSummary?.paidAmount || 0) > 0) {
      const resolutions = (booking.disputes || []).filter(item => item.status === 'RESOLVED').map(item => item.resolution).filter(Boolean);
      const refunds = (booking.financeOperations || []).filter(op => op.kind === 'REFUND' && op.status === 'CONFIRMED').reduce((sum, op) => sum + op.amount, 0);
      const refundedRemedy = resolutions.some(r => ['REFUND', 'PARTIAL_REFUND'].includes(r.decision) && r.refundAmount > 0 && refunds >= r.refundAmount);
      const replacement = booking.replacementDecision;
      const replaced = replacement?.actor === String(customerId) && resolutions.some(r => r.decision === 'REPLACEMENT') && bookings.some(candidate =>
        String(candidate._id) !== String(booking._id) && String(candidate.vendorService) === String(replacement.vendorServiceId) &&
        String(candidate.vendorId) === String(replacement.vendorId) && candidate.bookingStatus === 'CONFIRMED' && candidate.paymentStatus === 'PAYMENT_VERIFIED' && candidate.executionStatus === 'COMPLETION_VERIFIED');
      if (!refundedRemedy && !replaced) reason = 'EXECUTED_REMEDY_OR_APPROVED_CLOSURE_POLICY_REQUIRED';
    }
    if (reason) blockers.push({ bookingId: String(booking._id), reason });
  }
  if (blockers.length) { const error = workflowError('EVENT_COMPLETION_REVIEW_REQUIRED', 'Complete Core service reviews and applicable protection remedies before closing this event.', 409); error.blockers = blockers; throw error; }
  return { ready: true, reviewedBookings: bookings.length };
}

// Legacy settle entry point now requests reconciliation instead of treating a
// bank reference supplied by a client as confirmed money movement.
export async function settleBooking(bookingId, input, actor) {
  const { requestFinanceOperation } = await import('./financeOperations.service.js');
  return requestFinanceOperation(bookingId, { ...input, kind: 'SETTLEMENT', method: input.method || 'MANUAL' }, actor);
}
