import mongoose from 'mongoose';
import { Booking } from '../models/index.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { acknowledgeCompletion, getExecutionProjection, replacementOptions, chooseReplacement } from '../../admin/services/executionSettlement.service.js';
import { createVendorOpportunityForSelection } from './decision.service.js';
import { withVendorSchedule } from '../../external/services/scheduleLock.js';
import { EventRequirement } from '../models/index.js';
import { reportIssue, addCaseEvidence, caseProjection } from '../../admin/services/disputes.service.js';
import { financeProjection } from '../../admin/services/financeOperations.service.js';
import { getOwnedEventOr404 } from './events.service.js';
import { badRequest, conflict, notFound } from '../utils/http.js';
import { customerActor, commandKey } from './eventCircle.service.js';
import { reconcileBookingWorkflow } from '../../admin/services/bookingWorkflowEffects.service.js';

export async function ownedCoreBooking(customerId, bookingId, eventId = null) {
  const objectId = mongoose.isValidObjectId(bookingId);
  const clauses = [{ bookingReference: String(bookingId) }, { quoteId: String(bookingId) }];
  if (objectId) clauses.push({ _id: bookingId }, { customerBookingId: bookingId });
  let core = await CoreBooking.findOne({ customerId, ...(eventId ? { customerEvent: eventId } : {}), $or: clauses });
  if (!core && objectId) {
    const projection = await Booking.findOne({ _id: bookingId, customer: customerId, ...(eventId ? { event: eventId } : {}) }).lean();
    if (projection?.coreBookingId || projection?.coreBooking) {
      core = await CoreBooking.findOne({ _id: projection.coreBookingId || projection.coreBooking, customerId, ...(eventId ? { customerEvent: eventId } : {}) });
    }
  }
  if (!core) throw notFound('Booked service not found');
  return core;
}
const evidenceView = evidence => (evidence || []).map(e => ({
  submittedAt: e.submittedAt, notes: e.notes || '', photos: e.photos || [], videos: e.videos || [],
  deliverablesUrl: e.deliverablesUrl?.startsWith('https://') ? e.deliverablesUrl : null,
  files: (e.files || []).map(f => ({ assetId: f.assetId || (f.url?.startsWith('asset:') ? f.url.slice(6) : null), url: f.url?.startsWith('https://') ? f.url : null, note: f.note })),
  checklist: e.checklist || [],
}));
export async function customerWorkflowProjection(core, customerId) {
  if (String(core.customerId) !== String(customerId)) throw notFound('Booking not found');
  const actor = customerActor(customerId);
  const execution = getExecutionProjection(core);
  const protection = caseProjection(core, actor);
  const finance = await financeProjection(core);
  const refunds = finance.operations.filter(op => op.kind === 'REFUND').map(op => ({
    id: op.operationId, amount: op.amount, status: op.status, method: op.method,
    requestedAt: op.requestedAt, confirmedAt: op.confirmedAt,
    failureReason: ['FAILED', 'UNDER_REVIEW'].includes(op.status) ? 'STARVNT is reviewing the recorded refund transfer status.' : null,
  }));
  const confirmedRefunds = finance.confirmedRefunds;
  const refundDecisions = protection.cases.filter(c => ['REFUND', 'PARTIAL_REFUND'].includes(c.resolution?.decision)).map(c => ({ caseId: c.id, decision: c.resolution.decision, amount: c.resolution.refundAmount }));
  return {
    id: String(core._id), eventId: core.customerEvent ? String(core.customerEvent) : null, reference: core.bookingReference,
    vendorName: core.vendorName, serviceName: core.serviceName, category: core.category, updatedAt: core.updatedAt,
    version: execution.version, bookingStatus: core.bookingStatus, paymentStatus: core.paymentStatus,
    executionStatus: core.executionStatus, protectionStatus: protection.protectionStatus,
    payment: { status: core.paymentStatus, verifiedAmount: finance.verifiedCollections, totalAmount: core.totalAmount, balanceAmount: core.paymentSummary?.balanceAmount ?? null },
    pricing: { base: core.pricing?.basePrice, travel: core.pricing?.travelFee, equipment: core.pricing?.equipmentFee, setup: core.pricing?.setupFee, additional: core.pricing?.additionalFee, finalPayable: core.totalAmount, source: 'BOOKED_COMMERCIAL_RECORD' },
    planned: { date: core.eventDate, startTime: core.requirementSnapshot?.startTime || null, endTime: core.requirementSnapshot?.endTime || null, durationHours: core.requirementSnapshot?.durationHours ?? null },
    delays: protection.cases.filter(c => c.issueType === 'SERVICE_DELAY' && c.status !== 'RESOLVED').map(c => ({ description: c.description, reportedAt: c.reportedAt })),
    nextAction: { label: protection.cases.some(c => c.status !== 'RESOLVED') ? 'Review your service issue' : core.executionStatus === 'COMPLETION_SUBMITTED' ? 'Review completion evidence' : 'Review service status', url: `/customer/events/${core.customerEvent}/bookings/${core._id}` },
    replacementDecision: core.replacementDecision ? { status: core.replacementDecision.status, vendorServiceId: core.replacementDecision.vendorServiceId, at: core.replacementDecision.at } : null,
    execution: {
      checkedInAt: execution.execution.checkedInAt || null, startedAt: execution.execution.startedAt || null,
      submittedAt: execution.execution.submittedAt || null,
      milestones: (execution.execution.milestones || []).map(m => ({ key: m.key, detail: m.detail, at: m.at, correctedAt: m.correctedAt, correctionReason: m.correctionReason })),
      customerAcknowledgement: execution.execution.customerAcknowledgement ? { at: execution.execution.customerAcknowledgement.at, notes: execution.execution.customerAcknowledgement.notes } : null,
      verifiedAt: core.executionStatus === 'COMPLETION_VERIFIED' ? execution.validation?.verifiedAt || null : null,
      reviewNotes: execution.validation?.notes || null,
    },
    completionEvidence: evidenceView(core.completionEvidence),
    completionPolicyAvailable: Boolean(execution.completionPolicy?.completionRequirements),
    protection: {
      status: protection.protectionStatus, underReview: protection.cases.some(c => c.status !== 'RESOLVED'),
      cases: protection.cases.map(c => ({
        id: c.id, reportedAt: c.reportedAt, issueType: c.issueType, description: c.description, status: c.status,
        evidence: (c.evidence || []).map(e => ({ at: e.at, note: e.note, files: (e.files || []).map(f => ({ assetId: f.assetId || (f.url?.startsWith('asset:') ? f.url.slice(6) : null), note: f.note })) })),
        response: c.response ? { notes: c.response.notes, at: c.response.at } : null,
        proposal: c.proposal ? { decision: c.proposal.decision, notes: c.proposal.notes, refundAmount: c.proposal.refundAmount, at: c.proposal.at } : null,
        resolution: c.resolution ? { decision: c.resolution.decision, notes: c.resolution.notes, refundAmount: c.resolution.refundAmount, decidedAt: c.resolution.decidedAt } : null,
        requests: (c.history || []).filter(h => h.action === 'REQUEST_INFORMATION').map(h => ({ at: h.at, message: h.reason })),
      })),
    },
    refund: { decisions: refundDecisions, operations: refunds, confirmedAmount: confirmedRefunds, remainingPaidAmount: Math.max(0, finance.verifiedCollections - confirmedRefunds) },
    allowedActions: {
      acknowledge: ['COMPLETION_SUBMITTED', 'COMPLETION_VERIFIED'].includes(core.executionStatus) && !execution.execution.customerAcknowledgement?.at,
      reportIssue: true, reviewReplacement: ['FAILED', 'CANCELLED'].includes(core.bookingStatus) || protection.cases.some(c => c.proposal?.decision === 'REPLACEMENT' || c.resolution?.decision === 'REPLACEMENT'),
    },
  };
}
export async function bookingWorkflow(customerId, bookingId, eventId) {
  return { booking: await customerWorkflowProjection(await ownedCoreBooking(customerId, bookingId, eventId), customerId) };
}
export async function eventWorkflows(customerId, eventId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const rows = await CoreBooking.find({ customerId, customerEvent: event._id }).sort({ createdAt: 1 });
  return { eventId: String(event._id), observedAt: new Date(), services: await Promise.all(rows.map(row => customerWorkflowProjection(row, customerId))) };
}
export async function acknowledgeCustomerCompletion(customerId, bookingId, input = {}) {
  const core = await ownedCoreBooking(customerId, bookingId, input.eventId);
  const submission = core.completionEvidence.at(-1)?._id || core.execution?.submittedAt?.getTime?.() || 'none';
  const idempotencyKey = input.idempotencyKey ? commandKey(input.idempotencyKey) : `legacy-ack-${core._id}-${submission}`;
  const row = await acknowledgeCompletion(core._id, customerId, { notes: String(input.notes || '').slice(0, 2000), expectedVersion: input.expectedVersion, idempotencyKey });
  await reconcileBookingWorkflow(row._id).catch(() => {}); // Durable workflow intent remains available to the worker.
  return { ok: true, booking: await customerWorkflowProjection(row, customerId) };
}
export async function reportCustomerIssue(customerId, bookingId, input = {}) {
  const core = await ownedCoreBooking(customerId, bookingId, input.eventId);
  if (!core.customerEvent) throw conflict('BOOKING_EVENT_CONTEXT_REQUIRED', 'STARVNT needs to link the original event before recording this service issue.');
  await getOwnedEventOr404(customerId, core.customerEvent);
  if (!['SERVICE_DELAY', 'SERVICE_QUALITY', 'SERVICE_FAILURE', 'BILLING', 'OTHER'].includes(input.issueType)) throw badRequest('INVALID_ISSUE_TYPE', 'Choose the type of issue.');
  const row = await reportIssue(core._id, {
    description: input.description, issueType: input.issueType, evidence: input.evidence || [],
    idempotencyKey: commandKey(input.idempotencyKey), expectedVersion: input.expectedVersion,
  }, customerActor(customerId));
  await reconcileBookingWorkflow(row._id).catch(() => {});
  return { booking: await customerWorkflowProjection(row, customerId) };
}
export async function supplementCustomerIssue(customerId, bookingId, caseId, input = {}) {
  const core = await ownedCoreBooking(customerId, bookingId, input.eventId);
  if (!core.customerEvent) throw conflict('BOOKING_EVENT_CONTEXT_REQUIRED', 'STARVNT needs to link the original event before recording case information.');
  await getOwnedEventOr404(customerId, core.customerEvent);
  const row = await addCaseEvidence(core._id, caseId, {
    notes: input.notes, evidence: input.evidence || [], idempotencyKey: commandKey(input.idempotencyKey), expectedVersion: input.expectedVersion,
  }, customerActor(customerId));
  await reconcileBookingWorkflow(row._id).catch(() => {});
  return { booking: await customerWorkflowProjection(row, customerId) };
}
export async function customerReplacementOptions(customerId, bookingId, eventId) {
  const core = await ownedCoreBooking(customerId, bookingId, eventId);
  return replacementOptions(core._id, customerActor(customerId));
}
export async function selectCustomerReplacement(customerId, bookingId, input = {}) {
  const core = await ownedCoreBooking(customerId, bookingId, input.eventId);
  const actor = customerActor(customerId);
  const options = await replacementOptions(core._id, actor);
  const option = options.alternativeCandidates.find(candidate => String(candidate.serviceId) === String(input.vendorServiceId));
  if (!option) throw badRequest('REPLACEMENT_UNAVAILABLE', 'Refresh the replacement options.');
  const event = await getOwnedEventOr404(customerId, core.customerEvent);
  const requirement = await EventRequirement.findOne({ _id: options.originalRequirement.requirementId, event: event._id }).lean();
  if (!requirement) throw badRequest('REQUIREMENT_CONTEXT_REQUIRED', 'The original service requirement needs review before requesting a replacement quote.');
  const row = await chooseReplacement(core._id, {
    vendorServiceId: input.vendorServiceId, expectedVersion: input.expectedVersion, idempotencyKey: commandKey(input.idempotencyKey),
  }, actor);
  const opportunity = await withVendorSchedule(option.vendorId, () => createVendorOpportunityForSelection({
    customerId, event, requirement, requirementContext: options.originalRequirement,
    optionId: `vs_${option.serviceId}`,
    option: { vendorId: option.vendorId, packageName: option.serviceName || core.serviceName, category: core.category, requiresVendorConfirmation: true, costBreakdown: option.costBreakdown },
  }));
  return { booking: await customerWorkflowProjection(row, customerId), opportunityId: String(opportunity._id), nextAction: 'REVIEW_VENDOR_CONFIRMED_QUOTE', quoteUrl: `/customer/events/${event._id}/quotes` };
}
