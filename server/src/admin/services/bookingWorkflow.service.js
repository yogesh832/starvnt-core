import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { CoreBooking } from '../models/CoreBooking.js';
import { withVendorSchedule } from '../../external/services/scheduleLock.js';
import { schedulingError } from '../../common/scheduleRules.js';

export const workflowError = schedulingError;
export function requestHash(value) {
  const stable = item => Array.isArray(item) ? item.map(stable) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().filter(key => item[key] !== undefined).map(key => [key, stable(item[key])])) : item;
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
export function commandKey(key) {
  if (typeof key !== 'string' || !key.trim() || key.length > 160) throw workflowError('IDEMPOTENCY_KEY_REQUIRED', 'Provide a stable request identity.');
  return key.trim();
}
export function adminActor(admin) {
  return { id: String(admin._id), type: 'ADMIN', role: admin.role, permissions: [...(admin.permissions || [])] };
}
export function requireCoreActor(actor, permission = 'operations.manage') {
  if (actor?.type !== 'ADMIN' || !actor.id || (actor.role !== 'SUPER_ADMIN' && !actor.permissions?.includes(permission))) {
    throw workflowError('CORE_AUTHORITY_REQUIRED', 'An authorized Core staff decision is required.', 403);
  }
}
export function assertBookingActor(booking, actor) {
  if (actor?.type === 'ADMIN') return requireCoreActor(actor, actor.permission || 'operations.manage');
  const owner = actor?.type === 'VENDOR' ? booking.vendorId : actor?.type === 'CUSTOMER' ? booking.customerId : null;
  const actorOwner = actor?.type === 'VENDOR' ? actor.vendorId : actor?.id;
  if (!owner || String(owner) !== String(actorOwner)) throw workflowError('BOOKING_ACCESS_DENIED', 'This booking is not available to this account.', 403);
}
export function hasOpenDisputes(booking) {
  return (booking.disputes || []).some(item => item.status !== 'RESOLVED');
}
export function bookingState(booking) {
  return { bookingStatus: booking.bookingStatus, paymentStatus: booking.paymentStatus, executionStatus: booking.executionStatus,
    protectionStatus: booking.protectionStatus, settlementStatus: booking.settlementStatus, workflowVersion: booking.workflowVersion || 0 };
}
export async function findCoreBooking(id) {
  const clauses = [{ bookingReference: String(id) }, { quoteId: String(id) }];
  if (mongoose.isValidObjectId(id)) clauses.push({ _id: id }, { customerBookingId: id });
  const booking = await CoreBooking.findOne({ $or: clauses });
  if (!booking) throw workflowError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
  return booking;
}

// A command and its audit/outbox intent commit in the authoritative document.
// The existing vendor lease serializes booking, dispute and finance writers.
export async function runBookingCommand(id, { actor, action, input = {}, key, expectedVersion }, mutate) {
  commandKey(key);
  const initial = await findCoreBooking(id);
  return withVendorSchedule(initial.vendorId, async assertLease => {
    const booking = await findCoreBooking(initial._id);
    assertBookingActor(booking, actor);
    const hash = requestHash({ action, actor: actor.id, input });
    const prior = booking.operationReceipts.find(receipt => receipt.key === key);
    if (prior) {
      if (prior.hash !== hash) throw workflowError('IDEMPOTENCY_CONFLICT', 'This request identity was used for another action.', 409);
      return booking;
    }
    if (expectedVersion != null && Number(expectedVersion) !== (booking.workflowVersion || 0)) throw workflowError('BOOKING_VERSION_CONFLICT', 'Refresh the booking before updating it.', 409);
    const fromState = bookingState(booking);
    await mutate(booking);
    booking.workflowVersion = (booking.workflowVersion || 0) + 1;
    const at = new Date();
    booking.operationReceipts.push({ key, hash, action, actor: String(actor.id), at });
    booking.workflowEvents.push({ key, action, actor: String(actor.id), actorType: actor.type, at,
      reason: String(input.reason || input.notes || action).slice(0, 1000), fromState, toState: bookingState(booking) });
    await assertLease();
    await booking.save();
    return booking;
  });
}

export function evidenceFiles(input = []) {
  if (!Array.isArray(input) || input.length > 20) throw workflowError('INVALID_EVIDENCE', 'Add at most 20 evidence files.');
  return input.map(file => {
    const assetId = file?.assetId || (typeof file === 'string' && /^asset:[a-f0-9]{24}$/i.test(file) ? file.slice(6) : null);
    if (assetId && mongoose.isValidObjectId(assetId)) return { assetId: String(assetId), url: `asset:${assetId}`, note: String(file?.note || '').slice(0, 500) };
    const url = typeof file === 'string' ? file : file?.url;
    let parsed;
    try { parsed = new URL(url); } catch { throw workflowError('INVALID_EVIDENCE_URL', 'Evidence must use an HTTPS file URL.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.href.length > 2000) throw workflowError('INVALID_EVIDENCE_URL', 'Evidence must use an HTTPS file URL.');
    return { url: parsed.href, note: String(file?.note || '').slice(0, 500) };
  });
}

export async function authorizeEvidenceFiles(files, booking, actor, purpose) {
  if (!files.length) return;
  const { getEventMediaAccess } = await import('../../customer/services/eventMedia.service.js');
  for (const file of files) {
    if (!file.assetId) throw workflowError('PRIVATE_EVIDENCE_REQUIRED', 'Upload evidence through the private booking media endpoint.');
    const { asset } = await getEventMediaAccess(file.assetId, actor);
    if (String(asset.bookingId) !== String(booking._id) || asset.purpose !== purpose) {
      throw workflowError('EVIDENCE_CONTEXT_MISMATCH', 'Evidence must belong to this booking.', 403);
    }
  }
}
