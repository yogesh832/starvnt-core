import { Router } from 'express';
import { NotificationPreference, CustomerReminder } from './preferences.models.js';
import { DEFAULT_NOTIFICATION_POLICY, validateNotificationPolicy } from './policy.js';
import { CustomerEvent } from '../customer/models/index.js';

export function notificationPreferencesRoutes(surface) {
  const router = Router();
  const owner = req => `${surface}:${surface === 'VENDOR' ? req.vendorId : req.externalUser._id}`;
  router.get('/notification-preferences', async (req, res, next) => {
    try { const row = await NotificationPreference.findById(owner(req)).lean(); const { history, ...policy } = row || DEFAULT_NOTIFICATION_POLICY; res.json({ ok: true, policy }); } catch (err) { next(err); }
  });
  router.put('/notification-preferences', async (req, res) => {
    try {
      const policy = validateNotificationPolicy(req.body || {});
      await NotificationPreference.findOneAndUpdate({ _id: owner(req) }, { $set: policy, $push: { history: { at: new Date(), actor: String(req.externalUser._id), policy } } }, { upsert: true, runValidators: true });
      res.json({ ok: true, policy });
    } catch (err) { res.status(400).json({ error: 'INVALID_NOTIFICATION_POLICY', message: err.message }); }
  });
  if (surface === 'CUSTOMER') {
    router.get('/reminders', async (req, res, next) => {
      try { res.json({ reminders: await CustomerReminder.find({ customer: req.externalUser._id, status: { $in: ['PENDING', 'PROCESSING'] } }).sort({ dueAt: 1 }).limit(100).lean() }); } catch (err) { next(err); }
    });
    router.post('/reminders', async (req, res, next) => {
      try {
        const { eventId, title, dueAt, idempotencyKey } = req.body || {};
        const at = new Date(dueAt);
        if (!title?.trim() || title.length > 140 || !idempotencyKey || String(idempotencyKey).length > 160 || !Number.isFinite(at.getTime()) || at <= new Date()) return res.status(400).json({ error: 'INVALID_REMINDER' });
        if (!await CustomerEvent.exists({ _id: eventId, customer: req.externalUser._id })) return res.status(404).json({ error: 'EVENT_NOT_FOUND' });
        const filter = { customer: req.externalUser._id, idempotencyKey };
        const reminder = await CustomerReminder.findOneAndUpdate(filter, { $setOnInsert: { ...filter, event: eventId, title: title.trim(), dueAt: at } }, { upsert: true, new: true });
        if (String(reminder.event) !== String(eventId) || reminder.title !== title.trim() || reminder.dueAt.getTime() !== at.getTime()) return res.status(409).json({ error: 'IDEMPOTENCY_CONFLICT' });
        res.status(201).json({ ok: true, reminder });
      } catch (err) { next(err); }
    });
    router.delete('/reminders/:id', async (req, res, next) => {
      try { const row = await CustomerReminder.findOne({ _id: req.params.id, customer: req.externalUser._id }); if (!row) return res.status(404).json({ error: 'REMINDER_NOT_FOUND' }); if (row.status === 'CANCELLED') return res.json({ ok: true }); const cancelled = await CustomerReminder.findOneAndUpdate({ _id: row._id, status: 'PENDING' }, { $set: { status: 'CANCELLED' } }); if (!cancelled) return res.status(409).json({ error: 'REMINDER_ALREADY_DELIVERING', message: 'This reminder is already being delivered or has been delivered.' }); res.json({ ok: true }); } catch (err) { next(err); }
    });
  }
  return router;
}
