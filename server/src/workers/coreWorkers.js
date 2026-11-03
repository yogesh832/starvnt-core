import { runReminderBatch, runEventDeadlineBatch } from '../notifications/reminders.worker.js';
import { runDiscoveryNotificationBatch } from '../experience/discoveryNotifications.worker.js';
import { reconcileBookingBatch } from '../customer/services/bookingTruth.service.js';
import { expireExternalHolds } from '../external/services/commitments.service.js';
import { config } from '../config.js';
import { OutboxEvent } from '../admin/models/OutboxEvent.js';
import { processOutboxBatch } from '../automation/services/outbox.service.js';
import { expireStaleReservations } from '../customer/repositories/commerce.repo.js';
import { expireStaleOpportunities } from '../external/services/opportunitySla.service.js';
import { incrementMetric } from '../metrics.js';
import { configureWorker, markWorkerError, markWorkerStarted, markWorkerSuccess } from './workerHealth.js';
import { startPushWorker } from '../notifications/push.worker.js';

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
  let discoveryBusy = false;
  const discovery = async () => { if (discoveryBusy) return; discoveryBusy = true; try { await runDiscoveryNotificationBatch(); } catch (err) { console.warn('[discovery-notifications]', err.message); } finally { discoveryBusy = false; } };
  setInterval(discovery, 300000).unref();
  let foundationBusy = false;
  const foundation = async () => {
    if (foundationBusy) return;
    foundationBusy = true;
    markWorkerStarted('booking-reconciliation');
    try {
      const results = await reconcileBookingBatch();
      await expireExternalHolds();
      if (results.some(r => !r.ok)) throw new Error('Booking reconciliation has pending failures');
      markWorkerSuccess('booking-reconciliation', 0);
    } catch (err) { markWorkerError('booking-reconciliation', err, 0); }
    finally { foundationBusy = false; }
  };
  configureWorker('booking-reconciliation', { enabled: true });
  setInterval(foundation, 30000).unref();
  setTimeout(foundation, 5000).unref();
  startPushWorker();
  let reminderBusy = false;
  let lastDeadlineRun = 0;
  const reminders = async () => {
    if (reminderBusy) return;
    reminderBusy = true;
    const started = Date.now();
    markWorkerStarted('event-reminders');
    try {
      await runReminderBatch();
      if (Date.now() - lastDeadlineRun > 300000) { await runEventDeadlineBatch(); lastDeadlineRun = Date.now(); }
      markWorkerSuccess('event-reminders', Date.now() - started);
    } catch (err) { markWorkerError('event-reminders', err, Date.now() - started); console.warn('[reminders]', err.message); } finally { reminderBusy = false; }
  };
  configureWorker('event-reminders', { enabled: config.eventRemindersEnabled });
  if (config.eventRemindersEnabled) {
    setInterval(reminders, 30000).unref();
    setTimeout(reminders, 4000).unref();
  }
  configureWorker('outbox', { enabled: config.outboxWorkerEnabled });
  configureWorker('reservation-expiry', { enabled: config.reservationExpiryWorkerEnabled });

  if (config.outboxWorkerEnabled) {
    const outboxInterval = Math.max(5000, config.outboxWorkerIntervalMs);
    const runOutbox = async () => {
      const startedAt = Date.now();
      markWorkerStarted('outbox');
      try {
        await releaseStaleOutboxLocks();
        await processOutboxBatch({ batchSize: 10 });
        markWorkerSuccess('outbox', Date.now() - startedAt);
      } catch (err) {
        markWorkerError('outbox', err, Date.now() - startedAt);
        console.warn('[worker:outbox]', err.message);
      }
    };
    setInterval(runOutbox, outboxInterval).unref();
    setTimeout(runOutbox, 2500).unref();
  }

  if (config.reservationExpiryWorkerEnabled) {
    const expiryInterval = Math.max(15000, config.reservationExpiryIntervalMs);
    const runReservationExpiry = async () => {
      const startedAt = Date.now();
      markWorkerStarted('reservation-expiry');
      try {
        const result = await expireStaleReservations({});
        if (result.modifiedCount) {
          incrementMetric('starvnt_reservations_expired_total', {}, result.modifiedCount);
        }
        await expireStaleOpportunities();
        markWorkerSuccess('reservation-expiry', Date.now() - startedAt);
      } catch (err) {
        markWorkerError('reservation-expiry', err, Date.now() - startedAt);
        console.warn('[worker:reservation-expiry]', err.message);
      }
    };
    setInterval(runReservationExpiry, expiryInterval).unref();
    setTimeout(runReservationExpiry, 5000).unref();
  }
}
