import { Quote } from '../models/Quote.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { publishOutboxEvent, processOutboxBatch } from '../../automation/services/outbox.service.js';
import { getCommercialPolicyForCategory } from '../../common/policyResolver.js';

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
    try {
      const policy = await getCommercialPolicyForCategory(quote.category || quote.serviceName);
      const advancePercentage = policy.minimumReservationPercent ?? 20;
      const totalAmount = quote.pricingBreakdown?.totalAmount || quote.amount || 0;
      const advanceAmount = quote.advancePayment?.amount || Math.round((totalAmount * advancePercentage) / 100);
      await CoreBooking.findOneAndUpdate(
        { quoteId: quote._id.toString() },
        {
          $setOnInsert: {
            quoteId: quote._id.toString(),
            quoteReference: quote.quoteReference || `QT-${quote._id.toString().slice(-6)}`,
            bookingReference: `BK-${Math.floor(1000 + Math.random() * 9000)}`,
            opportunityId: quote.opportunity ? quote.opportunity.toString() : null,
            vendorId: quote.vendor,
            customerId: quote.customer,
            serviceName: quote.serviceName || 'Event Service',
            eventDate: quote.eventDate || new Date().toISOString().split('T')[0],
            serviceLocation: quote.serviceLocation || {},
            pricing: quote.pricingBreakdown || { totalAmount },
            totalAmount,
            bookingStatus: 'CONFIRMED',
            paymentStatus: 'PAYMENT_VERIFIED',
            executionStatus: 'SERVICE_SCHEDULED',
            settlementStatus: 'NOT_ELIGIBLE',
            customerName: 'Customer',
            vendorName: 'Vendor',
            category: quote.category || 'Service',
            paymentSummary: {
              advancePercentage,
              advanceAmount,
              paidAmount: advanceAmount,
              balanceAmount: Math.max(0, totalAmount - advanceAmount),
            },
          },
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.warn('[quoteStateMachine] CoreBooking upsert notice:', err.message);
    }

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
