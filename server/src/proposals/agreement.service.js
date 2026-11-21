import { Quote } from '../external/models/Quote.js';
import { isQuoteExpired } from '../external/services/quoteStateMachine.service.js';
import { normalizeCategory } from '../customer/services/planCatalog.js';
import { notifyVendor } from '../notifications/notification.service.js';
import { recordBusinessAudit } from '../admin/utils/audit.js';
import { EventManifest, VendorAgreement } from './models.js';
import { proposalError, rupees } from './utils.js';

const EDITABLE = ['DRAFT', 'REVISION_REQUESTED'];

function cleanScope(scope = {}) {
  const list = (v) => (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 50);
  return {
    summary: String(scope.summary || '').slice(0, 1000),
    lineItems: (Array.isArray(scope.lineItems) ? scope.lineItems : []).slice(0, 100).map((li) => ({
      name: String(li.name || '').slice(0, 200),
      quantity: Math.max(0, Number(li.quantity) || 1),
      unit: String(li.unit || '').slice(0, 40),
      unitPrice: Math.max(0, rupees(li.unitPrice)),
      notes: String(li.notes || '').slice(0, 300),
    })).filter((li) => li.name),
    deliverables: list(scope.deliverables),
    exclusions: list(scope.exclusions),
    setupRequirements: String(scope.setupRequirements || '').slice(0, 1000),
  };
}

async function transition(agreement, to, { actor, reason }) {
  const from = agreement.status;
  const updated = await VendorAgreement.findOneAndUpdate(
    { _id: agreement._id, status: from },
    { $set: { status: to }, $push: { history: { from, to, by: String(actor), at: new Date(), reason } } },
    { new: true }
  );
  if (!updated) throw proposalError('AGREEMENT_STATE_CHANGED', 'The agreement changed while this action was running. Reload and retry.');
  await recordBusinessAudit({ actorId: String(actor), actorType: 'ADMIN', action: `AGREEMENT_${to}`, resourceType: 'VendorAgreement', resourceId: String(agreement._id), referenceId: String(agreement.event), fromState: from, toState: to, why: reason, source: 'PROPOSAL_STUDIO' });
  return updated;
}

/** True when the agreement can count toward the generation gate right now. */
export function agreementIsValid(agreement, now = new Date()) {
  if (agreement?.status !== 'APPROVED') return false;
  return !agreement.terms?.validUntil || new Date(agreement.terms.validUntil) > now;
}

export function agreementInvalidReason(agreement, now = new Date()) {
  if (!agreement) return 'missing';
  if (agreement.status === 'APPROVED' && !agreementIsValid(agreement, now)) return 'expired';
  return { DRAFT: 'not_sent', SENT: 'pending', REVISION_REQUESTED: 'revision_requested', REJECTED: 'rejected', EXPIRED: 'expired', SUPERSEDED: 'superseded' }[agreement.status] || null;
}

export async function createAgreementFromQuote({ quoteId, manifestId, category, mandatory, scope, terms }, { actor }) {
  const [quote, manifest] = await Promise.all([Quote.findById(quoteId), EventManifest.findById(manifestId).lean()]);
  if (!quote) throw proposalError('QUOTE_NOT_FOUND', 'Quote not found.', 404);
  if (!manifest) throw proposalError('MANIFEST_NOT_FOUND', 'Manifest not found.', 404);
  if (manifest.status !== 'FROZEN') throw proposalError('MANIFEST_NOT_FROZEN', 'Freeze the event manifest before preparing agreements.');
  if (!['SUBMITTED', 'APPROVED'].includes(quote.status) || isQuoteExpired(quote)) {
    throw proposalError('QUOTE_NOT_USABLE', 'Only a current submitted or accepted quote can become an agreement.');
  }
  if (String(quote.customer) !== String(manifest.customer)) throw proposalError('QUOTE_CUSTOMER_MISMATCH', 'This quote belongs to a different customer.');

  const resolvedCategory = normalizeCategory(category || quote.category || quote.serviceName);
  if (!resolvedCategory) throw proposalError('CATEGORY_REQUIRED', 'Choose the service category for this agreement.', 400);
  const requirement = manifest.requirements.find((r) => r.category === resolvedCategory);
  if (!requirement || requirement.status === 'customer_provided') {
    throw proposalError('CATEGORY_NOT_IN_MANIFEST', 'This service is not part of the frozen event manifest.');
  }
  const open = await VendorAgreement.exists({ event: manifest.event, category: resolvedCategory, status: { $in: ['DRAFT', 'SENT', 'APPROVED', 'REVISION_REQUESTED'] } });
  if (open) throw proposalError('AGREEMENT_ALREADY_OPEN', 'An agreement for this service is already in progress. Revise it instead.');

  const pb = quote.pricingBreakdown || {};
  const agreement = await VendorAgreement.create({
    event: manifest.event,
    customer: manifest.customer,
    manifest: manifest._id,
    vendor: quote.vendor,
    quote: quote._id,
    category: resolvedCategory,
    mandatory: mandatory ?? requirement.mandatory,
    scope: cleanScope({ summary: quote.notes || quote.serviceName, ...scope }),
    pricing: { subtotal: rupees(pb.totalAmount), tax: 0, total: rupees(pb.totalAmount) },
    terms: {
      paymentTerms: terms?.paymentTerms || '',
      cancellation: terms?.cancellation || '',
      validUntil: terms?.validUntil ? new Date(terms.validUntil) : quote.validUntil || null,
    },
    history: [{ from: 'NONE', to: 'DRAFT', by: String(actor), reason: `Drafted from quote ${quote.quoteReference || quote._id}` }],
    createdBy: String(actor),
  });
  await recordBusinessAudit({ actorId: String(actor), actorType: 'ADMIN', action: 'AGREEMENT_DRAFTED', resourceType: 'VendorAgreement', resourceId: String(agreement._id), referenceId: String(manifest.event), toState: 'DRAFT', why: 'Agreement drafted from vendor quote', source: 'PROPOSAL_STUDIO' });
  return agreement;
}

export async function updateAgreementDraft(agreementId, { scope, pricing, terms, mandatory }, { actor }) {
  const agreement = await VendorAgreement.findById(agreementId);
  if (!agreement) throw proposalError('AGREEMENT_NOT_FOUND', 'Agreement not found.', 404);
  if (!EDITABLE.includes(agreement.status)) throw proposalError('AGREEMENT_NOT_EDITABLE', 'Only a draft agreement can be edited. Create a revision instead.');
  if (scope) agreement.scope = cleanScope(scope);
  if (pricing) {
    const subtotal = rupees(pricing.subtotal ?? agreement.pricing.subtotal), tax = rupees(pricing.tax ?? agreement.pricing.tax);
    agreement.pricing = { subtotal, tax, total: subtotal + tax };
  }
  if (terms) agreement.terms = { ...agreement.terms.toObject?.() ?? agreement.terms, ...terms, validUntil: terms.validUntil ? new Date(terms.validUntil) : agreement.terms.validUntil };
  if (typeof mandatory === 'boolean') agreement.mandatory = mandatory;
  agreement.history.push({ from: agreement.status, to: agreement.status, by: String(actor), reason: 'Draft edited' });
  await agreement.save();
  return agreement;
}

export async function sendAgreement(agreementId, { actor }) {
  const agreement = await VendorAgreement.findById(agreementId);
  if (!agreement) throw proposalError('AGREEMENT_NOT_FOUND', 'Agreement not found.', 404);
  if (!EDITABLE.includes(agreement.status)) throw proposalError('AGREEMENT_NOT_SENDABLE', 'Only a draft agreement can be sent.');
  if (!agreement.terms?.validUntil || new Date(agreement.terms.validUntil) <= new Date()) {
    throw proposalError('AGREEMENT_VALIDITY_REQUIRED', 'Set a future validity date before sending.', 400);
  }
  if (!agreement.pricing?.total) throw proposalError('AGREEMENT_PRICE_REQUIRED', 'The agreement needs a price.', 400);
  const sent = await transition(agreement, 'SENT', { actor, reason: 'Sent to vendor for approval' });
  sent.sentAt = new Date();
  await sent.save();
  await notifyVendor({
    vendorId: agreement.vendor,
    type: 'AGREEMENT',
    priority: 'HIGH',
    title: 'Agreement requires your approval',
    message: `Please review and approve the ${agreement.category} agreement for an upcoming STARVNT event.`,
    link: `/vendor/proposal-agreements`,
    idempotencyKey: `agreement-sent-${agreement._id}-${agreement.version}`,
  }).catch(() => null);
  return sent;
}

export async function vendorDecideAgreement(agreementId, vendorId, { decision, note = '' }, { actor }) {
  const agreement = await VendorAgreement.findOne({ _id: agreementId, vendor: vendorId });
  if (!agreement) throw proposalError('AGREEMENT_NOT_FOUND', 'Agreement not found.', 404);
  if (agreement.status !== 'SENT') throw proposalError('AGREEMENT_NOT_AWAITING_VENDOR', 'This agreement is not awaiting your decision.');
  if (agreement.terms?.validUntil && new Date(agreement.terms.validUntil) <= new Date()) {
    await transition(agreement, 'EXPIRED', { actor: 'SYSTEM', reason: 'Validity ended before vendor decision' });
    throw proposalError('AGREEMENT_EXPIRED', 'This agreement has expired.');
  }
  const to = { APPROVE: 'APPROVED', REJECT: 'REJECTED', REQUEST_REVISION: 'REVISION_REQUESTED' }[decision];
  if (!to) throw proposalError('INVALID_DECISION', 'Decision must be APPROVE, REJECT or REQUEST_REVISION.', 400);
  const updated = await transition(agreement, to, { actor, reason: note || `Vendor ${decision.toLowerCase()}` });
  updated.vendorDecision = { by: String(actor), at: new Date(), note: String(note).slice(0, 1000) };
  await updated.save();
  return updated;
}

/** New editable version; the old one is SUPERSEDED but preserved with its history. */
export async function reviseAgreement(agreementId, { actor, reason = 'Revision' }) {
  const current = await VendorAgreement.findById(agreementId);
  if (!current) throw proposalError('AGREEMENT_NOT_FOUND', 'Agreement not found.', 404);
  if (['DRAFT', 'SUPERSEDED'].includes(current.status)) throw proposalError('AGREEMENT_NOT_REVISABLE', 'This agreement cannot be revised.');
  const base = current.toObject();
  delete base._id; delete base.createdAt; delete base.updatedAt; delete base.__v;
  const next = await VendorAgreement.create({
    ...base,
    version: current.version + 1,
    supersedes: current._id,
    supersededBy: null,
    status: 'DRAFT',
    sentAt: null,
    vendorDecision: {},
    history: [{ from: 'NONE', to: 'DRAFT', by: String(actor), reason: `Revision of v${current.version}: ${reason}` }],
    createdBy: String(actor),
  });
  await transition(current, 'SUPERSEDED', { actor, reason: `Superseded by v${next.version}` });
  await VendorAgreement.updateOne({ _id: current._id }, { $set: { supersededBy: next._id } });
  return next;
}

export async function expireStaleAgreements({ now = new Date() } = {}) {
  const result = await VendorAgreement.updateMany(
    { status: { $in: ['SENT', 'APPROVED'] }, 'terms.validUntil': { $lte: now } },
    { $set: { status: 'EXPIRED' }, $push: { history: { from: 'OPEN', to: 'EXPIRED', by: 'SYSTEM', at: now, reason: 'Agreement validity ended' } } }
  );
  return { expired: result.modifiedCount };
}

/** Latest non-superseded agreement per category for an event. */
export async function currentAgreements(eventId) {
  const all = await VendorAgreement.find({ event: eventId, status: { $ne: 'SUPERSEDED' } }).sort({ version: -1 }).lean();
  const byCategory = new Map();
  for (const a of all) if (!byCategory.has(a.category)) byCategory.set(a.category, a);
  return [...byCategory.values()];
}

/** Vendor-safe projection: no other vendors, no customer price, no STARVNT margin. */
export function agreementForVendor(a) {
  return {
    id: a._id, category: a.category, version: a.version, status: a.status,
    scope: a.scope, pricing: a.pricing, terms: a.terms, sentAt: a.sentAt, vendorDecision: a.vendorDecision,
  };
}
