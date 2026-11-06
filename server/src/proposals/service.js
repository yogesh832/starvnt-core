import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { EventProposal } from './models.js';
import { CustomerEvent, EventRequirement } from '../customer/models/index.js';
import { ExternalUser } from '../external/models/ExternalUser.js';
import { VendorService } from '../external/models/VendorService.js';
import { VendorOrganization } from '../external/models/VendorOrganization.js';
import { validDate } from '../common/scheduleRules.js';
import { foundationError as fail } from '../foundation/consent.service.js';
import { withVendorSchedule } from '../external/services/scheduleLock.js';
export const hash = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export function text(value, max = 2000, required = false) { if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw fail('INVALID_PROPOSAL', 'Enter valid proposal text.'); return value.trim(); }
export function money(value) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e9 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-5) throw fail('INVALID_MONEY', 'Use nonnegative amounts with at most two decimals.'); return value; }
const cents = value => Math.round(value * 100);
export function readiness(p, now = new Date()) {
  const missing = [], m = p.manifest;
  if (!m?.title || !m?.eventType || !validDate(m?.eventDate) || !m?.city || !Number.isInteger(m?.guestCount) || m.guestCount < 1) missing.push('Validated event title, type, date, city and guest count');
  if (!p.lines?.length) missing.push('Approved service scope');
  if (m?.requirements?.some(r => !p.lines?.some(l => String(l.requirement) === String(r._id)) && !p.excludedRequirements?.some(x => String(x.requirement) === String(r._id) && x.reason?.trim()))) missing.push('Every confirmed requirement must have a scope line or explicit exclusion');
  if (p.excludedRequirements?.some(x => p.lines?.some(l => String(l.requirement) === String(x.requirement)))) missing.push('A requirement cannot be both included and excluded');
  if (p.lines?.some(l => l.fulfilment === 'VENDOR' && (l.agreement?.status !== 'APPROVED' || !l.agreement?.actor || !l.agreement.validUntil || new Date(l.agreement.validUntil) <= now))) missing.push('Valid vendor agreements for every applicable line');
  if (p.lines?.some(l => !Number.isInteger(l.quantity) || l.quantity < 1 || !Number.isFinite(l.customerUnitPrice) || l.customerUnitPrice < 0)) missing.push('Valid scope quantities and prices');
  const total = (p.lines || []).reduce((sum, l) => sum + cents(l.customerUnitPrice) * l.quantity, 0) + cents(p.taxAmount || 0);
  if (cents(p.totalAmount || 0) !== total || !total) missing.push('Reconciled customer pricing');
  if (!p.terms?.trim() || !p.payments?.length || p.payments.reduce((sum, row) => sum + cents(row.amount), 0) !== total || p.payments.some(row => !validDate(row.due))) missing.push('Commercial terms and reconciled payment schedule');
  return { ready: missing.length === 0, missing };
}
export async function snapshotEvent(eventId) {
  const event = mongoose.isValidObjectId(eventId) && await CustomerEvent.findById(eventId).lean();
  if (!event || ['completed', 'cancelled'].includes(event.status)) throw fail('EVENT_NOT_FOUND', 'An active saved event is required.', 404);
  const customer = await ExternalUser.findById(event.customer).select('fullName status accountType').lean();
  if (!customer || customer.status !== 'ACTIVE' || customer.accountType !== 'CUSTOMER') throw fail('CUSTOMER_UNAVAILABLE', 'Customer is unavailable.', 409);
  const requirements = await EventRequirement.find({ event: event._id, status: { $in: ['CONFIRMED', 'confirmed', 'booked', 'completed'] } }).sort({ category: 1, _id: 1 }).select('_id category providedValue specialRequirements serviceLocation').lean();
  return { customer: event.customer, manifest: { title: event.title || '', eventType: event.eventType, eventDate: event.eventDate, city: event.city, guestCount: event.guestCount, customerName: customer.fullName, venue: event.location?.venueName || '', address: event.location?.address || '', notes: event.notes || '', specialRequirements: event.specialRequirements || '', requirements } };
}
export async function validateSuppliers(p) {
  for (const line of p.lines.filter(l => l.fulfilment === 'VENDOR')) {
    const service = await VendorService.findOne({ _id: line.service, vendor: line.vendor, status: 'ACTIVE' }).lean();
    const vendor = await VendorOrganization.findOne({ _id: line.vendor, status: 'ACTIVE', isCommerciallyActive: true }).select('owner').lean();
    const owner = vendor && await ExternalUser.findOne({ _id: vendor.owner, accountType: 'VENDOR', status: 'ACTIVE' }).select('_id').lean();
    if (!service || !owner || String(owner._id) !== line.agreement?.actor) throw fail('SUPPLIER_UNAVAILABLE', 'A supplier/service is no longer active, or its authorized agreement owner changed. Refresh the scope and agreement.', 409);
  }
}
export async function createProposal(eventId, actor, input, from = null) {
  if (typeof eventId !== 'string' || !mongoose.isValidObjectId(eventId) || (from !== null && (typeof from !== 'string' || !mongoose.isValidObjectId(from)))) throw fail('INVALID_PROPOSAL', 'Choose a valid saved event and source version.');
  const key = text(input.idempotencyKey, 160, true), requestHash = hash({ eventId, from });
  return withVendorSchedule(`PROPOSAL_EVENT:${eventId}`, async assertLease => {
    const replay = await EventProposal.findOne({ event: eventId, requestKey: key });
    if (replay) { if (replay.requestHash !== requestHash) throw fail('REQUEST_CHANGED', 'Request key reused.', 409); return replay; }
    const saved = await snapshotEvent(eventId), latest = await EventProposal.findOne({ event: eventId }).sort({ version: -1 });
    let fields = {};
    if (from) { const old = await EventProposal.findOne({ _id: from, event: eventId }); if (!old) throw fail('PROPOSAL_NOT_FOUND', 'Proposal unavailable.', 404); fields = { lines: old.lines.map(l => ({ name: l.name, description: l.description, quantity: l.quantity, customerUnitPrice: l.customerUnitPrice, vendorUnitCost: l.vendorUnitCost, fulfilment: l.fulfilment, vendor: l.vendor, service: l.service, requirement: l.requirement, agreement: { status: 'PENDING' } })), taxAmount: old.taxAmount, totalAmount: old.totalAmount, terms: old.terms, exclusions: old.exclusions, payments: old.payments, sections: old.sections, visuals: old.visuals, excludedRequirements: old.excludedRequirements }; }
    await assertLease(); return EventProposal.create({ event: eventId, ...saved, ...fields, version: (latest?.version || 0) + 1, requestKey: key, requestHash, history: [{ actor: String(actor), action: 'CREATED', key, hash: requestHash }] });
  });
}
export async function editProposal(id, actor, input) {
  return withVendorSchedule(`PROPOSAL:${id}`, async assertLease => {
    const p = await EventProposal.findById(id); if (!p) throw fail('PROPOSAL_NOT_FOUND', 'Proposal unavailable.', 404);
    const key = text(input.idempotencyKey, 160, true), digest = hash(input), replay = p.history.find(h => h.key === key);
    if (replay) { if (replay.hash !== digest) throw fail('REQUEST_CHANGED', 'Request key reused.', 409); return p; }
    if (p.state !== 'DRAFT' || input.revision !== p.revision) throw fail('PROPOSAL_LOCKED', 'Refresh the draft, or create a new proposal version.', 409);
    if (!Array.isArray(input.lines) || input.lines.length > 60 || !Array.isArray(input.payments) || input.payments.length > 12 || !Array.isArray(input.sections) || input.sections.length > 20) throw fail('INVALID_PROPOSAL', 'Proposal contains too many or invalid sections.');
    if ([...input.lines, ...input.payments, ...input.sections].some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw fail('INVALID_PROPOSAL', 'Each scope, payment and section must be a valid object.');
    const saved = await snapshotEvent(p.event), lines = [];
    const validRequirement = value => !value || saved.manifest.requirements.some(r => String(r._id) === String(value));
    for (const l of input.lines) {
      if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 100000 || !['VENDOR', 'INTERNAL'].includes(l.fulfilment)) throw fail('INVALID_SCOPE', 'Choose fulfilment and a whole quantity.');
      let vendor = null, service = null;
      if (l.fulfilment === 'VENDOR') { const s = mongoose.isValidObjectId(l.service) && await VendorService.findOne({ _id: l.service, status: 'ACTIVE' }).lean(); if (!s || !await VendorOrganization.exists({ _id: s.vendor })) throw fail('SERVICE_UNAVAILABLE', 'An active saved vendor service is required.'); vendor = s.vendor; service = s._id; }
      if (!validRequirement(l.requirement)) throw fail('INVALID_REQUIREMENT', 'Link scope only to a confirmed requirement from this event.');
      lines.push({ name: text(l.name, 160, true), description: text(l.description || '', 3000), quantity: l.quantity, customerUnitPrice: money(l.customerUnitPrice), vendorUnitCost: money(l.vendorUnitCost ?? 0), fulfilment: l.fulfilment, vendor, service, requirement: l.requirement || null, agreement: { status: 'PENDING' } });
    }
    if (input.excludedRequirements !== undefined && (!Array.isArray(input.excludedRequirements) || input.excludedRequirements.length > 60 || input.excludedRequirements.some(x => !x || typeof x !== 'object' || Array.isArray(x)))) throw fail('INVALID_REQUIREMENT', 'Use at most 60 valid explicit requirement exclusions.');
    p.excludedRequirements = (input.excludedRequirements || []).map(x => { if (!x.requirement || !validRequirement(x.requirement)) throw fail('INVALID_REQUIREMENT', 'Exclude only a confirmed requirement from this event.'); return { requirement: x.requirement, reason: text(x.reason, 1000, true) }; });
    p.manifest = saved.manifest; p.lines = lines; p.taxAmount = money(input.taxAmount); p.totalAmount = money(input.totalAmount); p.terms = text(input.terms || '', 6000); p.exclusions = text(input.exclusions || '', 4000);
    p.payments = input.payments.map(row => ({ label: text(row.label, 100, true), amount: money(row.amount), due: text(row.due, 10, true) }));
    p.sections = input.sections.map(row => ({ title: text(row.title, 100, true), body: text(row.body, 6000, true) })); p.revision++; p.history.push({ actor: String(actor), action: 'DRAFT_EDITED_APPROVALS_RESET', key, hash: digest });
    await assertLease(); await p.save(); return p;
  });
}
export function customerDTO(p) {
  const snap = p.frozenSnapshot;
  return { _id: p._id, event: p.event, version: p.version, state: p.state, snapshotHash: p.snapshotHash, pdfHash: p.pdfHash, manifest: snap?.manifest, lines: snap?.lines?.map(l => ({ name: l.name, description: l.description, quantity: l.quantity, customerUnitPrice: l.customerUnitPrice, requirement: l.requirement })), excludedRequirements: snap?.excludedRequirements, totalAmount: snap?.totalAmount, taxAmount: snap?.taxAmount, terms: snap?.terms, exclusions: snap?.exclusions, payments: snap?.payments, sections: snap?.sections, response: p.response };
}
// Serialize decisions across versions of one event as well as within a version.
// Sending v2, approving v1 and releasing v1's handover cannot pass their
// latest-version checks concurrently. Draft edits/messages take only the row lock.
export async function withProposalDecision(id, work) {
  const p = mongoose.isValidObjectId(id) && await EventProposal.findById(id).select('event');
  if (!p) throw fail('PROPOSAL_NOT_FOUND', 'Proposal unavailable.', 404);
  return withVendorSchedule(`PROPOSAL_EVENT:${p.event}`, eventLease => withVendorSchedule(`PROPOSAL:${id}`, rowLease => work(async () => { await eventLease(); await rowLease(); })));
}
export async function transition(id, actor, input, action, vendor = null) {
  return withProposalDecision(id, async assertLease => {
    const p = await EventProposal.findById(id); if (!p) throw fail('PROPOSAL_NOT_FOUND', 'Proposal unavailable.', 404);
    const key = text(input.idempotencyKey, 160, true), digest = hash({ action, ...input }), prior = p.history.find(h => h.key === key);
    if (prior) { if (prior.hash !== digest) throw fail('REQUEST_CHANGED', 'Request key reused.', 409); return p; }
    if (!Number.isInteger(input.revision) || p.revision !== input.revision) throw fail('STALE_REVISION', 'Proposal changed. Refresh before continuing.', 409);
    text(input.reason, 1000, true);
    if (action !== 'AGREEMENT' && p.state !== 'DRAFT' && (p.snapshotHash !== hash(p.frozenSnapshot) || p.commercialApproval?.snapshotHash !== p.snapshotHash)) throw fail('SNAPSHOT_CHANGED', 'Approved snapshot integrity failed.', 409);
    if (action === 'AGREEMENT') {
      if (p.state !== 'DRAFT') throw fail('PROPOSAL_LOCKED', 'A frozen scope cannot be changed.', 409);
      const line = p.lines.id(input.lineId); if (!line || String(line.vendor) !== String(vendor)) throw fail('AGREEMENT_NOT_FOUND', 'Agreement unavailable.', 404);
      const validUntil = new Date(input.validUntil); if (!['APPROVED', 'DECLINED'].includes(input.decision) || (input.decision === 'APPROVED' && (!Number.isFinite(validUntil.getTime()) || validUntil <= new Date()))) throw fail('INVALID_AGREEMENT', 'Choose a decision and future validity date.');
      line.agreement = { status: input.decision, actor: String(actor), at: new Date(), validUntil: input.decision === 'APPROVED' ? validUntil : null, reason: text(input.reason, 1000, true) };
    } else if (action === 'FREEZE') {
      const current = await snapshotEvent(p.event);
      if (hash(current.manifest) !== hash(p.manifest) || String(current.customer) !== String(p.customer)) throw fail('EVENT_CHANGED', 'The saved event changed. Save the draft again before approval.', 409);
      const ready = readiness(p); if (p.state !== 'DRAFT' || !ready.ready) throw fail('PROPOSAL_NOT_READY', ready.missing.join('; ') || 'Proposal already frozen.', 409);
      await validateSuppliers(p);
      const snapshot = { manifest: p.manifest, lines: p.lines.toObject(), totalAmount: p.totalAmount, taxAmount: p.taxAmount, payments: p.payments.toObject(), terms: p.terms, exclusions: p.exclusions, sections: p.sections.toObject(), visuals: p.visuals.toObject(), excludedRequirements: p.excludedRequirements.toObject() };
      p.frozenSnapshot = snapshot; p.snapshotHash = hash(snapshot); p.commercialApproval = { actor: String(actor), at: new Date(), snapshotHash: p.snapshotHash }; p.state = 'FROZEN';
    } else if (action === 'QUALITY') {
      if (p.state !== 'FROZEN' || !p.pdfHash || input.pdfHash !== p.pdfHash || !readiness(p).ready) throw fail('QUALITY_GATE', 'Generate and review the exact current PDF before approving.', 409);
      await validateSuppliers(p);
      p.qualityApproval = { actor: String(actor), at: new Date(), pdfHash: p.pdfHash }; p.state = 'APPROVED';
    } else if (action === 'SEND') {
      const current = await snapshotEvent(p.event);
      if (hash(current.manifest) !== hash(p.manifest)) throw fail('EVENT_CHANGED', 'Create a new proposal version for the changed event.', 409);
      await validateSuppliers(p);
      if (p.state !== 'APPROVED' || p.qualityApproval?.pdfHash !== p.pdfHash || !readiness(p).ready) throw fail('SEND_GATE', 'An approved current PDF and valid agreements are required.', 409); p.state = 'SENT';
    } else throw fail('INVALID_ACTION', 'Unsupported proposal action.');
    p.revision++; p.history.push({ actor: String(actor), action, key, hash: digest, reason: text(input.reason || '', 1000) }); await assertLease(); await p.save(); return p;
  });
}
