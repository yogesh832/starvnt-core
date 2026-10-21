import { Router } from 'express';
import { requireAdminAuth, requirePermission } from '../middleware/requireAdminAuth.js';
import { OutboxEvent } from '../models/OutboxEvent.js';
import { processOutboxBatch } from '../../automation/services/outbox.service.js';
import { config } from '../../config.js';
import { workerHealthSnapshot } from '../../workers/workerHealth.js';
import { PushJob } from '../../notifications/push.models.js';

const router = Router();

router.use(requireAdminAuth, requirePermission('automation.read'));

// ── List Outbox Events ─────────────────────────────────────────────────────
router.get('/outbox', async (req, res, next) => {
  try {
    const { status, eventType, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (eventType) query.eventType = eventType;

    const events = await OutboxEvent.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json({ ok: true, events });
  } catch (err) {
    next(err);
  }
});

// ── Outbox Metrics & Queue Health ──────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const [pending, processing, completed, failed, deadLetter, oldestPending, nextRetry] = await Promise.all([
      OutboxEvent.countDocuments({ status: 'PENDING' }),
      OutboxEvent.countDocuments({ status: 'PROCESSING' }),
      OutboxEvent.countDocuments({ status: 'COMPLETED' }),
      OutboxEvent.countDocuments({ status: 'FAILED' }),
      OutboxEvent.countDocuments({ status: 'DEAD_LETTER' }),
      OutboxEvent.findOne({ status: 'PENDING' }).sort({ nextRunAt: 1, createdAt: 1 }).select('createdAt nextRunAt eventType aggregateType aggregateId').lean(),
      OutboxEvent.findOne({ status: 'FAILED' }).sort({ nextRunAt: 1, updatedAt: 1 }).select('updatedAt nextRunAt attempts maxAttempts lastError').lean(),
    ]);

    const pushCounts = config.pushEnabled ? await PushJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]) : [];
    res.json({
      ok: true,
      stats: {
        pending,
        processing,
        completed,
        failed,
        deadLetter,
        total: pending + processing + completed + failed + deadLetter,
        oldestPending,
        nextRetry,
        workers: workerHealthSnapshot(),
        mobilePush: { enabled: config.pushEnabled && !!config.pushProjectId, counts: Object.fromEntries(pushCounts.map(row => [row._id, row.count])) },
        config: {
          outboxWorkerEnabled: config.outboxWorkerEnabled,
          outboxWorkerIntervalMs: config.outboxWorkerIntervalMs,
          reservationExpiryWorkerEnabled: config.reservationExpiryWorkerEnabled,
          reservationExpiryIntervalMs: config.reservationExpiryIntervalMs,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Trigger Outbox Worker Batch Execution ──────────────────────────────────
router.post('/process', requirePermission('automation.manage'), async (req, res, next) => {
  try {
    const batchSize = Number(req.body?.batchSize) || 20;
    const immediate = Boolean(req.body?.immediate);
    const result = await processOutboxBatch({ batchSize, immediate });

    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

// ── Force Retry a Failed / Dead-Letter Event ───────────────────────────────
router.post('/outbox/:id/retry', requirePermission('automation.manage'), async (req, res, next) => {
  try {
    const event = await OutboxEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'OUTBOX_EVENT_NOT_FOUND' });
    }

    event.status = 'PENDING';
    event.nextRunAt = new Date();
    event.attempts = 0; // reset attempt counter for manual admin retry
    await event.save();

    res.json({ ok: true, event });
  } catch (err) {
    next(err);
  }
});

export default router;
