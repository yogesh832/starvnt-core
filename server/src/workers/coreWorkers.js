import { config } from '../config.js';
import { OutboxEvent } from '../admin/models/OutboxEvent.js';
import { processOutboxBatch } from '../automation/services/outbox.service.js';
import { expireStaleReservations } from '../customer/repositories/commerce.repo.js';
import { expireStaleOpportunities } from '../external/services/opportunitySla.service.js';
import { incrementMetric } from '../metrics.js';

async function releaseStaleOutboxLocks() {
  const staleBefore = new Date(Date.now() - Math.max(60000, config.outboxWorkerIntervalMs * 4));
  const result = await OutboxEvent.updateMany(
    { status: 'PROCESSING', processingStartedAt: { $lt: staleBefore } },
    {
      $set: {
        status: 'PENDING',
        nextRunAt: new Date(),
        lastError: 'Worker lock expired before completion',
      },
    }
  );
  if (result.modifiedCount) {
    incrementMetric('starvnt_outbox_stale_locks_released_total', {}, result.modifiedCount);
  }
}

export function startCoreWorkers() {
  if (config.outboxWorkerEnabled) {
    const outboxInterval = Math.max(5000, config.outboxWorkerIntervalMs);
    const runOutbox = async () => {
      try {
        await releaseStaleOutboxLocks();
        await processOutboxBatch({ batchSize: 10 });
      } catch (err) {
        console.warn('[worker:outbox]', err.message);
      }
    };
    setInterval(runOutbox, outboxInterval).unref();
    setTimeout(runOutbox, 2500).unref();
  }

  if (config.reservationExpiryWorkerEnabled) {
    const expiryInterval = Math.max(15000, config.reservationExpiryIntervalMs);
    const runReservationExpiry = async () => {
      try {
        const result = await expireStaleReservations({});
        if (result.modifiedCount) {
          incrementMetric('starvnt_reservations_expired_total', {}, result.modifiedCount);
        }
        await expireStaleOpportunities();
      } catch (err) {
        console.warn('[worker:reservation-expiry]', err.message);
      }
    };
    setInterval(runReservationExpiry, expiryInterval).unref();
    setTimeout(runReservationExpiry, 5000).unref();
  }
}
