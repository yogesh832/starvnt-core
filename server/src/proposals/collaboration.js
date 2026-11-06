import mongoose from 'mongoose';
import { EventProposal, ProposalMessage, ProposalHandover } from './models.js';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { AdminUser } from '../admin/models/AdminUser.js';
import { withVendorSchedule } from '../external/services/scheduleLock.js';
import { foundationError as fail } from '../foundation/consent.service.js';
import { validDate } from '../common/scheduleRules.js';
import { text, hash, money, snapshotEvent, withProposalDecision } from './service.js';

export async function proposalFor(id, actor, includePdf = false) {
  const query = { _id: id };
  if (actor.domain === 'CUSTOMER') Object.assign(query, { customer: actor.id, state: 'SENT' });
  if (actor.domain === 'VENDOR') query['lines.vendor'] = actor.vendor;
  const p = mongoose.isValidObjectId(id) && await EventProposal.findOne(query).select(includePdf ? '+pdf' : '-pdf');
  if (!p) throw fail('PROPOSAL_NOT_FOUND', 'Proposal unavailable.', 404);
  return p;
}
function channel(actor, input) {
  if (actor.domain === 'CUSTOMER') return { audience: 'CUSTOMER' };
  if (actor.domain === 'VENDOR') return { audience: 'VENDOR', vendor: actor.vendor };
  if (!['CUSTOMER', 'VENDOR', 'INTERNAL'].includes(input.audience)) throw fail('INVALID_CHANNEL', 'Choose a discussion audience.');
  if (input.audience === 'VENDOR' && !mongoose.isValidObjectId(input.vendor)) throw fail('INVALID_CHANNEL', 'Choose an assigned vendor.');
  return { audience: input.audience, ...(input.audience === 'VENDOR' ? { vendor: input.vendor } : {}) };
}
const messageDTO = row => ({ _id: row._id, sequence: row.sequence, audience: row.audience, vendor: row.vendor, authorDomain: row.authorDomain, body: row.body, replyTo: row.replyTo, createdAt: row.createdAt });
function checkChannel(p, scope) {
  if (scope.audience === 'CUSTOMER' && p.state !== 'SENT') throw fail('DISCUSSION_UNAVAILABLE', 'Send this proposal before opening its customer discussion.', 409);
  if (scope.audience === 'VENDOR' && !p.lines.some(l => String(l.vendor) === String(scope.vendor))) throw fail('DISCUSSION_UNAVAILABLE', 'Vendor is not assigned to this version.', 404);
}
export async function listMessages(id, actor, input) {
  const p = await proposalFor(id, actor), scope = channel(actor, input); checkChannel(p, scope);
  const after = input.after === undefined ? 0 : Number(input.after);
  if (!Number.isSafeInteger(after) || after < 0) throw fail('INVALID_CURSOR', 'Use a valid discussion cursor.');
  const rows = await ProposalMessage.find({ proposal: p._id, ...scope, sequence: { $gt: after } }).sort({ sequence: 1 }).limit(51);
  return { messages: rows.slice(0, 50).map(messageDTO), hasMore: rows.length > 50, next: rows[Math.min(rows.length, 50) - 1]?.sequence || after };
}
export async function postMessage(id, actor, input) {
  return withVendorSchedule(`PROPOSAL:${id}`, async lease => {
    const p = await proposalFor(id, actor), scope = channel(actor, input); checkChannel(p, scope);
    const requestKey = text(input.idempotencyKey, 160, true), body = text(input.body, 4000, true);
    const replyTo = input.replyTo || null;
    if (replyTo && !mongoose.isValidObjectId(replyTo)) throw fail('INVALID_REPLY', 'Choose a valid message.');
    const requestHash = hash({ scope, body, replyTo });
    const prior = await ProposalMessage.findOne({ proposal: p._id, authorDomain: actor.domain, author: String(actor.id), requestKey });
    if (prior) { if (prior.requestHash !== requestHash) throw fail('REQUEST_CHANGED', 'Message request key reused.', 409); return messageDTO(prior); }
    if (replyTo && !await ProposalMessage.exists({ _id: replyTo, proposal: p._id, ...scope })) throw fail('INVALID_REPLY', 'Reply only within this version and audience.', 404);
    const latest = await ProposalMessage.findOne({ proposal: p._id }).sort({ sequence: -1 }).select('sequence');
    if ((latest?.sequence || 0) >= 2000) throw fail('DISCUSSION_LIMIT', 'This version reached its discussion limit. Use a new proposal version.', 409);
    await lease(); return messageDTO(await ProposalMessage.create({ proposal: p._id, sequence: (latest?.sequence || 0) + 1, ...scope, authorDomain: actor.domain, author: String(actor.id), body, replyTo, requestKey, requestHash }));
  });
}

const operational = a => a?.status === 'ACTIVE' && (a.role === 'SUPER_ADMIN' || (a.permissions.includes('proposals.read') && a.permissions.includes('proposals.handover') && a.permissions.some(p => ['execution.read', 'execution.manage', 'operations.read', 'operations.manage'].includes(p))));
export async function handoverOptions(p) {
  const [people, bookings] = await Promise.all([
    AdminUser.find({ status: 'ACTIVE', $or: [{ role: 'SUPER_ADMIN' }, { $and: [{ permissions: { $all: ['proposals.read', 'proposals.handover'] } }, { permissions: { $in: ['execution.read', 'execution.manage', 'operations.read', 'operations.manage'] } }] }] }).select('_id fullName').limit(200).lean(),
    CoreBooking.find({ customerEvent: p.event, customerId: p.customer, bookingStatus: 'CONFIRMED', paymentStatus: 'PAYMENT_VERIFIED' }).select('_id vendorId vendorService serviceName eventDate totalAmount').limit(200).lean(),
  ]);
  return { assignees: people, bookings };
}
async function approvedCurrent(p) {
  if (p.state !== 'SENT' || p.response?.decision !== 'APPROVED' || p.response.snapshotHash !== p.snapshotHash || hash(p.frozenSnapshot) !== p.snapshotHash || p.qualityApproval?.pdfHash !== p.pdfHash || !p.pdf || hash(p.pdf) !== p.pdfHash) throw fail('HANDOVER_GATE', 'A customer-approved exact proposal version and its intact final PDF are required.', 409);
  const current = await snapshotEvent(p.event);
  if (String(current.customer) !== String(p.customer) || hash(current.manifest) !== hash(p.manifest) || await EventProposal.exists({ event: p.event, state: 'SENT', version: { $gt: p.version } })) throw fail('HANDOVER_STALE', 'The approved event or sent version changed. Review a new proposal version.', 409);
}
async function validateBindings(p, bindings) {
  if (!Array.isArray(bindings) || bindings.length !== p.lines.length || new Set(bindings.map(b => String(b?.bookingId))).size !== bindings.length || new Set(bindings.map(b => String(b?.lineId))).size !== bindings.length) throw fail('HANDOVER_BOOKINGS', 'Bind each scope to a different authoritative booking.', 409);
  let charges = 0;
  for (const line of p.lines) {
    const b = bindings.find(b => String(b?.lineId) === String(line._id));
    if (!b || !mongoose.isValidObjectId(b.bookingId)) throw fail('HANDOVER_BOOKINGS', 'Every scope needs a valid booking.', 409);
    const allocated = Math.round(money(b.allocatedCharges ?? 0) * 100); charges += allocated;
    const booking = await CoreBooking.findOne({ _id: b.bookingId, customerEvent: p.event, customerId: p.customer, bookingStatus: 'CONFIRMED', paymentStatus: 'PAYMENT_VERIFIED' }).lean();
    if (line.fulfilment === 'INTERNAL' && booking?.serviceName !== line.name) throw fail('HANDOVER_BOOKINGS', 'An internal scope requires a booking with the exact approved service name.', 409);
    if (!booking || booking.eventDate !== p.manifest.eventDate || Math.round(booking.totalAmount * 100) !== Math.round(line.customerUnitPrice * 100) * line.quantity + allocated || (line.fulfilment === 'VENDOR' && (String(booking.vendorId) !== String(line.vendor) || String(booking.vendorService) !== String(line.service)))) throw fail('HANDOVER_BOOKINGS', 'Booking owner, event, supplier, service, amount or verified status does not match the approved scope.', 409);
  }
  if (charges !== Math.round(p.taxAmount * 100)) throw fail('HANDOVER_CHARGES', 'Allocate all proposal tax/additional charges to the matching bookings before release.', 409);
}
export async function changeHandover(id, actor, input, action) {
  return withProposalDecision(id, async lease => {
    const p = await proposalFor(id, actor, true); await approvedCurrent(p);
    let row = await ProposalHandover.findOne({ proposal: p._id });
    const requestKey = text(input.idempotencyKey, 160, true), digest = hash({ action, ...input });
    const replay = row?.history.find(h => h.key === requestKey);
    if (replay) { if (replay.actor !== String(actor.id) || replay.hash !== digest) throw fail('REQUEST_CHANGED', 'Handover request key reused.', 409); return row; }
    if (!Number.isInteger(input.revision) || input.revision !== (row?.revision ?? 0)) throw fail('STALE_REVISION', 'Refresh this handover before continuing.', 409);
    const reason = text(input.reason, 1000, true);
    if (action === 'PREPARE') {
      if (row && row.state !== 'PREPARED') throw fail('HANDOVER_LOCKED', 'Released handover scope cannot be replaced.', 409);
      const assignee = mongoose.isValidObjectId(input.assignee) && await AdminUser.findById(input.assignee);
      if (!operational(assignee)) throw fail('INVALID_ASSIGNEE', 'Choose an active operations staff member.');
      if (!Array.isArray(input.tasks) || !input.tasks.length || input.tasks.length > 30 || input.tasks.some(t => !t || typeof t !== 'object')) throw fail('INVALID_TASKS', 'Supply 1–30 handover tasks.');
      const tasks = input.tasks.map(t => { if (t.due && !validDate(t.due)) throw fail('INVALID_TASKS', 'Use a valid task due date.'); return { title: text(t.title, 200, true), due: t.due || '', status: 'OPEN' }; });
      row ||= new ProposalHandover({ proposal: p._id });
      row.assignee = assignee._id; row.snapshotHash = p.snapshotHash; row.pdfHash = p.pdfHash; row.notes = text(input.notes || '', 4000); row.tasks = tasks; row.bindings = [];
    } else {
      if (!row || row.snapshotHash !== p.snapshotHash || row.pdfHash !== p.pdfHash || !operational(await AdminUser.findById(row.assignee))) throw fail('HANDOVER_GATE', 'A current handover and active assignee are required.', 409);
      if (action === 'RELEASE') {
        if (row.state !== 'PREPARED') throw fail('HANDOVER_LOCKED', 'Handover is already released.', 409);
        await validateBindings(p, input.bindings); row.bindings = input.bindings.map(b => ({ lineId: b.lineId, bookingId: b.bookingId, allocatedCharges: b.allocatedCharges ?? 0 })); row.state = 'RELEASED';
      } else {
        if (String(row.assignee) !== String(actor.id)) throw fail('HANDOVER_ASSIGNEE_ONLY', 'Only the assigned operations owner can accept or update this handover.', 403);
        await validateBindings(p, row.bindings);
        if (action === 'ACCEPT' && row.state === 'RELEASED') row.state = 'ACCEPTED';
        else if (action === 'TASK' && row.state === 'ACCEPTED') {
          const task = row.tasks.id(input.taskId); if (!task || !['OPEN', 'DONE', 'BLOCKED'].includes(input.status)) throw fail('INVALID_TASK', 'Choose an existing task and status.');
          task.status = input.status; task.note = reason;
        } else if (action === 'COMPLETE' && row.state === 'ACCEPTED' && row.tasks.every(t => t.status === 'DONE')) row.state = 'COMPLETED';
        else throw fail('HANDOVER_GATE', 'Accept the released handover and finish every task before completion.', 409);
      }
    }
    row.revision++; row.history.push({ actor: String(actor.id), action, reason, key: requestKey, hash: digest }); await lease(); await row.save(); return row;
  });
}
