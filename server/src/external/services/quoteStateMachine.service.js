import { Quote } from '../models/Quote.js';
import { Opportunity } from '../models/Opportunity.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { publishOutboxEvent, processOutboxBatch } from '../../automation/services/outbox.service.js';
import { evaluateVendorActivation } from './vendorActivation.service.js';
import { checkTrueAvailability } from './availability.service.js';
import { schedulingError } from '../../common/scheduleRules.js';
import { getCommercialPolicyForCategory } from '../../common/policyResolver.js';

export async function assertQuoteSubmission({ vendor, vendorService, eventDate, serviceLocation, category, advancePolicy }) {
  const status = await evaluateVendorActivation(vendor?._id || vendor);
  if (!status.matchingEligible) throw schedulingError('ACTIVATION_REQUIRED', 'Activation approval and complete verification are required to submit offers.', 403);
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
}) {
  const initialStatus = ['DRAFT', 'SUBMITTED'].includes(status) ? status : 'DRAFT';
  if (initialStatus === 'SUBMITTED') await assertQuoteSubmission({ vendor: vendorId, vendorService: vendorServiceId, eventDate, serviceLocation, category, advancePolicy });

  const quote = await Quote.create({
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
