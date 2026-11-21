import crypto from 'node:crypto';
import { CustomerEvent } from '../customer/models/index.js';
import { notifyCustomer } from '../notifications/notification.service.js';
import { recordBusinessAudit } from '../admin/utils/audit.js';
import { withIdempotency, registerEventHandler } from '../automation/services/dispatcher.service.js';
import { publishOutboxEvent } from '../automation/services/outbox.service.js';
import { EventManifest, Proposal, ProposalVersion, ProposalChangeRequest, ProposalAccessLog } from './models.js';
import { evaluateGate } from './gate.service.js';
import { currentAgreements } from './agreement.service.js';
import { toCustomerSnapshot, snapshotHash } from './snapshot.service.js';
import { approvedVisualsFor } from './assets.service.js';
import { proposalError } from './utils.js';

const CUSTOMER_VISIBLE = ['SENT_TO_CUSTOMER', 'CUSTOMER_VIEWED', 'CHANGE_REQUESTED', 'CUSTOMER_APPROVED', 'CUSTOMER_DECLINED', 'SUPERSEDED'];
const OPEN_FOR_DECISION = ['SENT_TO_CUSTOMER', 'CUSTOMER_VIEWED'];
const REPLACEABLE = ['PRELIMINARY_PREVIEW', 'APPROVED_FOR_GENERATION', 'QUALITY_REVIEW', 'GENERATED', 'SENT_TO_CUSTOMER', 'CUSTOMER_VIEWED', 'CHANGE_REQUESTED', 'FAILED'];

async function ensureProposal(eventId) {
  const existing = await Proposal.findOne({ event: eventId });
  if (existing) return existing;
  const event = await CustomerEvent.findById(eventId).select('customer').lean();
  if (!event) throw proposalError('EVENT_NOT_FOUND', 'Event not found.', 404);
  const number = `PRP-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  try {
    return await Proposal.create({ proposalNumber: number, customer: event.customer, event: eventId });
  } catch (err) {
    if (err?.code === 11000) return Proposal.findOne({ event: eventId });
    throw err;
  }
}

async function nextVersionNumber(proposalId) {
  const updated = await Proposal.findOneAndUpdate({ _id: proposalId }, { $inc: { versionCounter: 1 } }, { new: true });
  return updated.versionCounter;
}

async function moveVersion(version, to, { actor, reason, set = {} }) {
  const from = version.status;
  const updated = await ProposalVersion.findOneAndUpdate(
    { _id: version._id, status: from },
    { $set: { status: to, ...set }, $push: { history: { from, to, by: String(actor), at: new Date(), reason } } },
    { new: true }
  );
  if (!updated) throw proposalError('PROPOSAL_STATE_CHANGED', 'The proposal changed while this action was running. Reload and retry.');
  await recordBusinessAudit({ actorId: String(actor), actorType: 'SYSTEM', action: `PROPOSAL_${to}`, resourceType: 'ProposalVersion', resourceId: String(version._id), referenceId: String(version.event), fromState: from, toState: to, why: reason, source: 'PROPOSAL_STUDIO' });
  return updated;
}

/** Watermarked concept from whatever exists today. No gate; never approvable. */
export async function createPreliminary(eventId, { actor, theme }) {
  const manifest = await EventManifest.findOne({ event: eventId, status: { $in: ['FROZEN', 'DRAFT'] } }).sort({ version: -1 }).lean();
  if (!manifest) throw proposalError('MANIFEST_REQUIRED', 'Build the event manifest before a preliminary preview.');
  const proposal = await ensureProposal(eventId);
  const agreements = await currentAgreements(eventId);
  const approved = agreements.filter((a) => a.status === 'APPROVED');
  const snapshot = toCustomerSnapshot({ manifest, agreements: approved, commercial: null, kind: 'PRELIMINARY', visuals: await approvedVisualsFor(eventId, approved) });
  const version = await ProposalVersion.create({
    proposal: proposal._id, event: eventId, customer: proposal.customer,
    version: await nextVersionNumber(proposal._id), kind: 'PRELIMINARY',
    snapshot, snapshotHash: snapshotHash(snapshot),
    manifest: manifest._id, manifestVersion: manifest.version,
    theme: theme || 'royal-luxury', status: 'PRELIMINARY_PREVIEW',
    history: [{ from: 'NONE', to: 'PRELIMINARY_PREVIEW', by: String(actor), reason: 'Preliminary preview created' }],
    createdBy: String(actor),
  });
  await publishOutboxEvent({
    eventType: 'PROPOSAL_GENERATION_REQUESTED', aggregateType: 'ProposalVersion', aggregateId: String(version._id),
    payload: { versionId: String(version._id) }, idempotencyKey: `proposal-generate-${version._id}`,
  });
  return version;
}

/** Final generation. The gate is re-evaluated here; the UI can never bypass it. */
export async function requestFinalGeneration(eventId, { actor, idempotencyKey, theme }) {
  if (!idempotencyKey) throw proposalError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key header is required.', 400);
  const { result } = await withIdempotency(idempotencyKey, `proposal.generate:${eventId}`, async () => {
    const gate = await evaluateGate(eventId);
    if (!gate.ready) throw proposalError(gate.state, 'Final proposal generation is blocked.', 409, { state: gate.state, reasons: gate.reasons });
    const proposal = await ensureProposal(eventId);
    const snapshot = toCustomerSnapshot({ manifest: gate.manifest, agreements: gate.agreements, commercial: gate.commercial, kind: 'FINAL', visuals: await approvedVisualsFor(eventId, gate.agreements) });
    const version = await ProposalVersion.create({
      proposal: proposal._id, event: eventId, customer: proposal.customer,
      version: await nextVersionNumber(proposal._id), kind: 'FINAL',
      snapshot, snapshotHash: snapshotHash(snapshot),
      manifest: gate.manifest._id, manifestVersion: gate.manifest.version,
      agreementRefs: gate.agreements.map((a) => ({ agreement: a._id, version: a.version, category: a.category })),
      commercialApproval: gate.commercial._id,
      theme: theme || 'royal-luxury', status: 'APPROVED_FOR_GENERATION',
      generation: { idempotencyKey, attempts: 0 },
      history: [{ from: 'NONE', to: 'APPROVED_FOR_GENERATION', by: String(actor), reason: 'Gate passed; snapshot frozen' }],
      createdBy: String(actor),
    });
    await recordBusinessAudit({ actorId: String(actor), actorType: 'ADMIN', action: 'PROPOSAL_SNAPSHOT_FROZEN', resourceType: 'ProposalVersion', resourceId: String(version._id), referenceId: String(eventId), toState: 'APPROVED_FOR_GENERATION', why: 'Approval gate passed', idempotencyKey: `snapshot-${version._id}`, source: 'PROPOSAL_STUDIO' });
    await publishOutboxEvent({
      eventType: 'PROPOSAL_GENERATION_REQUESTED', aggregateType: 'ProposalVersion', aggregateId: String(version._id),
      payload: { versionId: String(version._id) }, idempotencyKey: `proposal-generate-${version._id}`,
    });
    return { versionId: String(version._id), version: version.version };
  });
  return ProposalVersion.findById(result.versionId);
}

/**
 * Called by the renderer once a PDF exists and QA ran. A failed critical QA
 * check leaves the version in QUALITY_REVIEW, which blocks publishing.
 */
export async function recordRenderResult(versionId, { pdf, qa }) {
  const version = await ProposalVersion.findById(versionId);
  if (!version) throw proposalError('PROPOSAL_VERSION_NOT_FOUND', 'Version not found.', 404);
  const to = qa?.passed ? 'GENERATED' : 'QUALITY_REVIEW';
  return moveVersion(version, to, { actor: 'RENDERER', reason: qa?.passed ? 'PDF generated and QA passed' : 'QA found critical issues', set: { pdf, qa: { ...qa, checkedAt: new Date() } } });
}

export async function recordRenderFailure(versionId, error) {
  const version = await ProposalVersion.findById(versionId);
  if (!version) return null;
  return moveVersion(version, 'FAILED', { actor: 'RENDERER', reason: String(error?.message || error).slice(0, 300), set: { 'generation.lastError': String(error?.message || error).slice(0, 500) } });
}

export async function publishVersion(versionId, { actor }) {
  const version = await ProposalVersion.findById(versionId);
  if (!version) throw proposalError('PROPOSAL_VERSION_NOT_FOUND', 'Version not found.', 404);
  if (version.status !== 'GENERATED' || version.qa?.passed !== true) {
    throw proposalError('PROPOSAL_NOT_READY_TO_PUBLISH', 'Only a generated version that passed QA can be sent to the customer.');
  }
  if (version.kind === 'FINAL') {
    const gate = await evaluateGate(version.event);
    if (!gate.ready) throw proposalError(gate.state, 'Approvals changed since generation. Regenerate the proposal.', 409, { state: gate.state, reasons: gate.reasons });
    if (String(gate.manifest._id) !== String(version.manifest) || String(gate.commercial._id) !== String(version.commercialApproval)) {
      throw proposalError('SNAPSHOT_CHANGED', 'The approved data changed since this version was generated. Regenerate it.');
    }
  }
  const proposal = await Proposal.findById(version.proposal);
  const published = await moveVersion(version, 'SENT_TO_CUSTOMER', { actor, reason: 'Published to customer', set: { publishedAt: new Date(), publishedBy: String(actor) } });
  await ProposalVersion.updateMany(
    { proposal: proposal._id, _id: { $ne: version._id }, status: { $in: REPLACEABLE } },
    { $set: { status: 'SUPERSEDED', supersededBy: version.version }, $push: { history: { from: 'OPEN', to: 'SUPERSEDED', by: String(actor), at: new Date(), reason: `Superseded by v${version.version}` } } }
  );
  await ProposalVersion.updateMany({ proposal: proposal._id, status: 'CUSTOMER_APPROVED', _id: { $ne: version._id } }, { $set: { supersededBy: version.version } });
  await Proposal.updateOne({ _id: proposal._id }, { $set: { publishedVersion: version.version } });
  await notifyCustomer({
    customerId: version.customer, eventId: version.event, type: 'proposal', priority: 'HIGH',
    title: version.kind === 'FINAL' ? 'Your event proposal is ready' : 'A preliminary event concept is ready',
    body: version.kind === 'FINAL' ? `Proposal ${proposal.proposalNumber} (version ${version.version}) is ready for your review.` : 'This is a preliminary concept, not a final approved proposal.',
    actionUrl: `/customer/proposals/${proposal._id}`,
    idempotencyKey: `proposal-published-${version._id}`,
  }).catch(() => null);
  return published;
}

// ── Customer side ──────────────────────────────────────────────────────────

export async function listCustomerProposals(customerId) {
  const proposals = await Proposal.find({ customer: customerId, publishedVersion: { $ne: null } }).lean();
  return Promise.all(proposals.map(async (p) => {
    const v = await ProposalVersion.findOne({ proposal: p._id, version: p.publishedVersion }).lean();
    return v ? customerCard(p, v) : null;
  })).then((rows) => rows.filter(Boolean));
}

export function customerCard(p, v) {
  return {
    proposalId: p._id, proposalNumber: p.proposalNumber, eventId: p.event,
    version: v.version, kind: v.kind, status: v.status,
    eventTitle: v.snapshot.event.title || v.snapshot.event.typeLabel, eventDate: v.snapshot.event.date, city: v.snapshot.event.city,
    packageTotal: v.snapshot.budget?.packageTotal ?? null, hasPdf: Boolean(v.pdf?.storageKey),
    updatedAt: v.publishedAt || v.updatedAt, latestApprovedVersion: p.latestApprovedVersion,
  };
}

async function ownedProposal(customerId, proposalId) {
  const proposal = await Proposal.findOne({ _id: proposalId, customer: customerId });
  if (!proposal) throw proposalError('PROPOSAL_NOT_FOUND', 'Proposal not found.', 404);
  return proposal;
}

export async function getCustomerVersion(customerId, proposalId, versionNumber, ctx = {}) {
  const proposal = await ownedProposal(customerId, proposalId);
  const version = await ProposalVersion.findOne({ proposal: proposal._id, version: Number(versionNumber) || proposal.publishedVersion });
  if (!version || !CUSTOMER_VISIBLE.includes(version.status)) throw proposalError('PROPOSAL_NOT_FOUND', 'Proposal not found.', 404);
  if (version.status === 'SENT_TO_CUSTOMER') await moveVersion(version, 'CUSTOMER_VIEWED', { actor: customerId, reason: 'Customer opened proposal', set: { viewedAt: new Date() } });
  await ProposalAccessLog.create({ proposal: proposal._id, version: version.version, actorType: 'customer', actorId: String(customerId), action: 'VIEW', ip: ctx.ip, userAgent: ctx.userAgent });
  const fresh = await ProposalVersion.findById(version._id).lean();
  const history = await ProposalVersion.find({ proposal: proposal._id, status: { $in: CUSTOMER_VISIBLE } }).select('version kind status publishedAt customerDecision').sort({ version: -1 }).lean();
  return {
    proposalId: proposal._id, proposalNumber: proposal.proposalNumber,
    version: fresh.version, kind: fresh.kind, status: fresh.status, isCurrent: fresh.version === proposal.publishedVersion,
    canDecide: fresh.kind === 'FINAL' && fresh.version === proposal.publishedVersion && OPEN_FOR_DECISION.includes(fresh.status),
    snapshot: fresh.snapshot, snapshotHash: fresh.snapshotHash, theme: fresh.theme,
    hasPdf: Boolean(fresh.pdf?.storageKey), customerDecision: fresh.customerDecision?.decision ? fresh.customerDecision : null,
    history: history.map((h) => ({ version: h.version, kind: h.kind, status: h.status, publishedAt: h.publishedAt, decision: h.customerDecision?.decision || null })),
  };
}

/** Approval is bound to the exact version + snapshot hash. It never books or charges. */
export async function decideAsCustomer(customerId, proposalId, versionNumber, { decision, snapshotHash: hash, reason = '' }, ctx = {}) {
  const proposal = await ownedProposal(customerId, proposalId);
  const version = await ProposalVersion.findOne({ proposal: proposal._id, version: Number(versionNumber) });
  if (!version) throw proposalError('PROPOSAL_NOT_FOUND', 'Proposal not found.', 404);
  if (version.kind !== 'FINAL') throw proposalError('PRELIMINARY_NOT_APPROVABLE', 'A preliminary concept cannot be approved.');
  if (version.version !== proposal.publishedVersion) throw proposalError('PROPOSAL_VERSION_NOT_CURRENT', 'A newer version of this proposal exists. Review the latest version.');
  if (!OPEN_FOR_DECISION.includes(version.status)) throw proposalError('PROPOSAL_NOT_OPEN_FOR_DECISION', 'This version is not awaiting your decision.');
  if (!hash || hash !== version.snapshotHash) throw proposalError('PROPOSAL_CONTENT_MISMATCH', 'The proposal you reviewed differs from the current version. Reload and review again.');
  const to = { APPROVE: 'CUSTOMER_APPROVED', DECLINE: 'CUSTOMER_DECLINED' }[decision];
  if (!to) throw proposalError('INVALID_DECISION', 'Decision must be APPROVE or DECLINE.', 400);

  const decided = await moveVersion(version, to, {
    actor: customerId, reason: decision === 'APPROVE' ? 'Customer approved this exact version' : `Customer declined: ${reason}`,
    set: { customerDecision: { decision, by: customerId, at: new Date(), ip: ctx.ip, userAgent: ctx.userAgent, reason: String(reason).slice(0, 500) } },
  });
  if (decision === 'APPROVE') await Proposal.updateOne({ _id: proposal._id }, { $set: { latestApprovedVersion: version.version } });
  await publishOutboxEvent({
    eventType: decision === 'APPROVE' ? 'PROPOSAL_APPROVED' : 'PROPOSAL_DECLINED', aggregateType: 'ProposalVersion', aggregateId: String(version._id),
    payload: { proposalId: String(proposal._id), version: version.version, eventId: String(version.event), customerId: String(customerId) },
    idempotencyKey: `proposal-${decision.toLowerCase()}-${version._id}`,
  });
  return decided;
}

export async function raiseChangeRequest(customerId, proposalId, versionNumber, { items = [], message = '' }, { raisedBy = 'customer' } = {}) {
  const proposal = await ownedProposal(customerId, proposalId);
  const version = await ProposalVersion.findOne({ proposal: proposal._id, version: Number(versionNumber) });
  if (!version || !CUSTOMER_VISIBLE.includes(version.status)) throw proposalError('PROPOSAL_NOT_FOUND', 'Proposal not found.', 404);
  const cleanItems = (Array.isArray(items) ? items : []).slice(0, 20).map((i) => ({
    category: String(i.category || '').slice(0, 60), type: ['add', 'remove', 'modify'].includes(i.type) ? i.type : 'modify', request: String(i.request || '').slice(0, 1000),
  })).filter((i) => i.request);
  if (!cleanItems.length && !String(message).trim()) throw proposalError('CHANGE_REQUEST_EMPTY', 'Describe the change you would like.', 400);
  const cr = await ProposalChangeRequest.create({
    proposal: proposal._id, version: version.version, event: version.event, customer: customerId,
    raisedBy: { type: raisedBy, id: String(customerId) }, items: cleanItems, message: String(message).slice(0, 2000),
    history: [{ from: 'NONE', to: 'OPEN', by: String(customerId), reason: 'Change requested' }],
  });
  if (OPEN_FOR_DECISION.includes(version.status)) await moveVersion(version, 'CHANGE_REQUESTED', { actor: customerId, reason: 'Customer requested changes' });
  await publishOutboxEvent({ eventType: 'PROPOSAL_CHANGE_REQUESTED', aggregateType: 'ProposalChangeRequest', aggregateId: String(cr._id), payload: { changeRequestId: String(cr._id), proposalId: String(proposal._id) }, idempotencyKey: `proposal-change-${cr._id}` });
  return cr;
}

export async function customerVisibleVersion(customerId, proposalId, versionNumber) {
  const proposal = await Proposal.findOne({ _id: proposalId, customer: customerId }).lean();
  const version = proposal && await ProposalVersion.findOne({ proposal: proposal._id, version: Number(versionNumber) }).lean();
  if (!version || !CUSTOMER_VISIBLE.includes(version.status)) throw proposalError('PROPOSAL_NOT_FOUND', 'Proposal not found.', 404);
  return { proposal, version };
}

export async function customerPdfVersion(customerId, proposalId, versionNumber) {
  const proposal = await Proposal.findOne({ _id: proposalId, customer: customerId }).lean();
  const version = proposal && await ProposalVersion.findOne({ proposal: proposal._id, version: Number(versionNumber) }).lean();
  if (!version || !CUSTOMER_VISIBLE.includes(version.status) || !version.pdf?.storageKey) {
    if (proposal) await ProposalAccessLog.create({ proposal: proposal._id, version: Number(versionNumber) || null, actorType: 'customer', actorId: String(customerId), action: 'DENIED' });
    throw proposalError('PDF_NOT_FOUND', 'Document not found.', 404);
  }
  return { proposal, version };
}

export async function logAccess(entry) {
  await ProposalAccessLog.create(entry);
}

// Outbox handlers. PROPOSAL_APPROVED deliberately has no booking/payment side effect:
// booking stays with the existing Core commerce flow.
registerEventHandler('PROPOSAL_APPROVED', async (payload) => ({ handled: true, bookingCreated: false, ...payload }));
registerEventHandler('PROPOSAL_DECLINED', async (payload) => ({ handled: true, ...payload }));
registerEventHandler('PROPOSAL_CHANGE_REQUESTED', async (payload) => ({ handled: true, ...payload }));
registerEventHandler('PROPOSAL_GENERATION_REQUESTED', async ({ versionId }) => {
  const { renderProposalVersion } = await import('./render.service.js');
  return renderProposalVersion(versionId);
});
