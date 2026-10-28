import { observeProduct } from '../../common/productObservability.js';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { VendorBlockout } from '../models/VendorBlockout.js';
import { VendorService } from '../models/VendorService.js';
import { VendorResource } from '../models/VendorResource.js';
import { VendorBookingSlot } from '../models/VendorBookingSlot.js';
import { normaliseCommitment, schedulingError } from '../../common/scheduleRules.js';
import { withVendorSchedule } from './scheduleLock.js';
import { checkTrueAvailability } from './availability.service.js';

export async function saveCommitment(vendorId, input, actor, id = null) {
  const data = normaliseCommitment(input);
  if (data.vendorService && (!mongoose.isValidObjectId(data.vendorService) || !await VendorService.exists({ _id: data.vendorService, vendor: vendorId }))) throw schedulingError('SERVICE_NOT_OWNED', 'The service does not belong to this vendor.', 403);
  if (data.resourceIds.some(id => !mongoose.isValidObjectId(id)) || (data.resourceIds.length && await VendorResource.countDocuments({ _id: { $in: data.resourceIds }, vendor: vendorId, status: { $ne: 'RETIRED' } }) !== data.resourceIds.length)) throw schedulingError('RESOURCE_NOT_OWNED', 'The resource does not belong to this vendor.', 403);
  const key = String(input.idempotencyKey || '').trim().slice(0, 160);
  if (!key) throw schedulingError('IDEMPOTENCY_KEY_REQUIRED', 'A request identifier is required.');
  const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
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
    if (before && Number(input.revision) !== (before.revision || 0)) throw schedulingError('STALE_REVISION', 'This record changed. Refresh before editing.', 409);
    const availability = await checkTrueAvailability({ vendorId, ...data, vendorServiceId: data.vendorService, requestedResources: data.resourceIds, excludeId: id, blockAll: data.recordType === 'VENDOR_BLOCK' });
    if (!availability.feasible) throw schedulingError('SCHEDULE_CONFLICT', 'This interval conflicts with the current schedule.', 409, availability.conflicts);
    await assertLease();
    const history = { actor: String(actor.id), role: actor.role, action: before ? 'UPDATED' : 'CREATED', at: new Date(), reason: data.reason, before: before ? snapshot(before) : null, after: snapshot(data), idempotencyKey: key, requestHash: hash };
    if (before) return VendorBlockout.findOneAndUpdate({ _id: id, vendor: vendorId, revision: before.revision || 0 }, { $set: data, $inc: { revision: 1 }, $push: { history } }, { new: true, runValidators: true });
    return VendorBlockout.create({ vendor: vendorId, ...data, idempotencyKey: key, requestHash: hash, history: [history] });
  }).then(async row => { await observeProduct(id ? 'schedule_update' : 'schedule_create', outcome, vendorId); return row; }).catch(async err => { await observeProduct(id ? 'schedule_update' : 'schedule_create', err.code || 'FAILED', vendorId); throw err; });
}
function snapshot(row) {
  return { recordType: row.recordType, status: row.status || 'ACTIVE', date: row.date, endDate: row.endDate, startTime: row.startTime, endTime: row.endTime, scope: row.scope, vendorService: row.vendorService, resourceIds: row.resourceIds, reason: row.reason };
}
export async function cancelCommitment(vendorId, id, actor, reason = '') {
  return withVendorSchedule(vendorId, async assertLease => {
    const row = await VendorBlockout.findOne({ _id: id, vendor: vendorId });
    if (!row) throw schedulingError('RECORD_NOT_FOUND', 'Record not found.', 404);
    if (row.status === 'CANCELLED') return row;
    await assertLease();
    return VendorBlockout.findOneAndUpdate({ _id: id, vendor: vendorId }, { $set: { status: 'CANCELLED' }, $inc: { revision: 1 }, $push: { history: { actor: String(actor.id), role: actor.role, action: 'CANCELLED', at: new Date(), reason: String(reason).slice(0, 500), before: snapshot(row), after: { status: 'CANCELLED' } } } }, { new: true });
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
