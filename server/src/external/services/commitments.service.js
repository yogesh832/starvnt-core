import { observeProduct } from '../../common/productObservability.js';
import crypto from 'node:crypto';
import { externalCommercialInput, externalReservesCapacity, externalFinancials, externalMoney, EXTERNAL_TRANSITIONS } from '../../common/externalBookingContract.js';
import { prepareExternalOperations, validateExternalFeasibility } from './externalBookingOperations.js';
import mongoose from 'mongoose';
import { VendorBlockout } from '../models/VendorBlockout.js';
import { VendorService } from '../models/VendorService.js';
import { VendorResource } from '../models/VendorResource.js';
import { VendorBookingSlot } from '../models/VendorBookingSlot.js';
import { normaliseCommitment, schedulingError } from '../../common/scheduleRules.js';
import { withVendorSchedule } from './scheduleLock.js';
import { checkTrueAvailability } from './availability.service.js';

export async function saveCommitment(vendorId, input, actor, id = null, options = {}) {
  const data = normaliseCommitment(input);
  const commercial = data.recordType === 'EXTERNAL_COMMITMENT' && !id ? externalCommercialInput(input.externalBooking) : null;
  if (commercial) data.externalBooking = commercial;
  if (data.vendorService && (!mongoose.isValidObjectId(data.vendorService) || !await VendorService.exists({ _id: data.vendorService, vendor: vendorId }))) throw schedulingError('SERVICE_NOT_OWNED', 'The service does not belong to this vendor.', 403);
  if (data.resourceIds.some(id => !mongoose.isValidObjectId(id)) || (data.resourceIds.length && await VendorResource.countDocuments({ _id: { $in: data.resourceIds }, vendor: vendorId, status: { $ne: 'RETIRED' } }) !== data.resourceIds.length)) throw schedulingError('RESOURCE_NOT_OWNED', 'The resource does not belong to this vendor.', 403);
  const key = String(input.idempotencyKey || '').trim().slice(0, 160);
  if (!key) throw schedulingError('IDEMPOTENCY_KEY_REQUIRED', 'A request identifier is required.');
  const hash = crypto.createHash('sha256').update(JSON.stringify({ schedule: data, commercialInput: input.externalBooking || null })).digest('hex');
  let outcome = 'SUCCESS';
  return withVendorSchedule(vendorId, async assertLease => {
    if (!id) {
      const existing = await VendorBlockout.findOne({ vendor: vendorId, idempotencyKey: key });
      if (existing) {
        if (existing.requestHash !== hash) throw schedulingError('IDEMPOTENCY_CONFLICT', 'This request identifier was already used for different data.', 409);
        outcome = 'DUPLICATE';
        return existing;
      }
    }
    const before = id ? await VendorBlockout.findOne({ _id: id, vendor: vendorId }) : null;
    if (id && !before) throw schedulingError('RECORD_NOT_FOUND', 'Record not found.', 404);
    const prior = before?.history?.find(h => h.idempotencyKey === key);
    if (prior) {
      if (prior.requestHash !== hash) throw schedulingError('IDEMPOTENCY_CONFLICT', 'This request identifier was already used for different data.', 409);
      outcome = 'DUPLICATE';
      return before;
    }
    if (before?.status === 'CANCELLED') throw schedulingError('RECORD_CANCELLED', 'A cancelled record cannot be edited.', 409);
    if (before?.externalBooking?.lifecycle === 'COMPLETED') throw schedulingError('RECORD_COMPLETED', 'A completed booking cannot be rescheduled.', 409);
    if (before && before.recordType !== data.recordType) throw schedulingError('SOURCE_IMMUTABLE', 'A record cannot change its business source.', 409);
    if (before && input.externalBooking && !options.commercialEdit) throw schedulingError('USE_LIFECYCLE_ACTION', 'Use the external-booking workspace to change commercial data.');
    if (before && Number(input.revision) !== (before.revision || 0)) throw schedulingError('STALE_REVISION', 'This record changed. Refresh before editing.', 409);
    if (data.recordType === 'EXTERNAL_COMMITMENT') {
      const priorCommercial = before?.externalBooking?.toObject?.() || before?.externalBooking || {};
      const effective = externalCommercialInput(before ? { ...priorCommercial, ...(input.externalBooking || {}) } : input.externalBooking);
      if (before && effective.acquisitionChannel !== (priorCommercial.acquisitionChannel || 'LEGACY_UNKNOWN')) throw schedulingError('SOURCE_IMMUTABLE', 'The original acquisition source cannot be changed.', 409);
      if (before && effective.lifecycle !== (priorCommercial.lifecycle || 'CONFIRMED')) throw schedulingError('USE_LIFECYCLE_ACTION', 'Use a lifecycle action to change booking status.', 409);
      if (before && effective.totalAmount < externalFinancials(before).netReceivedAmount) throw schedulingError('AMOUNT_BELOW_RECEIVED', 'Contract amount cannot be lower than net reported receipts.', 409);
      await prepareExternalOperations(vendorId, effective, data);
      await validateExternalFeasibility(vendorId, data, effective, id);
      data.externalBooking = { ...effective, receipts: priorCommercial.receipts || [], refunds: priorCommercial.refunds || [], attachments: priorCommercial.attachments || [] };
    } else {
      const availability = await checkTrueAvailability({ vendorId, ...data, vendorServiceId: data.vendorService, requestedResources: data.resourceIds, excludeId: id, blockAll: true });
      if (!availability.feasible) throw schedulingError('SCHEDULE_CONFLICT', 'This interval conflicts with the current schedule.', 409, availability.conflicts);
    }
    await assertLease();
    const rescheduled = before && ['date', 'endDate', 'startTime', 'endTime', 'timezone'].some(k => String(before[k] || '') !== String(data[k] || ''));
    const history = { actor: String(actor.id), role: actor.role, action: rescheduled ? 'RESCHEDULED' : before ? 'UPDATED' : 'CREATED', at: new Date(), reason: data.reason, before: before ? snapshot(before) : null, after: snapshot(data), idempotencyKey: key, requestHash: hash };
    if (before) return VendorBlockout.findOneAndUpdate({ _id: id, vendor: vendorId, revision: before.revision || 0 }, { $set: data, $inc: { revision: 1 }, $push: { history } }, { new: true, runValidators: true });
    return VendorBlockout.create({ vendor: vendorId, ...data, idempotencyKey: key, requestHash: hash, history: [history] });
  }).then(async row => { await observeProduct(id ? 'schedule_update' : 'schedule_create', outcome, vendorId); return row; }).catch(async err => { await observeProduct(id ? 'schedule_update' : 'schedule_create', err.code || 'FAILED', vendorId); throw err; });
}
function snapshot(row) {
  return { recordType: row.recordType, status: row.status || 'ACTIVE', date: row.date, endDate: row.endDate, startTime: row.startTime, endTime: row.endTime, scope: row.scope, vendorService: row.vendorService, resourceIds: row.resourceIds, reason: row.reason, externalBooking: row.externalBooking ? { lifecycle: row.externalBooking.lifecycle, acquisitionChannel: row.externalBooking.acquisitionChannel, totalAmount: row.externalBooking.totalAmount, lineItems: row.externalBooking.lineItems, allocations: row.externalBooking.allocations, buffers: row.externalBooking.buffers, nextPaymentDueAt: row.externalBooking.nextPaymentDueAt } : undefined };
}

export async function transitionExternalBooking(vendorId, id, actor, input = {}) {
  return withVendorSchedule(vendorId, async assertLease => {
    const row = await VendorBlockout.findOne({ _id: id, vendor: vendorId, recordType: 'EXTERNAL_COMMITMENT' });
    if (!row) throw schedulingError('RECORD_NOT_FOUND', 'External booking not found.', 404);
    const from = row.externalBooking?.lifecycle || 'CONFIRMED';
    const reason = String(input.reason || '').trim().slice(0, 500);
    const key = String(input.idempotencyKey || '').trim();
    if (!reason || !key || key.length > 160) throw schedulingError('REASON_AND_KEY_REQUIRED', 'A reason and request key are required.');
    const hash = crypto.createHash('sha256').update(JSON.stringify({ lifecycle: input.lifecycle, reason, holdExpiresAt: input.holdExpiresAt || null })).digest('hex');
    const previous = row.history.find(h => h.idempotencyKey === key);
    if (previous) { if (previous.requestHash !== hash) throw schedulingError('IDEMPOTENCY_CONFLICT', 'Request key reused.', 409); return row; }
    if (row.status === 'CANCELLED' || !EXTERNAL_TRANSITIONS[from]?.includes(input.lifecycle)) throw schedulingError('INVALID_TRANSITION', 'This lifecycle transition is not allowed.', 409);
    const commercial = externalCommercialInput({ ...(row.externalBooking?.toObject?.() || {}), lifecycle: input.lifecycle, holdExpiresAt: input.holdExpiresAt });
    if (input.revision !== undefined && Number(input.revision) !== row.revision) throw schedulingError('STALE_REVISION', 'Refresh the external booking before changing its lifecycle.', 409);
    const schedule = row.toObject();
    if (externalReservesCapacity({ recordType: row.recordType, externalBooking: commercial })) {
      await prepareExternalOperations(vendorId, commercial, schedule);
      await validateExternalFeasibility(vendorId, schedule, commercial, row._id);
    }
    await assertLease();
    return VendorBlockout.findOneAndUpdate({ _id: row._id, vendor: vendorId, revision: row.revision }, { $set: { 'externalBooking.lifecycle': input.lifecycle, 'externalBooking.holdExpiresAt': commercial.holdExpiresAt, ...(input.lifecycle === 'CANCELLED' ? { status: 'CANCELLED' } : {}) }, $inc: { revision: 1 }, $push: { history: { actor: String(actor.id), role: actor.role, action: 'LIFECYCLE_CHANGED', at: new Date(), reason, before: { lifecycle: from }, after: { lifecycle: input.lifecycle }, idempotencyKey: key, requestHash: hash } } }, { new: true, runValidators: true });
  });
}

export function recordExternalReceipt(vendorId, id, actor, input = {}) {
  return recordExternalMoney(vendorId, id, actor, input, 'RECEIPT');
}
export function recordExternalRefund(vendorId, id, actor, input = {}) {
  return recordExternalMoney(vendorId, id, actor, input, 'REFUND');
}
async function recordExternalMoney(vendorId, id, actor, input, kind) {
  const amount = externalMoney(input.amount);
  const key = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
  const method = input.method, reference = String(input.reference || '').trim().slice(0, 160), reason = String(input.reason || '').trim().slice(0, 500);
  const attachmentUrl = String(input.attachmentUrl || '');
  const receivedAt = new Date(input.receivedAt);
  if (amount <= 0 || !key || key.length > 160 || !['CASH', 'BANK', 'UPI', 'OTHER'].includes(method) || !Number.isFinite(receivedAt.getTime()) || receivedAt > new Date() || (kind === 'REFUND' && !reason)) throw schedulingError('INVALID_RECEIPT', 'Provide a valid amount, date, method and request key; refunds also need a reason.');
  if (attachmentUrl) { try { if (new URL(attachmentUrl).protocol !== 'https:') throw new Error(); } catch { throw schedulingError('INVALID_ATTACHMENT', 'Receipt links must use HTTPS.'); } }
  const values = { amount, receivedAt, method, reference, reason, attachmentUrl, attachmentId: input.attachmentId || null, kind };
  const hash = crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
  return withVendorSchedule(vendorId, async assertLease => {
    const row = await VendorBlockout.findOne({ _id: id, vendor: vendorId, recordType: 'EXTERNAL_COMMITMENT' });
    if (!row) throw schedulingError('RECORD_NOT_FOUND', 'External booking not found.', 404);
    const old = row.history.find(h => h.idempotencyKey === key);
    if (old) { if (old.requestHash !== hash) throw schedulingError('IDEMPOTENCY_CONFLICT', 'Request key reused for a different action.', 409); return row; }
    if (input.revision !== undefined && Number(input.revision) !== row.revision) throw schedulingError('STALE_REVISION', 'Refresh this booking before recording money.', 409);
    if (kind === 'RECEIPT' && row.status === 'CANCELLED') throw schedulingError('BOOKING_CANCELLED', 'A cancelled booking cannot receive a new receipt.', 409);
    if (input.attachmentId && !row.externalBooking.attachments?.some(a => String(a._id) === String(input.attachmentId))) throw schedulingError('ATTACHMENT_NOT_OWNED', 'Choose an attachment from this booking.', 403);
    const financial = externalFinancials(row);
    if (kind === 'RECEIPT' && Math.round((financial.netReceivedAmount + amount) * 100) > Math.round(financial.totalAmount * 100)) throw schedulingError('EXTERNAL_OVERPAYMENT', 'Receipt exceeds the remaining external contract amount.', 409);
    if (kind === 'REFUND' && Math.round(amount * 100) > Math.round(financial.netReceivedAmount * 100)) throw schedulingError('EXTERNAL_OVERREFUND', 'Refund exceeds net reported receipts.', 409);
    await assertLease();
    const { kind: ignoredKind, ...entry } = values;
    return VendorBlockout.findOneAndUpdate({ _id: row._id, vendor: vendorId, revision: row.revision }, { $inc: { revision: 1 }, $push: {
      [`externalBooking.${kind === 'RECEIPT' ? 'receipts' : 'refunds'}`]: { ...entry, key, actor: String(actor.id), recordedAt: new Date() },
      history: { actor: String(actor.id), role: actor.role, action: `EXTERNAL_${kind}_REPORTED`, at: new Date(), reason, after: { amount }, idempotencyKey: key, requestHash: hash },
    } }, { new: true, runValidators: true });
  });
}

export async function expireExternalHolds(limit = 50) {
  const now = new Date();
  const rows = await VendorBlockout.find({ recordType: 'EXTERNAL_COMMITMENT', status: 'ACTIVE', 'externalBooking.lifecycle': 'ON_HOLD', 'externalBooking.holdExpiresAt': { $lte: now } }).select('_id vendor').limit(limit).lean();
  for (const row of rows) {
    await withVendorSchedule(row.vendor, () => VendorBlockout.updateOne({ _id: row._id, vendor: row.vendor, 'externalBooking.lifecycle': 'ON_HOLD', 'externalBooking.holdExpiresAt': { $lte: now } }, {
      $set: { 'externalBooking.lifecycle': 'ENQUIRY' }, $inc: { revision: 1 },
      $push: { history: { actor: 'SYSTEM', role: 'SYSTEM', action: 'TENTATIVE_HOLD_EXPIRED', at: now, reason: 'Tentative hold reached its recorded expiry', before: { lifecycle: 'ON_HOLD' }, after: { lifecycle: 'ENQUIRY' } } },
    }));
  }
  return rows.length;
}
export async function cancelCommitment(vendorId, id, actor, reason = '') {
  return withVendorSchedule(vendorId, async assertLease => {
    const row = await VendorBlockout.findOne({ _id: id, vendor: vendorId });
    if (!row) throw schedulingError('RECORD_NOT_FOUND', 'Record not found.', 404);
    if (row.status === 'CANCELLED') return row;
    if (row.externalBooking?.lifecycle === 'COMPLETED') throw schedulingError('RECORD_COMPLETED', 'A completed booking requires a support correction.', 409);
    await assertLease();
    return VendorBlockout.findOneAndUpdate({ _id: id, vendor: vendorId }, { $set: { status: 'CANCELLED', ...(row.recordType === 'EXTERNAL_COMMITMENT' ? { 'externalBooking.lifecycle': 'CANCELLED' } : {}) }, $inc: { revision: 1 }, $push: { history: { actor: String(actor.id), role: actor.role, action: 'CANCELLED', at: new Date(), reason: String(reason).slice(0, 500), before: snapshot(row), after: { status: 'CANCELLED' } } } }, { new: true });
  });
}

export async function cancelLegacyCommitment(vendorId, id, actor, reason = '') {
  return withVendorSchedule(vendorId, async assertLease => {
    const row = await VendorBookingSlot.findOne({ _id: id, vendor: vendorId });
    if (!row) throw schedulingError('RECORD_NOT_FOUND', 'Record not found.', 404);
    if (row.status === 'CANCELLED') return row;
    await assertLease();
    return VendorBookingSlot.findOneAndUpdate({ _id: row._id, vendor: vendorId }, { $set: { status: 'CANCELLED' }, $push: { history: { actor: String(actor.id), role: actor.role, action: 'CANCELLED', at: new Date(), reason: String(reason).slice(0, 500), before: { status: row.status }, after: { status: 'CANCELLED' } } } }, { new: true });
  });
}
