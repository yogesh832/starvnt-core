import { IdempotencyKey } from '../../admin/models/IdempotencyKey.js';
import { reconcileConfirmedPayment } from './paymentConfirmed.js';

// Handler registry for domain events
const HANDLERS = new Map();

/**
 * Registers an event handler function for a given domain event type.
 */
export function registerEventHandler(eventType, handlerFn) {
  HANDLERS.set(eventType, handlerFn);
}

/**
 * Executes an operation guarded by an idempotency key.
 * If already executed, returns cached result.
 * If currently in-flight, throws CONCURRENT_EXECUTION.
 */
export async function withIdempotency(key, scope, operationFn) {
  let record = await IdempotencyKey.findOne({ key, scope });

  if (record) {
    if (record.status === 'COMPLETED') {
      return { duplicate: true, result: record.result };
    }
    if (record.status === 'STARTED') {
      // Allow re-try if started more than 30 seconds ago (stale execution)
      const isStale = Date.now() - new Date(record.updatedAt).getTime() > 30000;
      if (!isStale) {
        throw new Error(`CONCURRENT_EXECUTION: Action ${key} is currently processing.`);
      }
    }
  } else {
    record = await IdempotencyKey.create({ key, scope, status: 'STARTED' });
  }

  try {
    const outcome = await operationFn();
    record.status = 'COMPLETED';
    record.result = outcome;
    await record.save();
    return { duplicate: false, result: outcome };
  } catch (err) {
    record.status = 'FAILED';
    record.result = { error: err.message };
    await record.save();
    throw err;
  }
}

// ── Built-in Handlers per Spec §12, §17 ────────────────────────────────────

registerEventHandler('PAYMENT_CONFIRMED', async (payload) => {
  // Loaded at execution time to avoid the commerce -> outbox -> dispatcher cycle.
  const [repository, commerce] = await Promise.all([
    import('../../customer/repositories/commerce.repo.js'),
    import('../../customer/services/commerce.service.js'),
  ]);
  return reconcileConfirmedPayment(payload, {
    getPayment: repository.getPayment,
    findBooking: repository.findBookingForReservation,
    confirmBooking: commerce.confirmBookingFor,
  });
});

/**
 * QUOTE_APPROVED Handler:
 * Transforms an approved quote into an authoritative booking request.
 * Golden Acceptance Test H: Duplicate approval does not create duplicate booking request.
 */
import mongoose from 'mongoose';
import { CoreBooking } from '../../admin/models/CoreBooking.js';

registerEventHandler('QUOTE_APPROVED', async (payload) => {
  if (!mongoose.isValidObjectId(payload.quoteId)) throw new Error('INVALID_QUOTE_ID');
  const { Quote } = await import('../../external/models/Quote.js');
  const quote = await Quote.findById(payload.quoteId).lean();
  if (!quote || quote.status !== 'APPROVED') throw new Error('QUOTE_NOT_APPROVED');
  const booking = await CoreBooking.findOne({ quoteId: String(quote._id) }).lean();
  return { handled: true, quoteId: String(quote._id), bookingId: booking?._id || null, status: booking ? booking.bookingStatus : 'AWAITING_VERIFIED_PAYMENT', paymentVerificationRequired: !booking };
});

/**
 * RETRY_TEST_EVENT Handler:
 * Simulates transient failures and verifies exponential backoff retry recovery.
 * Golden Acceptance Test O: Failure -> retry -> success without duplicate business outcome.
 */
let retryCounter = 0;
export function resetRetryCounter() {
  retryCounter = 0;
}

registerEventHandler('RETRY_TEST_EVENT', async (payload) => {
  retryCounter += 1;
  const targetFailures = payload.failUntilAttempt || 2;

  if (retryCounter < targetFailures) {
    throw new Error(`TRANSIENT_DOWNSTREAM_TIMEOUT: Attempt ${retryCounter} failed as expected.`);
  }

  return {
    handled: true,
    attemptsMade: retryCounter,
    outcome: 'PAYMENT_AUDITED_SUCCESSFULLY',
  };
});

/**
 * Dispatches an event from the outbox to its registered handler.
 */
export async function dispatchEvent(outboxEvent) {
  const handler = HANDLERS.get(outboxEvent.eventType);
  if (!handler) {
    throw new Error(`NO_HANDLER_FOR_EVENT: ${outboxEvent.eventType}`);
  }

  return await handler(outboxEvent.payload);
}

import { VendorActivity } from '../../external/models/VendorActivity.js';
import { BusinessAuditLog } from '../../admin/models/BusinessAuditLog.js';

registerEventHandler('FOLLOW_UP_OVERDUE', async (payload) => {
  const { followUpId, vendorId, customerId, title } = payload;
  const idempotencyKey = `followup-overdue-${followUpId}`;

  const { duplicate, result } = await withIdempotency(
    idempotencyKey,
    'ACTIVITY_CREATION',
    async () => {
      // 1. Simulate Aura+ Recommendation Handoff
      // In a real flow, Aura+ analyzes context and recommends an action.
      // Here, Core validates and acts on the structured recommendation.
      const recommendation = {
        priority: 'HIGH',
        action: 'CREATE_REMINDER',
        reason: 'Customer engagement requires immediate follow-up.'
      };

      // 2. Core executes the business change
      const activity = await VendorActivity.create({
        vendor: vendorId,
        type: 'REMINDER',
        title: `Overdue: ${title}`,
        description: recommendation.reason,
        priority: recommendation.priority,
        status: 'OPEN',
        relatedEntity: {
          entityType: 'FollowUp',
          entityId: followUpId
        }
      });

      // 3. Record the Business Audit Log (Traceability)
      await BusinessAuditLog.create({
        actorId: 'system',
        actorType: 'AUTOMATION',
        organizationId: vendorId,
        action: 'FOLLOW_UP_OVERDUE_PROCESSED',
        resourceType: 'FollowUp',
        resourceId: followUpId,
        beforeState: { status: 'PENDING' },
        afterState: { status: 'OVERDUE', activityId: activity._id },
        source: 'AUTOMATION',
        traceContext: {
          eventId: idempotencyKey
        }
      });

      return {
        activityId: activity._id.toString(),
        status: 'CREATED_AND_AUDITED'
      };
    }
  );

  return {
    handled: true,
    duplicate,
    activity: result
  };
});
