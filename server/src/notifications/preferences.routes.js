import { Router } from 'express';
import { NotificationPreference } from './preferences.models.js';
import { DEFAULT_NOTIFICATION_POLICY, validateNotificationPolicy } from './policy.js';
import { asyncHandler as h } from '../customer/utils/http.js';
import { createReminder, listReminders, cancelReminder } from './reminders.service.js';

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
    router.get('/reminders', h(async (req, res) => res.json(await listReminders(req.externalUser._id, req.query))));
    router.post('/reminders', h(async (req, res) => res.status(201).json(await createReminder(req.externalUser._id, req.body))));
    router.delete('/reminders/:id', h(async (req, res) => res.json(await cancelReminder(req.externalUser._id, req.params.id))));
  }
  return router;
}
