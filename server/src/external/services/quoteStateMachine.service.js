import { Quote } from '../models/Quote.js';
import { publishOutboxEvent, processOutboxBatch } from '../../automation/services/outbox.service.js';

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
}) {
  const initialStatus = ['DRAFT', 'SUBMITTED'].includes(status) ? status : 'DRAFT';

  const quote = await Quote.create({
    opportunity: opportunityId || null,
    vendor: vendorId,
    customer: customerId,
    vendorService: vendorServiceId,
    serviceName,
    eventDate,
    serviceLocation: serviceLocation || {},
    pricingBreakdown,
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
