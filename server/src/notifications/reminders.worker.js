import crypto from 'node:crypto';
import { CustomerReminder } from './preferences.models.js';
import { CustomerEvent, EventRequirement, Reservation } from '../customer/models/index.js';
import { notifyCustomer } from './notification.service.js';
export async function runReminderBatch(now = new Date()) {
  let processed = 0;
  for (let i = 0; i < 100; i++) {
    const lease = crypto.randomUUID();
    const row = await CustomerReminder.findOneAndUpdate({ dueAt: { $lte: now }, $or: [{ status: 'PENDING', retryAt: { $lte: now } }, { status: 'PROCESSING', lockedUntil: { $lte: now } }] }, { $set: { status: 'PROCESSING', lease, lockedUntil: new Date(now.getTime() + 60000) }, $inc: { attempts: 1 } }, { new: true }).lean();
    if (!row) break;
    const filter = { _id: row._id, lease, status: 'PROCESSING' };
    try {
      const event = await CustomerEvent.findOne({ _id: row.event, customer: row.customer, status: { $nin: ['cancelled', 'completed'] } }).lean();
      if (!event) { await CustomerReminder.updateOne(filter, { $set: { status: 'CANCELLED', lockedUntil: null } }); continue; }
      const result = await notifyCustomer({ customerId: row.customer, eventId: row.event, type: 'reminder', title: row.title, body: `Your requested reminder for ${event.title || 'your event'}.`, actionUrl: `/customer/events/${row.event}`, idempotencyKey: `reminder:${row._id}` });
      await CustomerReminder.updateOne(filter, { $set: { status: result.skipped ? 'SUPPRESSED' : 'DELIVERED', lockedUntil: null, lastError: '' } });
      processed++;
    } catch (err) {
      await CustomerReminder.updateOne(filter, { $set: { status: 'PENDING', lockedUntil: null, retryAt: new Date(now.getTime() + Math.min(300000, 15000 * 2 ** Math.min(row.attempts, 5))), lastError: String(err.message).slice(0, 300) } });
    }
  }
  return { processed };
}

export async function runEventDeadlineBatch(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  for (const days of [7, 1]) {
    const date = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    const events = await CustomerEvent.find({ eventDate: date, status: { $in: ['planning', 'booked'] } }).lean();
    for (const event of events) {
      const pending = await EventRequirement.countDocuments({ event: event._id, $or: [{ status: 'pending' }, { source: 'aura_inferred' }] });
      if (!pending) continue;
      await notifyCustomer({ customerId: event.customer, eventId: event._id, type: 'deadline', title: 'Review your remaining event decisions', body: `${event.title || 'Your event'} is in ${days} day${days === 1 ? '' : 's'}. ${pending} requirement${pending === 1 ? '' : 's'} still need your decision.`, actionUrl: `/customer/events/${event._id}/requirements`, idempotencyKey: `event-deadline:${event._id}:${date}:${days}` });
    }
  }
  const holds = await Reservation.find({ status: 'pending_payment', expiresAt: { $gt: now, $lte: new Date(now.getTime() + 2 * 3600000) } }).lean();
  for (const hold of holds) await notifyCustomer({ customerId: hold.customer, eventId: hold.event, type: 'deadline', title: 'Your reservation hold expires soon', body: `The hold for ${hold.packageName} expires at ${hold.expiresAt.toISOString()}. Review it if you want to continue.`, actionUrl: `/customer/events/${hold.event}/bookings`, idempotencyKey: `hold-deadline:${hold._id}:${hold.expiresAt.toISOString()}` });
}
