import { commercialSnapshot, assertCommercialSnapshot } from './commercialSnapshot.service.js';
import { serviceMatchingEligible } from '../../common/vendorReadiness.js';
import { Quote } from '../models/Quote.js';
import { Opportunity } from '../models/Opportunity.js';
import { isObjectIdOrHexString } from 'mongoose';
import { publishOutboxEvent, processOutboxBatch } from '../../automation/services/outbox.service.js';
import { evaluateVendorActivation } from './vendorActivation.service.js';
import { checkTrueAvailability } from './availability.service.js';
import { schedulingError, validDate } from '../../common/scheduleRules.js';
import { getCommercialPolicyForCategory } from '../../common/policyResolver.js';
import { quoteCreationCommand, quoteCreationConflict, prepareQuoteCreationEffects } from '../../common/quoteCreationCommand.js';

export async function recoverQuoteCreation(vendorId, command) {
  const identity = quoteCreationCommand(vendorId, command);
  if (!identity) return null;
  const row = await Quote.findOne({ vendor: vendorId, creationRequestKey: identity.key }).select('+creationRequestHash +creationRequestActor +creationEffects');
  if (!row) return null;
  if (row.creationRequestHash !== identity.hash || row.creationRequestActor !== identity.actor) throw quoteCreationConflict();
  row.$locals.creationRequestReplayed = true;
  return row;
}

export async function assertInitialQuoteSource({ opportunityId, vendorId, customerId, vendorServiceId, eventDate, expectedEnquiryUpdatedAt }) {
  if (!isObjectIdOrHexString(opportunityId)) throw schedulingError('OWNED_ENQUIRY_REQUIRED', 'Choose an enquiry assigned to this vendor before creating a quotation.', 400);
  const source = await Opportunity.findOne({ _id: opportunityId, vendor: vendorId }).select('customer vendorService status slaExpiresAt eventDate serviceLocation updatedAt').lean();
  if (!source) throw schedulingError('OPPORTUNITY_NOT_FOUND', 'This enquiry is unavailable.', 404);
  if (String(source.customer) !== String(customerId)) throw schedulingError('QUOTE_CUSTOMER_MISMATCH', 'The quotation recipient must match its enquiry.', 400);
  if (String(source.vendorService) !== String(vendorServiceId)) throw schedulingError('QUOTE_SERVICE_MISMATCH', 'The quotation service must match its enquiry.', 400);
  const sourceTime = source.updatedAt == null ? null : new Date(source.updatedAt);
  if ((sourceTime && !Number.isFinite(sourceTime.getTime())) || !validDate(source.eventDate)) throw schedulingError('ENQUIRY_SOURCE_INCOMPLETE', 'The enquiry date or source version requires review.', 409);
  if (expectedEnquiryUpdatedAt !== undefined && (typeof expectedEnquiryUpdatedAt !== 'string' || expectedEnquiryUpdatedAt !== sourceTime?.toISOString())) throw schedulingError('ENQUIRY_VERSION_CONFLICT', 'The enquiry changed after review. Refresh it and confirm the current scope.', 409);
  if (eventDate !== undefined && eventDate !== source.eventDate) throw schedulingError('ENQUIRY_SCOPE_CHANGED', 'The quotation date must match the current enquiry. Review the changed scope before submitting.', 409);
  if (!['NEW', 'VIEWED', 'RESPONDED'].includes(source.status)) throw schedulingError('ENQUIRY_NOT_OPEN', 'This enquiry cannot accept a new quotation. Review its current state or existing quote.', 409);
  if (source.slaExpiresAt != null) {
    const deadline = new Date(source.slaExpiresAt).getTime();
    if (!Number.isFinite(deadline) || deadline <= Date.now()) throw schedulingError('ENQUIRY_DEADLINE_PASSED', 'The enquiry deadline is over or requires review. Existing quotes remain available.', 409);
  }
  return source;
}

export async function assertQuoteSubmission({ vendor, vendorService, eventDate, serviceLocation, category, advancePolicy }) {
  const status = await evaluateVendorActivation(vendor?._id || vendor);
  if (!serviceMatchingEligible(status, vendorService)) throw schedulingError('ACTIVATION_REQUIRED', 'Activation approval and complete verification are required to submit offers.', 403);
  const available = await checkTrueAvailability({ vendorId: vendor?._id || vendor, vendorServiceId: vendorService, date: eventDate, allDay: true, serviceLocation });
  if (!available.feasible) throw schedulingError('SCHEDULE_CONFLICT', available.reason || 'The vendor is unavailable.', 409, available.conflicts);
  const policy = advancePolicy || await getCommercialPolicyForCategory(category || vendor?.category);
  if (!policy?.policyActive || !Number.isFinite(Number(policy.minimumReservationPercent))) {
    throw schedulingError('FINANCIAL_POLICY_NOT_APPROVED', 'A financial policy must be approved and effective before this quote can be issued.', 409);
  }
  return policy;
}

/**
 * Valid state transitions for Quotes (Spec §9, §10, Golden Test G).
 *
 * DRAFT -> SUBMITTED -> APPROVED / REJECTED / EXPIRED
 */
const ALLOWED_TRANSITIONS = {
  DRAFT: ['SUBMITTED', 'EXPIRED'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'EXPIRED'],
  APPROVED: [], // Terminal
  REJECTED: [], // Terminal
  EXPIRED: [],  // Terminal
};

/**
 * Creates a new Quote proposal.
 */
export async function createQuote({
  opportunityId,
  vendorId,
  customerId,
  vendorServiceId,
  serviceName,
  eventDate,
  serviceLocation,
  pricingBreakdown,
  notes = '',
  status = 'DRAFT',
  actor = 'VENDOR',
  advancePolicy,
  category = '',
  creationCommand,
  expectedEnquiryUpdatedAt,
}) {
  const command = quoteCreationCommand(vendorId, creationCommand);
  const prior = await recoverQuoteCreation(vendorId, creationCommand);
  if (prior) return prior;
  const source = await assertInitialQuoteSource({ opportunityId, vendorId, customerId, vendorServiceId, eventDate, expectedEnquiryUpdatedAt });
  eventDate = source.eventDate;
  // Exact source location stays on the server and in immutable quote evidence.
  // A client's masked/coarse display is not an authoritative venue update.
  serviceLocation = { address: source.serviceLocation?.address || '', locality: source.serviceLocation?.locality || '', city: source.serviceLocation?.city || '' };
  const point = source.serviceLocation?.coordinates;
  if (Number.isFinite(point?.lat) && Number.isFinite(point?.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180) serviceLocation.coordinates = { lat: point.lat, lng: point.lng };
  const initialStatus = ['DRAFT', 'SUBMITTED'].includes(status) ? status : 'DRAFT';
  if (initialStatus === 'SUBMITTED') advancePolicy = await assertQuoteSubmission({ vendor: vendorId, vendorService: vendorServiceId, eventDate, serviceLocation, category, advancePolicy });

  const quote = new Quote({
    creationEnquiryUpdatedAt: source.updatedAt == null ? undefined : new Date(source.updatedAt),
    ...(command ? { creationRequestKey: command.key, creationRequestHash: command.hash, creationRequestActor: command.actor } : {}),
    opportunity: opportunityId || null,
    vendor: vendorId,
    customer: customerId,
    vendorService: vendorServiceId,
    serviceName,
    eventDate,
    serviceLocation: serviceLocation || {},
    pricingBreakdown,
    category,
    advancePayment: advancePolicy?.policyActive ? {
      percentage: advancePolicy.minimumReservationPercent,
      amount: 0,
      policySnapshot: {
        category: advancePolicy.policyCategory || category || 'Global',
        version: advancePolicy.policyVersion || 0,
        source: advancePolicy.policySource || 'APPROVED',
        appliedAt: new Date(),
        effectiveFrom: advancePolicy.effectiveFrom || null,
        policyId: advancePolicy.policyId || null,
        authorId: advancePolicy.draftAuthorId || null,
        approverId: advancePolicy.approverId || null,
        terms: {
          vendorCancellationPenaltyPercent: advancePolicy.vendorCancellationPenaltyPercent ?? 0,
          customerCancellationRefunds: advancePolicy.customerCancellationRefunds || {},
          settlementCondition: advancePolicy.settlementCondition,
          settlementDelayDays: advancePolicy.settlementDelayDays,
          completionRequirements: advancePolicy.completionRequirements,
          manualFinanceAllowed: advancePolicy.manualFinanceAllowed,
          partialRefundAllowed: advancePolicy.partialRefundAllowed,
          partialSettlementAllowed: advancePolicy.partialSettlementAllowed,
        },
      },
    } : undefined,
    notes,
    status: initialStatus,
    history: [
      {
        fromStatus: 'NONE',
        toStatus: initialStatus,
        changedBy: actor,
        reason: 'Initial quote proposal created',
        timestamp: new Date(),
      },
    ],
  });

  if (initialStatus === 'SUBMITTED') {
    quote.commercialSnapshot = commercialSnapshot(quote, quote.pricingBreakdown);
    if (command) quote.creationEffects = prepareQuoteCreationEffects(quote);
  }
  try { await quote.save(); }
  catch (error) {
    if (command && error.code === 11000) { const prior = await recoverQuoteCreation(vendorId, creationCommand); if (prior) return prior; }
    throw error;
  }
  return quote;
}

/**
 * Transitions a quote to a new target status enforcing server-side state integrity.
 *
 * Rejects invalid transitions with controlled INVALID_QUOTE_TRANSITION error (Golden Test G).
 */
export async function transitionQuote(quoteId, targetStatus, { actor = 'SYSTEM', reason = '' } = {}) {
  const quote = await Quote.findById(quoteId);
  if (!quote) {
    const error = new Error(`Quote with ID ${quoteId} not found`);
    error.statusCode = 404;
    error.code = 'QUOTE_NOT_FOUND';
    throw error;
  }

  const currentStatus = quote.status;
  if (targetStatus === 'APPROVED') assertCommercialSnapshot(quote);
  let submissionPolicy = null;
  if (targetStatus === 'SUBMITTED') submissionPolicy = await assertQuoteSubmission({ ...quote.toObject(), category: quote.category || quote.vendor?.category });
  const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];

  if (!allowedNext.includes(targetStatus)) {
    const error = new Error(
      `INVALID_QUOTE_TRANSITION: Cannot transition quote from '${currentStatus}' to '${targetStatus}'. Allowed: [${allowedNext.join(', ')}]`
    );
    error.statusCode = 400;
    error.code = 'INVALID_QUOTE_TRANSITION';
    error.details = { currentStatus, targetStatus, allowedNext };
    throw error;
  }

  // Update status and history
  quote.status = targetStatus;
  if (targetStatus === 'SUBMITTED' && submissionPolicy) {
    quote.commercialSnapshot = commercialSnapshot(quote, quote.pricingBreakdown, (quote.commercialSnapshot?.version || 0) + 1);
    quote.advancePayment = {
      ...(quote.advancePayment?.toObject?.() || quote.advancePayment || {}),
      percentage: submissionPolicy.minimumReservationPercent,
      amount: 0,
      status: 'NOT_STARTED',
      policySnapshot: {
        category: submissionPolicy.policyCategory || quote.category || 'Global',
        version: submissionPolicy.policyVersion,
        source: 'APPROVED',
        appliedAt: new Date(),
        effectiveFrom: submissionPolicy.effectiveFrom || null,
        policyId: submissionPolicy.policyId || null,
        authorId: submissionPolicy.draftAuthorId || null,
        approverId: submissionPolicy.approverId || null,
        terms: {
          vendorCancellationPenaltyPercent: submissionPolicy.vendorCancellationPenaltyPercent ?? 0,
          customerCancellationRefunds: submissionPolicy.customerCancellationRefunds || {},
          settlementCondition: submissionPolicy.settlementCondition,
          settlementDelayDays: submissionPolicy.settlementDelayDays,
          completionRequirements: submissionPolicy.completionRequirements,
          manualFinanceAllowed: submissionPolicy.manualFinanceAllowed,
          partialRefundAllowed: submissionPolicy.partialRefundAllowed,
          partialSettlementAllowed: submissionPolicy.partialSettlementAllowed,
        },
      },
    };
  }
  quote.history.push({
    fromStatus: currentStatus,
    toStatus: targetStatus,
    changedBy: actor,
    reason: reason || `Transitioned to ${targetStatus}`,
    timestamp: new Date(),
  });

  await quote.save();

  // If quote is APPROVED, publish QUOTE_APPROVED event to Central Automation Outbox
  if (targetStatus === 'APPROVED') {
    // Approval is a customer decision, not payment or booking confirmation.
    // The verified-payment workflow owns schedule validation and booking creation.
    await publishOutboxEvent({
      eventType: 'QUOTE_APPROVED',
      aggregateType: 'Quote',
      aggregateId: quote._id.toString(),
      payload: {
        quoteId: quote._id.toString(),
        quoteReference: quote.quoteReference,
        opportunityId: quote.opportunity ? quote.opportunity.toString() : null,
        vendorId: quote.vendor.toString(),
        customerId: quote.customer.toString(),
        serviceName: quote.serviceName,
        eventDate: quote.eventDate,
        serviceLocation: quote.serviceLocation,
        pricing: quote.pricingBreakdown,
        amount: quote.pricingBreakdown?.totalAmount || 0,
      },
      idempotencyKey: `quote-approved-${quote._id.toString()}`,
    });

    // Run outbox dispatcher to immediately process the approved quote
    try {
      await processOutboxBatch({ batchSize: 5, immediate: true });
    } catch (err) {
      console.error('[quoteStateMachine] Outbox processing notice:', err.message);
    }
  }

  return quote;
}
