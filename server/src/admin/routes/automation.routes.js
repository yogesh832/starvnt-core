import { Router } from 'express';
import { requireAdminAuth, requirePermission } from '../middleware/requireAdminAuth.js';
import { OutboxEvent } from '../models/OutboxEvent.js';
import { processOutboxBatch } from '../../automation/services/outbox.service.js';

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
    const [pending, processing, completed, deadLetter] = await Promise.all([
      OutboxEvent.countDocuments({ status: 'PENDING' }),
      OutboxEvent.countDocuments({ status: 'PROCESSING' }),
      OutboxEvent.countDocuments({ status: 'COMPLETED' }),
      OutboxEvent.countDocuments({ status: 'DEAD_LETTER' }),
    ]);

    res.json({
      ok: true,
      stats: {
        pending,
        processing,
        completed,
        deadLetter,
        total: pending + processing + completed + deadLetter,
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
