import crypto from 'node:crypto';
import { CoreBooking } from '../models/CoreBooking.js';
import { FinanceLedgerEntry } from '../models/FinanceLedgerEntry.js';
import { VendorFinancialProfile } from '../../external/models/VendorFinancialProfile.js';
import { IdempotencyKey } from '../models/IdempotencyKey.js';
import { runBookingCommand, requireCoreActor, workflowError, hasOpenDisputes, evidenceFiles, authorizeEvidenceFiles, findCoreBooking } from './bookingWorkflow.service.js';
import { settlementMath } from './financeLedger.service.js';
import { assertCompletionEvidence } from './executionSettlement.service.js';
import { calculateEligibleAdvanceRefund } from '../../common/policyResolver.js';
import * as razorpay from '../../customer/services/payments/razorpay.js';

const paise = value => Math.round(Number(value || 0) * 100);
const amount = value => value / 100;
const active = op => !['FAILED', 'REJECTED'].includes(op.status);
const permission = kind => kind === 'REFUND' ? 'payments.refund' : 'settlements.release';

async function claimBankReference(reference, operationId) {
  const key = `bank-transfer:${crypto.createHash('sha256').update(reference.trim().toUpperCase()).digest('hex')}`;
  let claim;
  try {
    claim = await IdempotencyKey.findOneAndUpdate({ key }, { $setOnInsert: { scope: 'BANK_TRANSFER_REFERENCE', status: 'COMPLETED', result: { operationId }, expiresAt: null } }, { upsert: true, new: true });
  } catch (error) { if (error.code !== 11000) throw error; claim = await IdempotencyKey.findOne({ key }); }
  if (claim?.result?.operationId !== operationId) throw workflowError('TRANSFER_REFERENCE_REUSED', 'This bank reference belongs to another finance operation.', 409);
}

function vendorPayable(booking) {
  const original = booking.taxSummary?.invoiceNumber ? booking.taxSummary.vendorPayable : settlementMath(booking.totalAmount, booking.financialPolicySnapshot || {}).vendorPayable;
  const remedies = booking.disputes.filter(d => d.status === 'RESOLVED' && ['VENDOR_SETTLEMENT', 'PARTIAL_SETTLEMENT'].includes(d.resolution?.decision)).map(d => Number(d.resolution.settlementAmount));
  return remedies.length ? Math.min(original, ...remedies) : original;
}

export async function financeProjection(booking) {
  const entries = await FinanceLedgerEntry.find({ booking: booking._id, type: { $in: ['REFUND', 'SETTLEMENT_RELEASE'] } }).lean();
  const sum = (kind, status) => (booking.financeOperations || []).filter(op => op.kind === kind && (!status || op.status === status)).reduce((total, op) => total + paise(op.amount), 0);
  const operationKeys = new Set((booking.financeOperations || []).filter(op => op.status === 'CONFIRMED').map(op => `finance-operation:${op.operationId}`));
  const legacy = entries.filter(e => !operationKeys.has(e.idempotencyKey));
  const ledgerRefund = legacy.filter(e => e.type === 'REFUND').reduce((total, e) => total + paise(e.amount), 0);
  const ledgerSettlement = legacy.filter(e => e.type === 'SETTLEMENT_RELEASE').reduce((total, e) => total + paise(e.amount), 0);
  const refunded = sum('REFUND', 'CONFIRMED') + ledgerRefund;
  const settled = Math.max(sum('SETTLEMENT', 'CONFIRMED') + ledgerSettlement, booking.settlementStatus === 'SETTLED' ? paise(booking.settlementDetails?.amount) : 0);
  const pending = (booking.financeOperations || []).filter(op => active(op) && op.status !== 'CONFIRMED').reduce((total, op) => total + paise(op.amount), 0);
  const paid = ['PAYMENT_VERIFIED', 'REFUNDED'].includes(booking.paymentStatus) ? paise(booking.paymentSummary?.paidAmount) : 0;
  return { verifiedCollections: amount(paid), confirmedRefunds: amount(refunded), confirmedSettlements: amount(settled),
    pendingAmount: amount(pending), availableVerifiedFunds: amount(Math.max(0, paid - refunded - settled - pending)),
    held: hasOpenDisputes(booking) || booking.settlementStatus === 'SETTLEMENT_HOLD', operations: booking.financeOperations || [] };
}

async function assertFinanceAmount(booking, kind, requested, excludeOperation) {
  if (!Number.isFinite(requested) || requested <= 0 || paise(requested) / 100 !== requested) throw workflowError('INVALID_FINANCE_AMOUNT', 'Enter an amount greater than zero with at most two decimal places.');
  const projectionBooking = booking.toObject();
  projectionBooking.financeOperations = projectionBooking.financeOperations.filter(op => op.operationId !== excludeOperation);
  const funds = await financeProjection(projectionBooking);
  if (paise(requested) > paise(funds.availableVerifiedFunds)) throw workflowError('INSUFFICIENT_VERIFIED_FUNDS', 'The amount exceeds verified funds remaining after refunds, settlements and pending requests.', 409);
  const policy = booking.financialPolicySnapshot;
  if (!policy || !(policy.version > 0 || policy.policyVersion > 0)) throw workflowError('FINANCE_POLICY_REQUIRED', 'An approved financial policy snapshot is required.', 409);
  if (kind === 'SETTLEMENT') {
    if (booking.bookingStatus !== 'CONFIRMED' || booking.executionStatus !== 'COMPLETION_VERIFIED') throw workflowError('SETTLEMENT_NOT_ELIGIBLE', 'Core completion validation is required.', 409);
    assertCompletionEvidence(booking);
    if (hasOpenDisputes(booking) || booking.settlementStatus === 'SETTLEMENT_HOLD') throw workflowError('SETTLEMENT_HELD', 'Outstanding issues prevent settlement.', 409);
    if (booking.payoutReviewAt && booking.payoutReviewAt > new Date()) throw workflowError('SETTLEMENT_REVIEW_DELAY', 'The settlement review delay has not elapsed.', 409);
    const profile = await VendorFinancialProfile.findOne({ vendor: booking.vendorId }).lean();
    if (await CoreBooking.exists({ vendorId: booking.vendorId, disputes: { $elemMatch: { status: { $ne: 'RESOLVED' } } } })) throw workflowError('SETTLEMENT_WALLET_FROZEN', 'Open service cases require finance review.', 409);
    if (profile?.wallet?.isFrozen) throw workflowError('SETTLEMENT_WALLET_FROZEN', 'The vendor wallet requires review.', 409);
    const payable = vendorPayable(booking);
    const reservedPayouts = projectionBooking.financeOperations.filter(op => op.kind === 'SETTLEMENT' && active(op) && op.status !== 'CONFIRMED').reduce((total, op) => total + paise(op.amount), 0);
    const remaining = paise(payable) - paise(funds.confirmedSettlements) - reservedPayouts;
    if (paise(requested) > remaining) throw workflowError('SETTLEMENT_EXCEEDS_PAYABLE', 'The amount exceeds the remaining vendor payable.', 409);
    if (!policy.partialSettlementAllowed && paise(requested) !== remaining) throw workflowError('PARTIAL_SETTLEMENT_NOT_APPROVED', 'The approved policy does not permit a partial payout.', 409);
  } else {
    const resolvedRefund = booking.disputes.filter(d => d.status === 'RESOLVED' && ['REFUND', 'PARTIAL_REFUND'].includes(d.resolution?.decision)).reduce((total, d) => total + Number(d.resolution.refundAmount || 0), 0);
    const days = Math.floor((Date.parse(`${booking.eventDate}T00:00:00Z`) - Date.now()) / 86400000);
    const eligible = calculateEligibleAdvanceRefund({ eligibleAdvance: funds.verifiedCollections, refundTiers: policy.customerCancellationRefunds, daysBeforeEvent: days, alreadyRefunded: funds.confirmedRefunds });
    const cap = Math.max(0, resolvedRefund ? resolvedRefund - funds.confirmedRefunds : eligible?.amount || 0);
    if (requested > cap) throw workflowError('REFUND_EXCEEDS_POLICY_LIMIT', 'The amount exceeds the approved cancellation policy or recorded case decision.', 409);
    if (!policy.partialRefundAllowed && paise(requested) !== paise(cap)) throw workflowError('PARTIAL_REFUND_NOT_APPROVED', 'The approved policy does not permit a partial refund.', 409);
  }
}

export async function requestFinanceOperation(bookingId, input, actor) {
  const kind = input.kind;
  if (!['REFUND', 'SETTLEMENT'].includes(kind)) throw workflowError('INVALID_FINANCE_KIND', 'Choose refund or settlement.');
  requireCoreActor(actor, permission(kind));
  actor = { ...actor, permission: permission(kind) };
  return runBookingCommand(bookingId, { actor, action: 'FINANCE_REQUESTED', input, key: input.idempotencyKey, expectedVersion: input.expectedVersion }, async booking => {
    const requested = Number(input.amount);
    await assertFinanceAmount(booking, kind, requested);
    const method = input.method || 'MANUAL';
    if (method === 'MANUAL' && booking.financialPolicySnapshot.manualFinanceAllowed !== true) throw workflowError('MANUAL_FINANCE_POLICY_REQUIRED', 'Manual reconciliation must be explicitly approved in the financial policy.', 409);
    if (method === 'RAZORPAY' && (kind !== 'REFUND' || !razorpay.isConfigured() || !booking.paymentSummary.providerPaymentId)) throw workflowError('FINANCE_PROVIDER_UNAVAILABLE', 'This provider does not support the requested operation.', 409);
    if (!['MANUAL', 'RAZORPAY'].includes(method) || !String(input.reason || '').trim()) throw workflowError('FINANCE_REASON_REQUIRED', 'Choose a supported processing method and record the reason.');
    booking.financeOperations.push({ operationId: crypto.randomUUID(), key: input.idempotencyKey, kind, amount: requested,
      status: 'REQUESTED', method, reason: String(input.reason).slice(0, 1000), requestedBy: actor.id, requestedAt: new Date() });
  });
}

export async function updateFinanceOperation(bookingId, operationId, input, actor) {
  const initial = await findCoreBooking(bookingId);
  const original = initial.financeOperations.find(op => op.operationId === operationId);
  if (!original) throw workflowError('FINANCE_OPERATION_NOT_FOUND', 'Finance operation not found.', 404);
  const needed = input.action === 'APPROVE' && original.kind === 'SETTLEMENT' ? 'settlements.approve' : permission(original.kind);
  requireCoreActor(actor, needed);
  actor = { ...actor, permission: needed };
  return runBookingCommand(bookingId, { actor, action: `FINANCE_${input.action}`, input: { ...input, operationId }, key: input.idempotencyKey, expectedVersion: input.expectedVersion }, async booking => {
    const op = booking.financeOperations.find(item => item.operationId === operationId);
    if (input.action === 'APPROVE' || input.action === 'REJECT') {
      if (op.status !== 'REQUESTED') throw workflowError('FINANCE_STATE_CONFLICT', 'This request has already been reviewed.', 409);
      if (op.requestedBy === actor.id) throw workflowError('MAKER_CHECKER_REQUIRED', 'A different authorized reviewer must decide this request.', 403);
      if (input.action === 'APPROVE') await assertFinanceAmount(booking, op.kind, op.amount, op.operationId);
      op.status = input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      op.approvedBy = actor.id; op.approvedAt = new Date();
    } else if (input.action === 'RECORD_TRANSFER') {
      if (op.method !== 'MANUAL' || op.status !== 'APPROVED') throw workflowError('FINANCE_STATE_CONFLICT', 'Only approved manual transfers can be recorded.', 409);
      await assertFinanceAmount(booking, op.kind, op.amount, op.operationId);
      const files = evidenceFiles(input.evidence);
      await authorizeEvidenceFiles(files, booking, actor, 'FINANCE_EVIDENCE');
      if (!files.length || !String(input.reference || '').trim()) throw workflowError('TRANSFER_EVIDENCE_REQUIRED', 'Record transfer evidence and its bank reference.');
      if (booking.financeOperations.some(other => other.operationId !== op.operationId && other.reference === input.reference && active(other))) throw workflowError('TRANSFER_REFERENCE_REUSED', 'This bank reference is already recorded.', 409);
      await claimBankReference(String(input.reference).trim().slice(0, 160), op.operationId);
      op.evidence = files; op.reference = String(input.reference).trim().slice(0, 160);
      op.processedBy = actor.id; op.processedAt = new Date(); op.status = 'PROCESSING';
    } else if (['RECONCILE', 'RECONCILE_FAILED'].includes(input.action)) {
      if (op.method !== 'MANUAL' || !['PROCESSING', 'UNDER_REVIEW'].includes(op.status)) throw workflowError('FINANCE_STATE_CONFLICT', 'A recorded transfer must be reconciled independently.', 409);
      if (actor.id === op.processedBy || actor.id === op.requestedBy) throw workflowError('INDEPENDENT_RECONCILIATION_REQUIRED', 'A reviewer other than the requester and transfer recorder must reconcile the evidence.', 403);
      if (!String(input.notes || '').trim() || input.reference !== op.reference || !evidenceFiles(input.evidence).length) throw workflowError('RECONCILIATION_EVIDENCE_REQUIRED', 'Match the bank reference and attach independent reconciliation evidence.');
      const reconciliationFiles = evidenceFiles(input.evidence);
      await authorizeEvidenceFiles(reconciliationFiles, booking, actor, 'FINANCE_EVIDENCE');
      if (reconciliationFiles.some(file => op.evidence.some(existing => existing.assetId === file.assetId))) throw workflowError('INDEPENDENT_RECONCILIATION_EVIDENCE_REQUIRED', 'Attach independent statement evidence, distinct from the transfer advice.', 409);
      // Reconciliation records what actually happened after authorized execution.
      // A subsequently opened case must remain held without hiding a bank movement.
      op.evidence.push(...reconciliationFiles); op.reconciledBy = actor.id;
      if (input.action === 'RECONCILE_FAILED') { op.status = 'FAILED'; op.lastError = String(input.notes).slice(0, 1000); }
      else { op.confirmedAt = new Date(); op.status = 'CONFIRMED'; }
    } else if (input.action === 'FAIL') {
      if (!['APPROVED', 'PROCESSING', 'UNDER_REVIEW'].includes(op.status) || !String(input.reason || '').trim()) throw workflowError('FINANCE_STATE_CONFLICT', 'Record a reason for the failed or uncertain transfer.', 409);
      // Ambiguous movement keeps funds reserved until provider/bank reconciliation.
      op.status = op.status === 'APPROVED' ? 'FAILED' : 'UNDER_REVIEW';
      op.lastError = String(input.reason).slice(0, 1000);
    } else throw workflowError('INVALID_FINANCE_ACTION', 'Choose an authorized finance action.');
    if (op.status === 'CONFIRMED') await applyConfirmedFinance(booking);
  });
}

export async function applyConfirmedFinance(booking) {
  const confirmed = booking.financeOperations.filter(op => op.status === 'CONFIRMED');
  const projection = await financeProjection(booking);
  const refunds = paise(projection.confirmedRefunds), settled = paise(projection.confirmedSettlements);
  if (refunds >= paise(booking.paymentSummary.paidAmount) && refunds > 0) booking.paymentStatus = 'REFUNDED';
  const payable = vendorPayable(booking);
  if (settled >= paise(payable) && settled > 0 && !hasOpenDisputes(booking) && booking.settlementStatus !== 'SETTLEMENT_HOLD') booking.settlementStatus = 'SETTLED';
  if (settled) booking.settlementDetails = { ...booking.settlementDetails?.toObject(), amount: amount(settled), vendorPayable: amount(settled),
    transactionReference: confirmed.filter(op => op.kind === 'SETTLEMENT').map(op => op.reference || op.providerId).join(', '), settledAt: new Date(), settledBy: 'RECONCILED_FINANCE' };
}

export async function postConfirmedFinanceLedger(booking) {
  for (const op of booking.financeOperations.filter(op => op.status === 'CONFIRMED')) {
    await FinanceLedgerEntry.updateOne({ idempotencyKey: `finance-operation:${op.operationId}` }, { $setOnInsert: {
      booking: booking._id, vendorId: booking.vendorId, customerId: booking.customerId, eventId: booking.customerEvent,
      type: op.kind === 'REFUND' ? 'REFUND' : 'SETTLEMENT_RELEASE', amount: op.amount, currency: 'INR',
      debitAccount: op.kind === 'REFUND' ? 'Customer Refund Payable' : 'Vendor Payable', creditAccount: 'Reconciled Bank Clearing',
      reference: op.reference || op.providerId, description: `${op.method === 'MANUAL' ? 'Manually reconciled' : 'Provider confirmed'} ${op.kind.toLowerCase()}`,
      postedAt: op.confirmedAt,
    } }, { upsert: true });
  }
}

// Provider execution is opt-in. Reconciliation can recover a confirmed refund
// after a timeout/crash without blindly repeating the money-movement request.
export async function processProviderRefund(bookingId, operationId, actor) {
  requireCoreActor(actor, 'payments.refund');
  if (process.env.FINANCE_PROVIDER_EXECUTION_ENABLED !== 'true') throw workflowError('PROVIDER_EXECUTION_DISABLED', 'Provider money movement requires an approved release configuration.', 409);
  const booking = await runBookingCommand(bookingId, { actor: { ...actor, permission: 'payments.refund' }, action: 'PROVIDER_REFUND_STARTED',
    input: { operationId }, key: `provider-start:${operationId}` }, async row => {
    const op = row.financeOperations.find(item => item.operationId === operationId);
    if (!op || op.method !== 'RAZORPAY' || op.status !== 'APPROVED') throw workflowError('FINANCE_STATE_CONFLICT', 'An approved provider refund is required.', 409);
    await assertFinanceAmount(row, 'REFUND', op.amount, operationId);
    op.status = 'PROCESSING'; op.processedAt = new Date(); op.processedBy = actor.id;
  });
  const op = booking.financeOperations.find(item => item.operationId === operationId);
  // A persisted attempt must never be executed again, including after an
  // ambiguous timeout. The stable receipt is used to discover provider results.
  const receipt = `sv-${operationId}`.slice(0, 40);
  const lease = await CoreBooking.findOneAndUpdate({ _id: booking._id, financeOperations: { $elemMatch: { operationId, status: 'PROCESSING', providerId: { $exists: false } } } }, {
    $set: { 'financeOperations.$.providerId': 'REQUEST_IN_FLIGHT' },
  }, { new: true });
  if (lease) {
    try {
      const result = await razorpay.createRefund(booking.paymentSummary.providerPaymentId, { amount: op.amount, receipt });
      await CoreBooking.updateOne({ _id: booking._id, 'financeOperations.operationId': operationId }, { $set: { 'financeOperations.$.providerId': result.id } });
    } catch (error) {
      await CoreBooking.updateOne({ _id: booking._id, 'financeOperations.operationId': operationId }, { $set: { 'financeOperations.$.lastError': 'Provider execution outcome requires reconciliation' } });
    }
  }
  return reconcileProviderRefund(bookingId, operationId);
}

export async function reconcileProviderRefund(bookingId, operationId) {
  const initial = await findCoreBooking(bookingId);
  const op = initial.financeOperations.find(item => item.operationId === operationId);
  if (!op || op.method !== 'RAZORPAY' || !['PROCESSING', 'UNDER_REVIEW'].includes(op.status)) return initial;
  let result;
  for (let skip = 0; skip < 10000; skip += 100) {
    const page = await razorpay.listPaymentRefunds(initial.paymentSummary.providerPaymentId, skip);
    result = page.items?.find(item => item.receipt === `sv-${operationId}`.slice(0, 40));
    if (result || !page.items || page.items.length < 100) break;
  }
  if (!result) return initial;
  if (result.payment_id !== initial.paymentSummary.providerPaymentId || result.currency !== 'INR' || result.amount !== paise(op.amount)) throw workflowError('PROVIDER_AMOUNT_MISMATCH', 'Provider refund requires finance review.', 409);
  const actor = { id: 'RAZORPAY_RECONCILIATION', type: 'ADMIN', role: 'SUPER_ADMIN', permission: 'payments.refund' };
  return runBookingCommand(bookingId, { actor, action: 'PROVIDER_REFUND_RECONCILED', input: { providerId: result.id, status: result.status }, key: `provider-result:${result.id}:${result.status}` }, async booking => {
    const current = booking.financeOperations.find(item => item.operationId === operationId);
    if (current.status === 'CONFIRMED') return;
    current.providerId = result.id;
    if (result.status === 'processed') {
      current.status = 'CONFIRMED'; current.confirmedAt = new Date(); current.reconciledBy = actor.id;
      await applyConfirmedFinance(booking);
    } else if (result.status === 'failed') {
      current.status = 'FAILED'; current.lastError = 'Provider confirmed refund failure';
    }
  });
}

// Called only after the existing raw-body HMAC webhook gate. The provider's
// current API result remains authoritative for duplicate/out-of-order callbacks.
export async function reconcileRefundWebhook(refund) {
  if (!refund?.payment_id || !refund.id) return false;
  const rows = await CoreBooking.find({ 'paymentSummary.providerPaymentId': refund.payment_id,
    financeOperations: { $elemMatch: { method: 'RAZORPAY', status: { $in: ['PROCESSING', 'UNDER_REVIEW'] } } } });
  for (const row of rows) for (const op of row.financeOperations) {
    if (op.method !== 'RAZORPAY' || !['PROCESSING', 'UNDER_REVIEW'].includes(op.status)) continue;
    if (op.providerId !== refund.id && refund.receipt !== `sv-${op.operationId}`.slice(0, 40)) continue;
    await reconcileProviderRefund(row._id, op.operationId);
    return true;
  }
  return false;
}
