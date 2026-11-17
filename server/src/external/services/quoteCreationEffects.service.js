import { Quote } from '../models/Quote.js';
import { Opportunity } from '../models/Opportunity.js';
import { quoteCreationHash } from '../../common/quoteCreationCommand.js';
import { assertCommercialSnapshot } from './commercialSnapshot.service.js';
import { publishOutboxEvent, processOutboxBatch } from '../../automation/services/outbox.service.js';

const pendingStates = ['PENDING', 'ENQUEUED'];
const conflict = () => new Error('QUOTE_CREATION_EVIDENCE_CONFLICT');
function evidence(quote) {
  const effect = quote.creationEffects;
  if (!effect) return null;
  if (!['PENDING', 'ENQUEUED', 'COMPLETED', 'SUPERSEDED'].includes(effect.state)) throw conflict();
  const snapshot = effect.snapshot;
  if (!snapshot || quoteCreationHash(snapshot) !== effect.hash || snapshot.quoteId !== String(quote._id) || snapshot.vendorId !== String(quote.vendor) || snapshot.customerId !== String(quote.customer) || snapshot.opportunityId !== (quote.opportunity ? String(quote.opportunity) : null) || snapshot.quoteReference !== quote.quoteReference || !Number.isSafeInteger(snapshot.version) || snapshot.version < 1) throw conflict();
  return effect;
}

export async function enqueueQuoteCreationEffects(quote, { process = true } = {}) {
  const effect = evidence(quote);
  if (!effect) return { managed: false };
  if (!pendingStates.includes(effect.state)) return { managed: true, state: effect.state, pending: false };
  const id = String(quote._id);
  const { event } = await publishOutboxEvent({ eventType: 'QUOTE_CREATION_RECORDED', aggregateType: 'Quote', aggregateId: id, payload: { quoteId: id }, idempotencyKey: `quote.creation.${id}.${effect.snapshot.version}.effects` });
  if (!event || event.eventType !== 'QUOTE_CREATION_RECORDED' || event.aggregateType !== 'Quote' || String(event.aggregateId) !== id || event.payload?.quoteId !== id) throw conflict();
  if (event.status === 'COMPLETED') {
    const latest = await Quote.findById(quote._id).select('+creationEffects');
    const currentEffect = latest && evidence(latest);
    if (currentEffect && ['COMPLETED', 'SUPERSEDED'].includes(currentEffect.state)) return { managed: true, state: currentEffect.state, pending: false };
    throw new Error('QUOTE_CREATION_EFFECT_STATE_REQUIRES_REVIEW');
  }
  await Quote.updateOne({ _id: quote._id, 'creationEffects.hash': effect.hash, 'creationEffects.state': 'PENDING' }, { $set: { 'creationEffects.state': 'ENQUEUED' } });
  if (process) await processOutboxBatch({ batchSize: 1, eventId: event._id });
  const current = await Quote.findById(quote._id).select('+creationEffects');
  return { managed: true, state: current?.creationEffects?.state || 'UNKNOWN', pending: !current || pendingStates.includes(current.creationEffects?.state) };
}

// The worker reconstructs intent from the quote, never from caller-supplied prices.
export async function applyQuoteCreationEffects(payload) {
  try {
    const quote = await Quote.findById(payload.quoteId).select('+creationEffects');
    if (!quote) throw conflict();
    const effect = evidence(quote);
    if (!effect) throw conflict();
    if (!pendingStates.includes(effect.state)) return { handled: true, state: effect.state };
    const snapshot = effect.snapshot;
    if (['APPROVED', 'REJECTED', 'EXPIRED'].includes(quote.status) || (quote.status === 'SUBMITTED' && quote.commercialSnapshot?.version > snapshot.version)) {
      await Quote.updateOne({ _id: quote._id, 'creationEffects.hash': effect.hash, 'creationEffects.state': { $in: pendingStates } }, { $set: { 'creationEffects.state': 'SUPERSEDED', 'creationEffects.completedAt': new Date() } });
      return { handled: true, state: 'SUPERSEDED' };
    }
    if (quote.status !== 'SUBMITTED' || quote.commercialSnapshot?.version !== snapshot.version || Number(quote.pricingBreakdown?.totalAmount) !== snapshot.totalAmount || quote.serviceName !== snapshot.serviceName) throw conflict();
    assertCommercialSnapshot(quote);
    if (snapshot.opportunityId) await Opportunity.updateOne({ _id: snapshot.opportunityId, vendor: snapshot.vendorId, status: { $in: ['NEW', 'VIEWED'] } }, { $set: { status: 'RESPONDED', action: 'Quote Sent' } });
    const { recordLifecycleEventMessage } = await import('../../customer/services/circle.service.js');
    await recordLifecycleEventMessage({
      vendorId: snapshot.vendorId, customerId: snapshot.customerId, opportunityId: snapshot.opportunityId, quoteId: snapshot.quoteId,
      sender: 'SYSTEM', senderName: 'STARVNT', type: 'quote', serviceName: snapshot.serviceName, strict: true,
      text: `📄 Quote Received: Quotation ${snapshot.quoteReference}, version ${snapshot.version}, for ${snapshot.serviceName} — Total ₹${Number(snapshot.totalAmount).toLocaleString('en-IN')}. Review the saved quotation and its approved payment terms.`,
      metadata: { type: 'quote', quoteId: snapshot.quoteId, commercialVersion: snapshot.version, sourceHash: effect.hash },
    });
    await Quote.updateOne({ _id: quote._id, 'creationEffects.hash': effect.hash, 'creationEffects.state': { $in: pendingStates } }, { $set: { 'creationEffects.state': 'COMPLETED', 'creationEffects.completedAt': new Date() } });
    return { handled: true, state: 'COMPLETED' };
  } catch (error) {
    if (['QUOTE_CREATION_EVIDENCE_CONFLICT', 'LIFECYCLE_CONTEXT_AMBIGUOUS', 'LIFECYCLE_CONTEXT_CHANGED', 'LIFECYCLE_THREAD_BLOCKED', 'LIFECYCLE_CUSTOMER_UNAVAILABLE'].includes(error.message)) throw error;
    throw new Error('QUOTE_CREATION_EFFECTS_UNAVAILABLE');
  }
}

export async function queuePendingQuoteCreationEffects({ limit = 25 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('INVALID_QUOTE_EFFECT_SCAN_LIMIT');
  const rows = await Quote.find({ 'creationEffects.state': 'PENDING' }).select('_id vendor customer opportunity quoteReference +creationEffects').sort({ 'creationEffects.lastQueueAttemptAt': 1, createdAt: 1, _id: 1 }).limit(limit);
  const failures = [];
  let queued = 0;
  for (const row of rows) {
    try { await enqueueQuoteCreationEffects(row, { process: false }); queued++; }
    catch {
      await Quote.updateOne({ _id: row._id, 'creationEffects.state': 'PENDING' }, { $set: { 'creationEffects.lastQueueAttemptAt': new Date() } }).catch(() => {});
      failures.push({ quoteId: String(row._id), code: 'QUOTE_CREATION_QUEUE_REQUIRES_REVIEW' });
    }
  }
  return { scanned: rows.length, queued, failures };
}

export async function reconcileQuoteCreationEffects(quote) {
  if (!quote.creationEffects) return false;
  try { await enqueueQuoteCreationEffects(quote); }
  catch { console.warn('[quote-creation] effect reconciliation deferred'); }
  return true;
}
