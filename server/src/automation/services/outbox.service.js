import { OutboxEvent } from '../../admin/models/OutboxEvent.js';
import { dispatchEvent } from './dispatcher.service.js';

/**
 * Publishes an event to the Central Automation Outbox (Spec §12).
 * Idempotent: If an event with the given idempotencyKey already exists, returns it.
 */
export async function publishOutboxEvent({
  eventType,
  aggregateType,
  aggregateId,
  payload = {},
  idempotencyKey,
  maxAttempts = 5,
}) {
  if (!eventType || !aggregateType || !aggregateId || !idempotencyKey) {
    throw new Error('MISSING_OUTBOX_EVENT_PARAMETERS');
  }

  // Idempotency check: Return existing event if already published
  const existing = await OutboxEvent.findOne({ idempotencyKey });
  if (existing) {
    return { created: false, event: existing };
  }

  const event = await OutboxEvent.create({
    eventType,
    aggregateType,
    aggregateId,
    payload,
    idempotencyKey,
    maxAttempts,
    status: 'PENDING',
    nextRunAt: new Date(),
  });

  return { created: true, event };
}

/**
 * Worker cycle: Processes pending outbox events with exponential backoff and idempotency.
 * Spec §12, §17.
 */
export async function processOutboxBatch({ batchSize = 10, immediate = false } = {}) {
  const query = {
    status: 'PENDING',
  };

  if (!immediate) {
    query.nextRunAt = { $lte: new Date() };
  }

  const pendingEvents = await OutboxEvent.find(query)
    .sort({ createdAt: 1 })
    .limit(batchSize);

  const results = [];

  for (const event of pendingEvents) {
    // Atomic lock: Transition to PROCESSING
    event.status = 'PROCESSING';
    await event.save();

    const startTs = Date.now();
    let outcomeStatus = 'COMPLETED';
    let outcomeError = null;

    try {
      const handlerResult = await dispatchEvent(event);
      event.status = 'COMPLETED';
      event.processedAt = new Date();
      event.lastError = null;

      event.history.push({
        attempt: event.attempts + 1,
        timestamp: new Date(),
        status: 'COMPLETED',
        durationMs: Date.now() - startTs,
      });

      await event.save();
      results.push({ id: event._id, success: true, result: handlerResult });
    } catch (err) {
      outcomeStatus = 'FAILED';
      outcomeError = err.message;
      event.attempts += 1;
      event.lastError = err.message;

      event.history.push({
        attempt: event.attempts,
        timestamp: new Date(),
        status: 'FAILED',
        error: err.message,
        durationMs: Date.now() - startTs,
      });

      if (event.attempts >= event.maxAttempts) {
        event.status = 'DEAD_LETTER';
      } else {
        // Exponential backoff: 2^attempt * 500ms
        const backoffMs = Math.pow(2, event.attempts) * 500;
        event.nextRunAt = new Date(Date.now() + backoffMs);
        event.status = 'PENDING';
      }

      await event.save();
      results.push({ id: event._id, success: false, error: err.message });
    }
  }

  return {
    totalProcessed: results.length,
    successes: results.filter((r) => r.success).length,
    failures: results.filter((r) => !r.success).length,
    results,
  };
}
