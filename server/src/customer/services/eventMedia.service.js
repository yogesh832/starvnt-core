import crypto from 'node:crypto';
import { config } from '../../config.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { withVendorSchedule } from '../../external/services/scheduleLock.js';
import { CustomerEvent, EventHistory } from '../models/index.js';
import { EventMedia, EventPublication } from '../models/eventMedia.models.js';
import { authorizeEventAccess, projectEventForActor } from './eventAccess.service.js';
import { commandKey } from './eventCircle.service.js';
import { eventMediaStorage, prepareEventMedia } from './eventMediaStorage.service.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/http.js';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const serialize = row => ({
  id: String(row._id), kind: row.kind, caption: row.caption, state: row.state,
  purpose: row.purpose,
  bookingId: row.booking ? String(row.booking) : null, liveEligible: row.liveEligible,
  memoryIncluded: row.memoryIncluded, highlight: row.highlight, occurredAt: row.occurredAt,
  updatedAt: row.updatedAt, version: row.__v,
  review: row.review ? { reason: row.review.reason || '', reviewedAt: row.review.at } : null,
});
function scopedFilter(access) {
  return access.role === 'VENDOR' ? { booking: { $in: access.bookings.map(b => b._id) } } : {};
}
function reviewVisible(access, asset, actor) {
  return access.permissions.includes('moderate') || String(asset.uploader) === String(actor.id) || asset.state === 'PUBLISHED';
}
async function ownedAsset(actor, eventId, assetId, permission = 'read') {
  const asset = await EventMedia.findOne({ _id: assetId, event: eventId }).select('+storage');
  if (!asset) throw notFound('Media not found');
  const access = asset.purpose !== 'EVENT'
    ? await authorizeEvidence(actor, eventId, asset.booking, asset.purpose)
    : await authorizeEventAccess(actor, eventId, { permission, bookingId: asset.booking });
  if (!asset || !reviewVisible(access, asset, actor)) throw notFound('Media not found');
  if (asset.purpose === 'CASE_EVIDENCE' && actor.type === 'VENDOR' && String(asset.uploader) !== String(actor.id)) throw notFound('Evidence not found');
  return { access, asset };
}
async function authorizeEvidence(actor, eventId, bookingId, purpose) {
  const event = await CustomerEvent.findById(eventId).lean();
  const booking = await CoreBooking.findOne({ _id: bookingId, customerEvent: eventId, customerId: event?.customer }).lean();
  if (!event || !booking) throw notFound('Booked service not found');
  if (purpose === 'FINANCE_EVIDENCE') {
    if (actor?.type === 'ADMIN' && (actor.role === 'SUPER_ADMIN' || actor.permissions?.some(p => ['payments.refund', 'settlements.release', 'settlements.approve'].includes(p)))) return { role: 'ADMIN', permissions: ['read', 'upload', 'moderate'] };
    throw notFound('Finance evidence not found');
  }
  if (actor?.type === 'CUSTOMER' && String(event.customer) === String(actor.id)) return { role: 'OWNER', permissions: ['read', 'upload', 'moderate'] };
  if (actor?.type === 'VENDOR' && String(booking.vendorId) === String(actor.vendorId)) return { role: 'VENDOR', permissions: ['read', 'upload'] };
  if (actor?.type === 'ADMIN' && (actor.role === 'SUPER_ADMIN' || actor.permissions?.includes('operations.manage'))) return { role: 'ADMIN', permissions: ['read', 'upload', 'moderate'] };
  throw notFound('Evidence not found');
}
export async function listEventMedia(actor, eventId, filters = {}) {
  const access = await authorizeEventAccess(actor, eventId);
  const query = { event: eventId, purpose: 'EVENT', ...scopedFilter(access) };
  if (!access.permissions.includes('moderate')) query.$or = [{ state: 'PUBLISHED' }, { uploader: actor.id }];
  if (filters.view === 'memory') {
    query.state = 'PUBLISHED';
    query.memoryIncluded = true;
  }
  const assets = await EventMedia.find(query).sort({ occurredAt: 1, _id: 1 }).limit(500).lean();
  const publication = await EventPublication.findOne({ event: eventId }).lean();
  return {
    event: projectEventForActor(access), permissions: access.permissions, assets: assets.map(serialize),
    publication: { liveEnabled: publication?.liveEnabled === true, memoryShared: publication?.memoryShared === true, version: publication?.__v ?? 0 },
  };
}

export function createEventMedia(actor, eventId, input, file = null) {
  return withVendorSchedule(`event-media:${eventId}:${actor?.id}`, () => createEventMediaLocked(actor, eventId, input, file));
}
async function createEventMediaLocked(actor, eventId, input, file) {
  const purpose = input.purpose || 'EVENT';
  if (!['EVENT', 'COMPLETION_EVIDENCE', 'CASE_EVIDENCE', 'FINANCE_EVIDENCE'].includes(purpose)) throw badRequest('INVALID_MEDIA_PURPOSE', 'Choose the purpose of this upload.');
  const authorize = () => purpose === 'EVENT'
    ? authorizeEventAccess(actor, eventId, { permission: 'upload', bookingId: input.bookingId })
    : authorizeEvidence(actor, eventId, input.bookingId, purpose);
  const access = await authorize();
  if (access.role === 'VENDOR' && !input.bookingId) throw forbidden('Choose the booked service for this upload.');
  const requestKey = commandKey(input.idempotencyKey);
  const caption = typeof input.caption === 'string' ? input.caption.trim() : '';
  const rightsConfirmed = input.rightsConfirmed === true || input.rightsConfirmed === 'true';
  if (caption.length > 2000 || (!file && !caption) || !rightsConfirmed) throw badRequest('MEDIA_PERMISSION_REQUIRED', 'Confirm permission to share this content and add a photo, video or update.');
  const requestHash = digest(JSON.stringify({ purpose, caption, bookingId: input.bookingId || null, rightsConfirmed, file: file ? digest(file.buffer) : null, mime: file?.mimetype }));
  const filter = { event: eventId, uploader: actor.id, requestKey };
  const existing = await EventMedia.findOne(filter);
  if (existing) {
    if (existing.requestHash !== requestHash) throw conflict('IDEMPOTENCY_CONFLICT', 'This upload request was already used for different content.');
    return { asset: serialize(existing) };
  }
  const prepared = file ? await prepareEventMedia(file, { allowDocument: purpose !== 'EVENT' }) : null;
  const storage = prepared ? await eventMediaStorage.upload(eventId, actor.id, prepared) : null;
  // Recheck after provider work, so revoked membership cannot commit an upload.
  await authorize();
  let asset;
  try {
    asset = await EventMedia.findOneAndUpdate(filter, { $setOnInsert: {
      ...filter, purpose, uploaderType: actor.type, booking: input.bookingId || null, caption, rightsConfirmed,
      kind: prepared?.kind || 'UPDATE', storage, requestHash, state: 'PENDING',
      history: [{ actor: String(actor.id), action: 'SUBMITTED', at: new Date(), to: 'PENDING', key: requestKey, hash: requestHash }],
    } }, { upsert: true, new: true, runValidators: true });
  } catch (error) { if (error.code !== 11000) throw error; asset = await EventMedia.findOne(filter); }
  if (asset.requestHash !== requestHash) throw conflict('IDEMPOTENCY_CONFLICT', 'This upload request was already used for different content.');
  return { asset: serialize(asset) };
}

export async function moderateEventMedia(actor, eventId, assetId, input) {
  const { access, asset } = await ownedAsset(actor, eventId, assetId);
  if (asset.purpose !== 'EVENT') throw forbidden('Private service evidence is reviewed through the booking or protection case.');
  const key = commandKey(input.idempotencyKey);
  const decision = input.decision;
  if (!['APPROVE', 'REJECT', 'WITHDRAW', 'CURATE'].includes(decision)) throw badRequest('INVALID_DECISION', 'Choose a media action.');
  const hash = digest(JSON.stringify({
    decision, privacy: input.privacy === true, safety: input.safety === true, rights: input.rights === true,
    reason: input.reason || '', liveEligible: input.liveEligible === true, memoryIncluded: input.memoryIncluded === true,
    highlight: input.highlight === true,
  }));
  const prior = asset.history.find(h => h.key === key);
  if (prior) {
    if (prior.hash !== hash) throw conflict('IDEMPOTENCY_CONFLICT', 'This action key was already used.');
    return { asset: serialize(asset) };
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion !== asset.__v) throw conflict('MEDIA_CHANGED', 'This content changed. Refresh before reviewing.');
  if (decision === 'WITHDRAW') {
    if (!access.permissions.includes('moderate') && String(asset.uploader) !== String(actor.id)) throw forbidden();
  } else if (decision === 'CURATE') {
    if (!access.permissions.includes('memory.edit')) throw forbidden();
    if (asset.state !== 'PUBLISHED') throw conflict('MEDIA_NOT_PUBLISHED', 'Approve the content before adding it to Memory.');
  } else {
    if (!access.permissions.includes('moderate')) throw forbidden();
    if (asset.state === 'WITHDRAWN') throw conflict('MEDIA_WITHDRAWN', 'Withdrawn content must be submitted again for review.');
  }
  if (decision === 'APPROVE' && (!asset.rightsConfirmed || input.privacy !== true || input.safety !== true || input.rights !== true)) {
    throw badRequest('REVIEW_REQUIRED', 'Complete the privacy, safety and sharing-permission checks before approval.');
  }
  const nextState = { APPROVE: 'PUBLISHED', REJECT: 'REJECTED', WITHDRAW: 'WITHDRAWN', CURATE: 'PUBLISHED' }[decision];
  const fields = { state: nextState };
  if (['APPROVE', 'REJECT'].includes(decision)) fields.review = { privacy: input.privacy === true, safety: input.safety === true, rights: input.rights === true, actor: String(actor.id), at: new Date(), reason: String(input.reason || '').slice(0, 1000) };
  if (['CURATE', 'APPROVE'].includes(decision)) {
    fields.memoryIncluded = input.memoryIncluded === true && access.permissions.includes('memory.edit');
    fields.liveEligible = input.liveEligible === true;
    fields.highlight = input.highlight === true && fields.memoryIncluded;
  }
  if (nextState !== 'PUBLISHED') Object.assign(fields, { memoryIncluded: false, liveEligible: false, highlight: false });
  const updated = await EventMedia.findOneAndUpdate({ _id: asset._id, __v: asset.__v }, {
    $set: fields, $inc: { __v: 1 }, $push: { history: { actor: String(actor.id), action: decision, at: new Date(), from: asset.state, to: nextState, key, hash } },
  }, { new: true, runValidators: true });
  if (!updated) throw conflict('MEDIA_CHANGED', 'This content changed. Refresh before reviewing.');
  return { asset: serialize(updated) };
}

export async function changeEventPublication(actor, eventId, input) {
  await authorizeEventAccess(actor, eventId, { permission: 'publish' });
  const key = commandKey(input.idempotencyKey);
  if (typeof input.liveEnabled !== 'boolean' || typeof input.memoryShared !== 'boolean') throw badRequest('PUBLICATION_CHOICE_REQUIRED', 'Choose whether to enable the event display and share Memory.');
  const hash = digest(JSON.stringify({ liveEnabled: input.liveEnabled, memoryShared: input.memoryShared }));
  let row;
  try {
    row = await EventPublication.findOneAndUpdate({ event: eventId }, { $setOnInsert: { event: eventId } }, { upsert: true, new: true }).select('+tokenHash');
  } catch (error) {
    if (error.code !== 11000) throw error;
    row = await EventPublication.findOne({ event: eventId }).select('+tokenHash');
  }
  const previous = row.history.find(h => h.key === key);
  if (previous && previous.hash !== hash) throw conflict('IDEMPOTENCY_CONFLICT', 'This sharing request was already used.');
  // Reproducible only by the server, allowing a lost response to be safely retried.
  const token = crypto.createHmac('sha256', config.jwtSecret).update(`event-publication:${eventId}:${actor.id}:${key}`).digest('base64url');
  if (!previous) {
    if (input.expectedVersion !== row.__v) throw conflict('PUBLICATION_CHANGED', 'Refresh the sharing controls before saving.');
    row = await EventPublication.findOneAndUpdate({ _id: row._id, __v: row.__v }, {
      $set: { liveEnabled: input.liveEnabled, memoryShared: input.memoryShared, tokenHash: input.liveEnabled || input.memoryShared ? digest(token) : null },
      $inc: { __v: 1 }, $push: { history: { actor: String(actor.id), action: 'SHARING_CHANGED', at: new Date(), key, hash } },
    }, { new: true }).select('+tokenHash');
    if (!row) throw conflict('PUBLICATION_CHANGED', 'Sharing changed. Refresh and retry.');
  }
  return { publication: { liveEnabled: row.liveEnabled, memoryShared: row.memoryShared, version: row.__v }, shareToken: row.tokenHash === digest(token) ? token : null };
}

async function publicAccess(token, view) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) || !['memory', 'live'].includes(view)) throw notFound('Shared event not found');
  const publication = await EventPublication.findOne({ tokenHash: digest(token), [view === 'live' ? 'liveEnabled' : 'memoryShared']: true }).lean();
  if (!publication) throw notFound('This event link is unavailable or has been revoked.');
  const event = await CustomerEvent.findById(publication.event).lean();
  if (!event || event.status === 'cancelled') throw notFound('Shared event not found');
  return { event, publication };
}
export async function listAuthorizedLiveMedia(actor, eventId) {
  await authorizeEventAccess(actor, eventId);
  const publication = await EventPublication.findOne({ event: eventId, liveEnabled: true });
  return { assets: publication ? (await EventMedia.find({ event: eventId, purpose: 'EVENT', state: 'PUBLISHED', liveEligible: true }).sort({ occurredAt: 1 }).limit(500).lean()).map(serialize) : [], enabled: Boolean(publication) };
}
export async function publicEventMedia(token, view) {
  const { event } = await publicAccess(token, view);
  const query = { event: event._id, purpose: 'EVENT', state: 'PUBLISHED', [view === 'live' ? 'liveEligible' : 'memoryIncluded']: true };
  return { event: { title: event.title, eventDate: event.eventDate }, assets: (await EventMedia.find(query).sort({ occurredAt: 1 }).limit(500).lean()).map(row => ({
    id: String(row._id), kind: row.kind, caption: row.caption, occurredAt: row.occurredAt,
    updatedAt: row.updatedAt, highlight: row.highlight,
  })) };
}
export async function getEventMediaAccess(assetId, actor, { shareToken = null, view = 'memory' } = {}) {
  let asset;
  if (shareToken) {
    const { event } = await publicAccess(shareToken, view);
    asset = await EventMedia.findOne({ _id: assetId, event: event._id, purpose: 'EVENT', state: 'PUBLISHED', [view === 'live' ? 'liveEligible' : 'memoryIncluded']: true }).select('+storage');
  } else {
    const found = await EventMedia.findById(assetId).select('event').lean();
    if (!found) throw notFound('Media not found');
    ({ asset } = await ownedAsset(actor, found.event, assetId));
  }
  if (!asset?.storage || asset.state === 'WITHDRAWN') throw notFound('Media unavailable');
  return { asset: serialize(asset), storage: asset.storage.toObject() };
}

export async function eventMemory(actor, eventId) {
  const access = await authorizeEventAccess(actor, eventId, { permission: 'memory.read' });
  const media = await listEventMedia(actor, eventId, { view: 'memory' });
  // Operational audit entries remain private. Only the owner gets a minimal story from saved records.
  const history = access.role === 'OWNER' ? await EventHistory.find({ event: eventId, action: { $in: ['event_created', 'event_confirmed', 'payment_verified', 'event_completed'] } }).select('action createdAt').sort({ createdAt: 1 }).lean() : [];
  return { ...media, completed: access.event.status === 'completed', story: history.map(h => ({ id: String(h._id), action: h.action, at: h.createdAt })) };
}
