import { OutboxEvent } from '../../admin/models/OutboxEvent.js';
import { recordBusinessAudit } from '../../admin/utils/audit.js';
import { dispatchEvent } from './dispatcher.service.js';
import { incrementMetric, observeMetric } from '../../metrics.js';

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

  const results = [];

  for (let i = 0; i < batchSize; i += 1) {
    const event = await OutboxEvent.findOneAndUpdate(
      query,
      {
        $set: {
          status: 'PROCESSING',
          processingStartedAt: new Date(),
        },
      },
      { sort: { createdAt: 1 }, new: true }
    );
    if (!event) break;

    const startTs = Date.now();

    try {
      const handlerResult = await dispatchEvent(event);
      const durationMs = Date.now() - startTs;
      event.status = 'COMPLETED';
      event.processedAt = new Date();
      event.lastError = null;

      event.history.push({
        attempt: event.attempts + 1,
        timestamp: new Date(),
        status: 'COMPLETED',
        durationMs,
      });

      await event.save();
      incrementMetric('starvnt_outbox_events_total', { eventType: event.eventType, status: 'COMPLETED' });
      observeMetric('starvnt_outbox_event_duration_ms', { eventType: event.eventType }, durationMs);
      results.push({ id: event._id, success: true, result: handlerResult });
    } catch (err) {
      const durationMs = Date.now() - startTs;
      event.attempts += 1;
      event.lastError = err.message;

      event.history.push({
        attempt: event.attempts,
        timestamp: new Date(),
        status: 'FAILED',
        error: err.message,
        durationMs,
      });

      if (event.attempts >= event.maxAttempts) {
        event.status = 'DEAD_LETTER';
        await recordBusinessAudit({
          actorType: 'SYSTEM',
          action: 'OUTBOX_DEAD_LETTER',
          resourceType: 'OutboxEvent',
          resourceId: String(event._id),
          referenceId: event.idempotencyKey,
          fromState: { status: 'PROCESSING', attempts: event.attempts - 1 },
          toState: { status: 'DEAD_LETTER', attempts: event.attempts, lastError: err.message },
          why: `Outbox handler failed ${event.attempts} times: ${err.message}`,
          source: 'AUTOMATION_WORKER',
          authority: 'CORE_AUTOMATION',
          idempotencyKey: `outbox_dead_letter_${event._id}_${event.attempts}`,
        });
      } else {
        // Exponential backoff: 2^attempt * 500ms
        const backoffMs = Math.pow(2, event.attempts) * 500;
        event.nextRunAt = new Date(Date.now() + backoffMs);
        event.status = 'PENDING';
      }

      await event.save();
      incrementMetric('starvnt_outbox_events_total', { eventType: event.eventType, status: event.status });
      observeMetric('starvnt_outbox_event_duration_ms', { eventType: event.eventType }, durationMs);
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
