import { ExternalUser } from '../../external/models/ExternalUser.js';
import { verifiedContact } from '../../foundation/identity.service.js';
import { EventCircleMember } from '../models/eventCircle.models.js';
import { CustomerEvent, EventMessage } from '../models/index.js';
import { authorizeEventAccess, projectEventForActor } from './eventAccess.service.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/http.js';

export function customerActor(id) { return { id, type: 'CUSTOMER' }; }
export function commandKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(value)) throw badRequest('REQUEST_KEY_REQUIRED', 'Supply a request key for this action.');
  return value;
}
const memberView = row => ({
  id: String(row._id), role: row.role, state: row.state === 'INVITED' && row.expiresAt <= new Date() ? 'EXPIRED' : row.state,
  email: row.email, expiresAt: row.expiresAt, version: row.__v, userId: row.user ? String(row.user) : null,
});
const messageView = row => ({
  id: String(row._id), body: row.body, senderName: row.senderName || 'Event participant',
  senderId: String(row.senderCustomer), createdAt: row.createdAt,
  bookingId: row.booking ? String(row.booking) : null, requirementId: row.requirement ? String(row.requirement) : null,
});

export async function collaboration(actor, eventId) {
  const access = await authorizeEventAccess(actor, eventId);
  return {
    event: projectEventForActor(access), role: access.role, permissions: access.permissions, unlocked: access.unlocked,
    bookings: access.bookings.map(b => ({ id: String(b._id), reference: b.bookingReference, vendorName: b.vendorName, serviceName: b.serviceName, category: b.category })),
    members: access.permissions.includes('invite') ? (await EventCircleMember.find({ event: eventId }).sort({ createdAt: -1 }).limit(100).lean()).map(memberView) : [],
  };
}

export async function inviteMember(actor, eventId, input) {
  const { event } = await authorizeEventAccess(actor, eventId, { permission: 'invite' });
  const requestKey = commandKey(input.idempotencyKey);
  const email = String(input.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw badRequest('INVALID_EMAIL', 'Enter the invited person’s email address.');
  if (!['VIEWER', 'PARTICIPANT', 'COORDINATOR'].includes(input.role)) throw badRequest('INVALID_ROLE', 'Choose a participant role.');
  const previous = await EventCircleMember.findOne({ event: eventId, $or: [{ email }, { requestKey }] }).lean();
  if (previous?.requestKey === requestKey) {
    if (previous.email !== email || previous.role !== input.role) throw conflict('IDEMPOTENCY_CONFLICT', 'This request key was already used.');
    return { member: memberView(previous) };
  }
  if (previous && previous.state !== 'REVOKED' && (previous.state === 'ACTIVE' || previous.expiresAt > new Date())) {
    throw conflict('INVITATION_EXISTS', 'This person already has an invitation or event access.');
  }
  const now = new Date();
  const change = {
    email, role: input.role, user: null, state: 'INVITED', invitedBy: actor.id, requestKey,
    expiresAt: new Date(now.getTime() + 7 * 86400000),
  };
  const history = { actor: String(actor.id), action: 'INVITED', at: now, from: previous?.state || '', to: 'INVITED', requestKey };
  let row;
  try {
    row = previous ? await EventCircleMember.findOneAndUpdate(
      { _id: previous._id, __v: previous.__v },
      { $set: change, $inc: { __v: 1 }, $push: { history } },
      { new: true, runValidators: true },
    ) : await EventCircleMember.create({ event: event._id, ...change, history: [history] });
  } catch (error) {
    if (error.code !== 11000) throw error;
    row = await EventCircleMember.findOne({ event: eventId, email, requestKey, role: input.role });
    if (!row) throw conflict('INVITATION_CHANGED', 'Refresh the participants and retry.');
  }
  if (!row) throw conflict('INVITATION_CHANGED', 'Refresh the participants and retry.');
  return { member: memberView(row) };
}

export async function invitations(actor) {
  const user = await ExternalUser.findById(actor.id).lean();
  if (!user || !verifiedContact(user, 'EMAIL')) return { invitations: [], emailVerificationRequired: true };
  const rows = await EventCircleMember.find({
    $or: [{ email: user.email, state: 'INVITED', expiresAt: { $gt: new Date() } }, { user: actor.id, state: 'ACTIVE' }],
  }).sort({ createdAt: -1 }).limit(100).lean();
  const events = await CustomerEvent.find({ _id: { $in: rows.map(r => r.event) } }).select('title').lean();
  const titles = new Map(events.map(e => [String(e._id), e.title]));
  return { invitations: rows.filter(r => titles.has(String(r.event))).map(r => ({ ...memberView(r), eventId: String(r.event), eventTitle: titles.get(String(r.event)) })) };
}

export async function acceptInvitation(actor, invitationId, input) {
  const user = await ExternalUser.findById(actor.id).lean();
  if (!user || !verifiedContact(user, 'EMAIL')) throw forbidden('Verify your email before accepting an event invitation.');
  const row = await EventCircleMember.findOne({ _id: invitationId, email: user.email }).lean();
  if (!row) throw notFound('Invitation not found');
  const event = await CustomerEvent.findById(row.event).lean();
  if (!event) throw notFound('Event not found');
  // Verify the original booking eligibility again before granting membership.
  await authorizeEventAccess(customerActor(event.customer), event._id, { permission: 'invite' });
  const requestKey = commandKey(input.idempotencyKey);
  if (row.state === 'ACTIVE' && String(row.user) === String(actor.id)) return { member: memberView(row) };
  if (row.state !== 'INVITED' || row.expiresAt <= new Date()) throw conflict('INVITATION_UNAVAILABLE', 'This invitation has expired or was revoked.');
  const result = await EventCircleMember.findOneAndUpdate(
    { _id: row._id, state: 'INVITED', __v: row.__v, expiresAt: { $gt: new Date() } },
    { $set: { state: 'ACTIVE', user: actor.id }, $inc: { __v: 1 }, $push: { history: { actor: String(actor.id), action: 'ACCEPTED', at: new Date(), from: 'INVITED', to: 'ACTIVE', requestKey } } },
    { new: true },
  );
  if (!result) throw conflict('INVITATION_CHANGED', 'Refresh the invitation and retry.');
  return { member: memberView(result) };
}

export async function revokeMember(actor, eventId, memberId, input) {
  await authorizeEventAccess(actor, eventId, { permission: 'invite' });
  const requestKey = commandKey(input.idempotencyKey);
  const member = await EventCircleMember.findOneAndUpdate(
    { _id: memberId, event: eventId, state: { $ne: 'REVOKED' } },
    { $set: { state: 'REVOKED' }, $inc: { __v: 1 }, $push: { history: { actor: String(actor.id), action: 'REVOKED', at: new Date(), to: 'REVOKED', requestKey } } },
    { new: true },
  ) || await EventCircleMember.findOne({ _id: memberId, event: eventId, state: 'REVOKED' });
  if (!member) throw notFound('Participant not found');
  return { member: memberView(member) };
}

export async function circleMessages(actor, eventId, input = {}, { post = false } = {}) {
  const access = await authorizeEventAccess(actor, eventId, { permission: post ? 'message' : 'read', bookingId: input.bookingId });
  if (!access.unlocked) throw conflict('CIRCLE_LOCKED', 'Event Circle becomes available after a verified service booking.');
  // Vendor visibility is confined to its booked service, never the family conversation.
  if (access.role === 'VENDOR' && !input.bookingId) throw forbidden('Choose your booked service conversation.');
  const filter = { event: eventId, 'payload.audience': 'EVENT_CIRCLE', booking: input.bookingId || null };
  if (!post) return { messages: (await EventMessage.find(filter).sort({ createdAt: 1, _id: 1 }).limit(500).lean()).map(messageView) };
  const requestKey = commandKey(input.idempotencyKey);
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!body || body.length > 2000) throw badRequest('INVALID_BODY', 'Write a message of up to 2,000 characters.');
  const actorRow = await ExternalUser.findById(actor.id).select('fullName').lean();
  const key = `circle:${actor.id}:${requestKey}`;
  let message;
  try {
    message = await EventMessage.findOneAndUpdate({ event: eventId, idempotencyKey: key }, {
      $setOnInsert: { event: eventId, booking: input.bookingId || null, payload: { audience: 'EVENT_CIRCLE' }, body, senderType: actor.type === 'VENDOR' ? 'vendor' : actor.type === 'ADMIN' ? 'team' : 'customer', senderCustomer: actor.id, senderName: actorRow?.fullName || 'Event team' },
    }, { upsert: true, new: true });
  } catch (error) { if (error.code !== 11000) throw error; message = await EventMessage.findOne({ event: eventId, idempotencyKey: key }); }
  if (message.body !== body || String(message.booking || '') !== String(input.bookingId || '')) throw conflict('IDEMPOTENCY_CONFLICT', 'This request key was already used.');
  return { message: messageView(message) };
}
