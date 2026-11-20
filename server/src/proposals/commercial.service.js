import { getCommercialPolicyForCategory } from '../common/policyResolver.js';
import { recordBusinessAudit } from '../admin/utils/audit.js';
import { CommercialApproval } from './models.js';
import { currentFrozenManifest } from './manifest.service.js';
import { agreementIsValid, currentAgreements } from './agreement.service.js';
import { hashOf, proposalError, rupees } from './utils.js';

const COST_FIELDS = ['directCosts', 'logistics', 'operational', 'contingency', 'margin'];

/** Default schedule from the approved commercial policy: advance + balance. Never hard-coded. */
export async function defaultPaymentSchedule(packageTotal, category = 'Global') {
  const policy = await getCommercialPolicyForCategory(category);
  const advancePct = Number(policy?.minimumReservationPercent);
  if (!policy?.policyActive || !Number.isFinite(advancePct)) return [];
  const advance = rupees(packageTotal * advancePct / 100);
  return [
    { label: 'Booking confirmation', percent: advancePct, amount: advance, dueRule: 'On booking confirmation' },
    { label: 'Balance before event execution', percent: 100 - advancePct, amount: packageTotal - advance, dueRule: 'Before event execution' },
  ];
}

export function reconciliation(customerFacing) {
  const total = rupees(customerFacing?.packageTotal);
  const allocated = (customerFacing?.allocations || []).reduce((s, a) => s + rupees(a.amount), 0);
  const unallocated = rupees(customerFacing?.unallocated?.amount);
  const scheduled = (customerFacing?.paymentSchedule || []).reduce((s, p) => s + rupees(p.amount), 0);
  const problems = [];
  if (total <= 0) problems.push('Package total must be positive.');
  if (allocated + unallocated !== total) problems.push(`Allocations (${allocated}) + unallocated (${unallocated}) must equal package total (${total}).`);
  if (unallocated > 0 && !String(customerFacing?.unallocated?.explanation || '').trim()) problems.push('Unallocated amount needs a customer-facing explanation.');
  if (!customerFacing?.paymentSchedule?.length) problems.push('A payment schedule is required.');
  else if (scheduled !== total) problems.push(`Payment schedule (${scheduled}) must equal package total (${total}).`);
  return { ok: problems.length === 0, total, allocated, unallocated, scheduled, problems };
}

function normalizeCustomerFacing(input = {}) {
  const list = (v) => (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean);
  return {
    currency: 'INR',
    packageTotal: rupees(input.packageTotal),
    taxes: { included: input.taxes?.included !== false, amount: rupees(input.taxes?.amount), note: String(input.taxes?.note || '') },
    allocations: (input.allocations || []).map((a) => ({
      category: String(a.category || ''), label: String(a.label || a.category || ''), scopeSummary: String(a.scopeSummary || ''),
      quantity: String(a.quantity ?? ''), amount: rupees(a.amount), deliverables: list(a.deliverables), exclusions: list(a.exclusions),
    })),
    unallocated: { amount: rupees(input.unallocated?.amount), explanation: String(input.unallocated?.explanation || '') },
    paymentSchedule: (input.paymentSchedule || []).map((p) => ({ label: String(p.label || ''), percent: Number(p.percent) || 0, amount: rupees(p.amount), dueRule: String(p.dueRule || '') })),
    exclusions: list(input.exclusions),
    notes: list(input.notes),
    terms: {
      cancellation: String(input.terms?.cancellation || ''),
      postponement: String(input.terms?.postponement || ''),
      scopeChange: String(input.terms?.scopeChange || ''),
      customerResponsibilities: list(input.terms?.customerResponsibilities),
    },
  };
}

const contentOf = (doc) => ({ manifestHash: doc.manifestHash, agreementRefs: doc.agreementRefs, costs: doc.costs, customerFacing: doc.customerFacing });

/** Maker step. Uses the current frozen manifest and the currently approved agreements. */
export async function prepareCommercialApproval(eventId, { costs = {}, customerFacing = {} }, admin) {
  const manifest = await currentFrozenManifest(eventId);
  if (!manifest) throw proposalError('MANIFEST_NOT_FROZEN', 'Freeze the event manifest first.');
  const agreements = (await currentAgreements(eventId)).filter((a) => agreementIsValid(a));
  if (!agreements.length) throw proposalError('NO_APPROVED_AGREEMENTS', 'At least one approved vendor agreement is required.');

  const vendorTotal = agreements.reduce((s, a) => s + rupees(a.pricing?.total), 0);
  const normalizedCosts = { vendorTotal, ...Object.fromEntries(COST_FIELDS.map((f) => [f, rupees(costs[f])])) };
  const facing = normalizeCustomerFacing(customerFacing);
  if (!facing.packageTotal) facing.packageTotal = Object.values(normalizedCosts).reduce((s, n) => s + n, 0);
  if (!facing.paymentSchedule.length) facing.paymentSchedule = await defaultPaymentSchedule(facing.packageTotal);
  const check = reconciliation(facing);
  if (!check.ok) throw proposalError('PRICING_MISMATCH', 'Customer-facing pricing does not reconcile.', 400, { problems: check.problems });

  const doc = {
    event: manifest.event,
    customerId: manifest.customer,
    manifest: manifest._id,
    manifestVersion: manifest.version,
    manifestHash: manifest.contentHash,
    agreementRefs: agreements.map((a) => ({ agreement: a._id, version: a.version, category: a.category, total: rupees(a.pricing?.total) })),
    costs: normalizedCosts,
    customerFacing: facing,
  };
  const approval = await CommercialApproval.create({ ...doc, contentHash: hashOf(contentOf(doc)), createdBy: admin._id, createdByEmail: admin.email });
  await recordBusinessAudit({ actorId: String(admin._id), actorType: 'ADMIN', action: 'COMMERCIAL_PREPARED', resourceType: 'CommercialApproval', resourceId: String(approval._id), referenceId: String(eventId), toState: 'DRAFT', why: 'Commercial record prepared', source: 'PROPOSAL_STUDIO' });
  return approval;
}

export async function submitCommercialApproval(id, admin) {
  const approval = await CommercialApproval.findById(id);
  if (!approval) throw proposalError('COMMERCIAL_NOT_FOUND', 'Commercial record not found.', 404);
  if (approval.status !== 'DRAFT') throw proposalError('COMMERCIAL_NOT_DRAFT', 'Only a draft can be submitted.');
  const updated = await CommercialApproval.findOneAndUpdate(
    { _id: id, status: 'DRAFT' },
    { $set: { status: 'PENDING_APPROVAL', submittedAt: new Date(), submittedHash: approval.contentHash } },
    { new: true }
  );
  await recordBusinessAudit({ actorId: String(admin._id), actorType: 'ADMIN', action: 'COMMERCIAL_SUBMITTED', resourceType: 'CommercialApproval', resourceId: String(id), referenceId: String(approval.event), fromState: 'DRAFT', toState: 'PENDING_APPROVAL', why: 'Submitted for checker approval', source: 'PROPOSAL_STUDIO' });
  return updated;
}

export async function decideCommercialApproval(id, { decision, reason = '' }, admin) {
  const approval = await CommercialApproval.findById(id);
  if (!approval) throw proposalError('COMMERCIAL_NOT_FOUND', 'Commercial record not found.', 404);
  if (approval.status !== 'PENDING_APPROVAL') throw proposalError('COMMERCIAL_NOT_PENDING', 'This record is not awaiting approval.');
  if (String(approval.createdBy) === String(admin._id)) throw proposalError('MAKER_CHECKER_REQUIRED', 'A different admin must approve this commercial record.', 403);

  if (decision === 'REJECT') {
    if (!String(reason).trim()) throw proposalError('REJECTION_REASON_REQUIRED', 'A rejection reason is required.', 400);
    const rejected = await CommercialApproval.findOneAndUpdate(
      { _id: id, status: 'PENDING_APPROVAL' },
      { $set: { status: 'REJECTED', rejectedBy: admin._id, decisionReason: String(reason).slice(0, 500) } },
      { new: true }
    );
    await recordBusinessAudit({ actorId: String(admin._id), actorType: 'ADMIN', action: 'COMMERCIAL_REJECTED', resourceType: 'CommercialApproval', resourceId: String(id), referenceId: String(approval.event), fromState: 'PENDING_APPROVAL', toState: 'REJECTED', why: reason, source: 'PROPOSAL_STUDIO' });
    return rejected;
  }
  if (decision !== 'APPROVE') throw proposalError('INVALID_DECISION', 'Decision must be APPROVE or REJECT.', 400);

  if (hashOf(contentOf(approval)) !== approval.submittedHash) throw proposalError('COMMERCIAL_CONTENT_CHANGED', 'The record changed after submission.');
  const manifest = await currentFrozenManifest(approval.event);
  if (!manifest || String(manifest._id) !== String(approval.manifest)) throw proposalError('SNAPSHOT_CHANGED', 'The event manifest changed after this record was prepared.');
  const valid = new Map((await currentAgreements(approval.event)).filter((a) => agreementIsValid(a)).map((a) => [String(a._id), a]));
  if (approval.agreementRefs.some((r) => valid.get(String(r.agreement))?.version !== r.version)) {
    throw proposalError('SNAPSHOT_CHANGED', 'A referenced vendor agreement is no longer approved or has been revised.');
  }

  const now = new Date();
  const approved = await CommercialApproval.findOneAndUpdate(
    { _id: id, status: 'PENDING_APPROVAL' },
    { $set: { status: 'APPROVED', approvedBy: admin._id, approvedByEmail: admin.email, approvedAt: now, decisionReason: String(reason).slice(0, 500) } },
    { new: true }
  );
  await CommercialApproval.updateMany({ event: approval.event, status: 'APPROVED', _id: { $ne: approval._id } }, { $set: { status: 'SUPERSEDED', supersededBy: approval._id } });
  await recordBusinessAudit({ actorId: String(admin._id), actorType: 'ADMIN', action: 'COMMERCIAL_APPROVED', resourceType: 'CommercialApproval', resourceId: String(id), referenceId: String(approval.event), fromState: 'PENDING_APPROVAL', toState: 'APPROVED', why: reason || 'Commercial approval granted', authority: 'commercial.approve', source: 'PROPOSAL_STUDIO' });
  return approved;
}

export function currentCommercialApproval(eventId) {
  return CommercialApproval.findOne({ event: eventId, status: 'APPROVED' }).sort({ approvedAt: -1 }).lean();
}
