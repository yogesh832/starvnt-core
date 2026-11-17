import mongoose from 'mongoose';
import { CustomerReminder } from './preferences.models.js';
import { CustomerEvent } from '../customer/models/index.js';
import { badRequest, conflict, HttpError } from '../customer/utils/http.js';

const STATUSES = ['PENDING', 'PROCESSING', 'DELIVERED', 'CANCELLED', 'SUPPRESSED'];
const keyFor = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
const invalid = () => badRequest('INVALID_REMINDER', 'Supply an event, a reminder title, an exact date/time and a request key.');
const missingEvent = () => new HttpError(404, 'EVENT_NOT_FOUND', 'Event not found');
const missingReminder = () => new HttpError(404, 'REMINDER_NOT_FOUND', 'Reminder not found');
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) throw invalid();
  const [year, month, day] = value.slice(0, 10).split('-').map(Number), calendar = new Date(Date.UTC(year, month - 1, day));
  const at = new Date(value);
  if (!Number.isFinite(at.getTime()) || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) throw invalid();
  return at;
}
function dto(row) {
  return { _id: String(row._id), event: String(row.event), title: row.title, dueAt: row.dueAt, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt };
}
function sameRequest(row, eventId, title, at) { return String(row.event) === eventId && row.title === title && row.dueAt.getTime() === at.getTime(); }
export async function createReminder(customerId, body, { now = new Date() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['eventId', 'title', 'dueAt', 'idempotencyKey'].includes(key))) throw invalid();
  const { eventId: requestedEvent, idempotencyKey } = body;
  if (typeof requestedEvent !== 'string' || !mongoose.isValidObjectId(requestedEvent) || typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 140 || !keyFor(idempotencyKey)) throw invalid();
  const eventId = new mongoose.Types.ObjectId(requestedEvent).toHexString();
  const title = body.title.trim(), at = instant(body.dueAt), filter = { customer: customerId, idempotencyKey };
  // Resolve a saved command before future-time eligibility: a lost acknowledgement
  // can be replayed even after the reminder's due time or status has changed.
  const prior = await CustomerReminder.findOne(filter).lean();
  if (prior) {
    if (!sameRequest(prior, eventId, title, at)) throw conflict('IDEMPOTENCY_CONFLICT', 'This request key was used for a different reminder.');
    return { ok: true, reminder: dto(prior) };
  }
  if (at <= now) throw badRequest('REMINDER_IN_PAST', 'Choose a future time for a new reminder.');
  const event = await CustomerEvent.findOne({ _id: eventId, customer: customerId }).select('status').lean();
  if (!event) throw missingEvent();
  if (['completed', 'cancelled'].includes(event.status)) throw conflict('EVENT_NOT_ACTIVE', 'Event reminders stop when an event is completed or cancelled. Choose an active event.');
  let row;
  try { row = await CustomerReminder.findOneAndUpdate(filter, { $setOnInsert: { ...filter, event: eventId, title, dueAt: at } }, { upsert: true, new: true, runValidators: true }).lean(); }
  catch (error) { if (error.code !== 11000) throw error; row = await CustomerReminder.findOne(filter).lean(); if (!row) throw error; }
  if (!sameRequest(row, eventId, title, at)) throw conflict('IDEMPOTENCY_CONFLICT', 'This request key was used for a different reminder.');
  return { ok: true, reminder: dto(row) };
}
export async function cancelReminder(customerId, reminderId) {
  if (!mongoose.isValidObjectId(reminderId)) throw missingReminder();
  const filter = { _id: reminderId, customer: customerId };
  const row = await CustomerReminder.findOneAndUpdate({ ...filter, status: 'PENDING' }, { $set: { status: 'CANCELLED' } }, { new: true }).lean();
  if (row) return { ok: true, reminder: dto(row) };
  const prior = await CustomerReminder.findOne(filter).lean();
  if (!prior) throw missingReminder();
  if (prior.status === 'CANCELLED') return { ok: true, reminder: dto(prior) };
  throw conflict('REMINDER_ALREADY_DELIVERING', 'This reminder is already processing or has finished. Cancellation was not recorded.');
}
export async function listReminders(customerId, query = {}) {
  const requestedEvent = query.eventId || '', status = query.status || 'active';
  if (typeof requestedEvent !== 'string' || typeof status !== 'string' || !['active', 'all', ...STATUSES].includes(status)) throw badRequest('INVALID_REMINDER_FILTER', 'Choose a supported reminder filter.');
  const eventId = mongoose.isValidObjectId(requestedEvent) ? new mongoose.Types.ObjectId(requestedEvent).toHexString() : requestedEvent;
  if (eventId && (!mongoose.isValidObjectId(eventId) || !await CustomerEvent.exists({ _id: eventId, customer: customerId }))) throw missingEvent();
  const limit = query.limit === undefined ? 100 : /^\d{1,3}$/.test(String(query.limit)) ? Number(query.limit) : 0;
  if (limit < 1 || limit > 100) throw badRequest('INVALID_PAGE_SIZE', 'Choose a page size from 1 to 100.');
  const filter = { customer: customerId, ...(eventId ? { event: eventId } : {}), ...(status === 'all' ? {} : { status: status === 'active' ? { $in: ['PENDING', 'PROCESSING'] } : status }) };
  if (query.cursor) {
    let cursor;
    try { if (typeof query.cursor !== 'string' || query.cursor.length > 1200) throw new Error(); cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString()); } catch { throw badRequest('INVALID_CURSOR', 'Refresh reminders before loading more.'); }
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor) || cursor.v !== 1 || cursor.customer !== String(customerId) || cursor.event !== eventId || cursor.status !== status || typeof cursor.id !== 'string' || !mongoose.isValidObjectId(cursor.id) || typeof cursor.at !== 'string' || !Number.isFinite(new Date(cursor.at).getTime())) throw badRequest('INVALID_CURSOR', 'This reminder cursor belongs to another view. Refresh reminders.');
    const at = new Date(cursor.at);
    filter.$or = [{ dueAt: { $gt: at } }, { dueAt: at, _id: { $gt: new mongoose.Types.ObjectId(cursor.id) } }];
  }
  const rows = await CustomerReminder.find(filter).sort({ dueAt: 1, _id: 1 }).limit(limit + 1).lean(), page = rows.slice(0, limit);
  const events = await CustomerEvent.find({ _id: { $in: page.map(row => row.event) }, customer: customerId }).select('title status').lean(), titles = new Map(events.map(event => [String(event._id), event]));
  const last = page.at(-1), nextCursor = rows.length > limit ? Buffer.from(JSON.stringify({ v: 1, customer: String(customerId), event: eventId, status, at: last.dueAt.toISOString(), id: String(last._id) })).toString('base64url') : null;
  return { reminders: page.map(row => ({ ...dto(row), eventTitle: titles.get(String(row.event))?.title || null, eventStatus: titles.get(String(row.event))?.status || null })), nextCursor };
}
