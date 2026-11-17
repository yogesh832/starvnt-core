import { CoreBooking } from '../models/CoreBooking.js';
import { VendorFinancialProfile } from '../../external/models/VendorFinancialProfile.js';
import { runBookingCommand, requireCoreActor, workflowError, hasOpenDisputes, evidenceFiles, authorizeEvidenceFiles, requestHash } from './bookingWorkflow.service.js';
import { assertCompletionEvidence } from './executionSettlement.service.js';
import { AdminUser } from '../models/AdminUser.js';
import mongoose from 'mongoose';

const DECISIONS = ['SERVICE_ACCEPTED', 'VENDOR_SETTLEMENT', 'PARTIAL_SETTLEMENT', 'REFUND', 'PARTIAL_REFUND', 'REPLACEMENT', 'OTHER_REMEDY'];
export function caseProjection(booking, actor) {
  const own = actor?.type === 'ADMIN' || (actor?.type === 'CUSTOMER' && String(booking.customerId) === String(actor.id)) ||
    (actor?.type === 'VENDOR' && String(booking.vendorId) === String(actor.vendorId));
  if (!own) throw workflowError('BOOKING_ACCESS_DENIED', 'This case is not available to this account.', 403);
  return { bookingId: String(booking._id), version: booking.workflowVersion || 0, protectionStatus: booking.protectionStatus,
    cases: booking.disputes.map(item => ({ id: String(item._id), reportedBy: item.reportedBy, reportedAt: item.reportedAt,
      issueType: item.issueType, description: item.description, status: item.status, evidence: actor.type === 'VENDOR' ? item.evidence.filter(entry => entry.actor === actor.id) : item.evidence,
      response: item.response, proposal: item.proposal, resolution: item.resolution, assignedTo: item.assignedTo, history: item.history })) };
}

export async function reportIssue(bookingId, input = {}, explicitActor) {
  const actor = explicitActor || { id: String(input.actorId || input.customerId || input.vendorId || ''), type: input.reportedBy,
    vendorId: input.vendorId };
  const description = String(input.description || '').trim();
  if (!description || description.length > 4000) throw workflowError('ISSUE_DESCRIPTION_REQUIRED', 'Describe the issue in up to 4000 characters.');
  return runBookingCommand(bookingId, { actor, action: 'ISSUE_REPORTED', input, key: input.idempotencyKey, expectedVersion: input.expectedVersion }, async booking => {
    const files = evidenceFiles(input.evidence || []);
    await authorizeEvidenceFiles(files, booking, actor, 'CASE_EVIDENCE');
    booking.disputes.push({ reportedBy: actor.type === 'ADMIN' ? 'SYSTEM' : actor.type, actorId: actor.id,
      requestKey: input.idempotencyKey, requestHash: requestHash(input), issueType: String(input.issueType || 'SERVICE_FAILURE').slice(0, 80),
      description, status: 'UNDER_REVIEW', evidence: [{ actor: actor.id, actorType: actor.type, at: new Date(), note: description, files }],
      history: [{ actor: actor.id, at: new Date(), action: 'ISSUE_REPORTED', reason: description }] });
    booking.protectionStatus = 'UNDER_REVIEW';
    if (booking.settlementStatus !== 'SETTLED') booking.settlementStatus = 'SETTLEMENT_HOLD';
  });
}

export async function updateCase(bookingId, caseId, input, actor) {
  return runBookingCommand(bookingId, { actor, action: `CASE_${input.action}`, input: { ...input, caseId }, key: input.idempotencyKey, expectedVersion: input.expectedVersion }, async booking => {
    const dispute = booking.disputes.id(caseId);
    if (!dispute) throw workflowError('DISPUTE_NOT_FOUND', 'Case not found.', 404);
    const reason = String(input.notes || input.reason || '').trim().slice(0, 4000);
    if (!reason) throw workflowError('CASE_REASON_REQUIRED', 'Record the reason or evidence description.');
    if (dispute.status === 'RESOLVED' && input.action !== 'REOPEN') throw workflowError('DISPUTE_ALREADY_RESOLVED', 'This case is resolved.', 409);
    if (input.action === 'EVIDENCE' || input.action === 'RESPOND') {
      if (input.action === 'RESPOND' && actor.type !== 'VENDOR') throw workflowError('VENDOR_RESPONSE_REQUIRED', 'This action is reserved for the booked vendor.', 403);
      const files = evidenceFiles(input.evidence || []);
      await authorizeEvidenceFiles(files, booking, actor, 'CASE_EVIDENCE');
      dispute.evidence.push({ actor: actor.id, actorType: actor.type, at: new Date(), note: reason, files });
      if (input.action === 'RESPOND') dispute.response = { actor: actor.id, at: new Date(), notes: reason };
    } else {
      requireCoreActor(actor);
      if (input.action === 'ASSIGN') {
        if (!mongoose.isValidObjectId(input.assignedTo) || !await AdminUser.exists({ _id: input.assignedTo, status: 'ACTIVE', $or: [{ role: 'SUPER_ADMIN' }, { permissions: 'operations.manage' }] })) throw workflowError('REVIEWER_REQUIRED', 'Assign an active operations reviewer.');
        dispute.assignedTo = String(input.assignedTo); dispute.assignedAt = new Date();
      } else if (input.action === 'PROPOSE') {
        if (!DECISIONS.includes(input.decision)) throw workflowError('INVALID_CASE_DECISION', 'Choose an available resolution.');
        if (dispute.assignedTo !== actor.id) throw workflowError('CASE_REVIEW_OWNER_REQUIRED', 'The assigned reviewer must propose a resolution.', 403);
        dispute.proposal = { actor: actor.id, at: new Date(), decision: input.decision, notes: reason,
          refundAmount: Number(input.refundAmount || 0), settlementAmount: Number(input.settlementAmount || 0) };
        dispute.status = 'RESOLUTION_PROPOSED'; booking.protectionStatus = 'RESOLUTION_PROPOSED';
      } else if (input.action === 'REOPEN') {
        const policy = booking.completionPolicySnapshot?.completionRequirements || booking.financialPolicySnapshot?.completionRequirements;
        if (!policy?.allowReopen || dispute.status !== 'RESOLVED') throw workflowError('REOPEN_POLICY_REQUIRED', 'This case needs an approved reopening policy.', 409);
        dispute.status = 'UNDER_REVIEW'; booking.protectionStatus = 'UNDER_REVIEW';
        if (booking.settlementStatus !== 'SETTLED') booking.settlementStatus = 'SETTLEMENT_HOLD';
      } else if (input.action === 'REQUEST_INFORMATION' || input.action === 'ESCALATE') {
        dispute.status = 'UNDER_REVIEW'; booking.protectionStatus = 'UNDER_REVIEW';
      } else throw workflowError('INVALID_CASE_ACTION', 'Choose an available case action.');
    }
    dispute.history.push({ actor: actor.id, at: new Date(), action: input.action, reason });
  });
}

export function addCaseEvidence(bookingId, caseId, input, actor) { return updateCase(bookingId, caseId, { ...input, action: 'EVIDENCE' }, actor); }
export function respondToCase(bookingId, caseId, input, actor) { return updateCase(bookingId, caseId, { ...input, action: 'RESPOND' }, actor); }

export async function resolveDispute(bookingId, caseId, input, actor) {
  requireCoreActor(actor);
  return runBookingCommand(bookingId, { actor, action: 'CASE_RESOLVED', input: { ...input, caseId }, key: input.idempotencyKey, expectedVersion: input.expectedVersion }, async booking => {
    const dispute = booking.disputes.id(caseId);
    if (!dispute) throw workflowError('DISPUTE_NOT_FOUND', 'Case not found.', 404);
    if (dispute.status === 'RESOLVED') throw workflowError('DISPUTE_ALREADY_RESOLVED', 'This case is already resolved.', 409);
    if (!dispute.assignedTo || dispute.assignedTo !== actor.id) throw workflowError('CASE_REVIEW_OWNER_REQUIRED', 'The assigned reviewer must record the decision.', 403);
    if (!DECISIONS.includes(input.decision) || !String(input.notes || '').trim()) throw workflowError('CASE_DECISION_REQUIRED', 'Record the authorized resolution and review notes.');
    const refundAmount = Number(input.refundAmount || 0), settlementAmount = Number(input.settlementAmount || 0);
    if (dispute.status !== 'RESOLUTION_PROPOSED' || dispute.proposal?.decision !== input.decision || Number(dispute.proposal?.refundAmount || 0) !== refundAmount || Number(dispute.proposal?.settlementAmount || 0) !== settlementAmount) throw workflowError('CASE_PROPOSAL_REQUIRED', 'Review and record a matching resolution proposal before deciding.', 409);
    if (![refundAmount, settlementAmount].every(value => Number.isFinite(value) && value >= 0 && Math.round(value * 100) / 100 === value)) throw workflowError('INVALID_RESOLUTION_AMOUNT', 'Use valid nonnegative amounts.');
    if (refundAmount > Number(booking.paymentSummary?.paidAmount || 0) || settlementAmount > booking.totalAmount) throw workflowError('RESOLUTION_EXCEEDS_CONTRACT', 'The proposed financial remedy exceeds the contract or verified payment.');
    if ((input.decision.includes('REFUND') && refundAmount <= 0) || (input.decision.includes('SETTLEMENT') && settlementAmount <= 0)) throw workflowError('RESOLUTION_AMOUNT_REQUIRED', 'A financial remedy requires its authorized amount.');
    if (['SERVICE_ACCEPTED', 'VENDOR_SETTLEMENT', 'PARTIAL_SETTLEMENT'].includes(input.decision)) {
      assertCompletionEvidence(booking);
      if (booking.executionStatus !== 'COMPLETION_VERIFIED') throw workflowError('CORE_COMPLETION_REVIEW_REQUIRED', 'Core completion validation must precede any payout remedy.', 409);
    }
    dispute.status = 'RESOLVED';
    dispute.resolution = { decision: input.decision, decidedBy: actor.id, decidedAt: new Date(), notes: input.notes, refundAmount, settlementAmount };
    dispute.history.push({ actor: actor.id, at: new Date(), action: 'RESOLVED', reason: input.notes });
    const open = hasOpenDisputes(booking);
    booking.protectionStatus = open ? 'UNDER_REVIEW' : 'RESOLVED';
    // Decisions authorize review. Separate finance operations confirm transfers.
    if (booking.settlementStatus !== 'SETTLED') booking.settlementStatus = open ? 'SETTLEMENT_HOLD' :
      booking.executionStatus === 'COMPLETION_VERIFIED' && (!booking.payoutReviewAt || booking.payoutReviewAt <= new Date()) ? 'SETTLEMENT_ELIGIBLE' : 'NOT_ELIGIBLE';
  });
}

export async function reconcileDisputeWallet(vendorId) {
  const open = await CoreBooking.find({ vendorId, disputes: { $elemMatch: { status: { $ne: 'RESOLVED' } } } }).lean();
  const profile = await VendorFinancialProfile.findOne({ vendor: vendorId });
  if (!profile && !open.length) return;
  // A pre-existing manual freeze is never released by case reconciliation.
  const manualFreeze = profile?.wallet?.isFrozen && profile.wallet.freezeSource !== 'DISPUTE';
  await VendorFinancialProfile.updateOne({ vendor: vendorId }, { $set: {
    'wallet.isFrozen': Boolean(manualFreeze || open.length),
    ...(!manualFreeze ? { 'wallet.freezeSource': 'DISPUTE', 'wallet.freezeReason': open.length ? `${open.length} booking(s) have open cases` : '',
      'wallet.frozenBalance': open.reduce((total, booking) => total + Number(booking.paymentSummary?.paidAmount || 0), 0) } : {}),
  } }, { upsert: true });
}
