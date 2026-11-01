import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { CustomerEvent, EventRequirement } from '../customer/models/index.js';
import { Opportunity } from '../external/models/Opportunity.js';
import { Quote } from '../external/models/Quote.js';
import { evaluateVendorActivation } from '../external/services/vendorActivation.service.js';
import { normalizeCategory } from '../customer/services/planCatalog.js';
import { notifyCustomer, notifyVendor } from '../notifications/notification.service.js';
import { withVendorSchedule } from '../external/services/scheduleLock.js';
import { badRequest, conflict, notFound } from '../customer/utils/http.js';
import { ProposalDossier, ProposalDocument, ProposalDocumentAccess } from './models.js';
import { cleanDraft, customerVersion, generationGate, hash, scopeHash, text } from './policy.js';
import { renderProposal } from './pdf.js';

const id = value => String(value?._id || value || '');
const validId = value => { if (!mongoose.isValidObjectId(value)) throw notFound(); return value; };
const future = value => { const d = new Date(value); if (!Number.isFinite(+d) || d <= new Date() || d > new Date(Date.now() + 90 * 86400000)) throw badRequest('INVALID_EXPIRY', 'Choose an expiry within the next 90 days.'); return d.toISOString(); };
const audit = (actor, action, details = {}) => ({ id: crypto.randomUUID(), actor: id(actor.id), role: actor.role, action, at: new Date().toISOString(), ...details });

export async function getSource(eventId, customerId = null) {
  const event = await CustomerEvent.findOne({ _id: validId(eventId), ...(customerId ? { customer: customerId } : {}) }).lean();
  if (!event) throw notFound('Event not found');
  const requirements = await EventRequirement.find({ event: event._id }).sort({ category: 1 }).lean();
  const opportunities = await Opportunity.find({ customerEvent: event._id, customer: event.customer }).select('_id').lean();
  const quoteRows = await Quote.find({ customer: event.customer, opportunity: { $in: opportunities.map(o => o._id) } }).sort({ _id: 1 }).limit(101).lean();
  if (quoteRows.length > 100) throw conflict('PROPOSAL_SOURCE_LIMIT', 'Please ask STARVNT to archive superseded vendor quotations.');
  const eligibility = new Map(await Promise.all([...new Set(quoteRows.map(q => id(q.vendor)))].map(async vendorId => [vendorId, (await evaluateVendorActivation(vendorId))?.matchingEligible === true])));
  const quotes = quoteRows.map(q => ({ _id: id(q), vendor: id(q.vendor), vendorEligible: eligibility.get(id(q.vendor)), category: normalizeCategory(q.category) || q.category, serviceName: q.serviceName, status: q.status, eventDate: q.eventDate, validUntil: q.validUntil, pricingBreakdown: q.pricingBreakdown, notes: q.notes, updatedAt: q.updatedAt }));
  // Only explicit business data participates. AuraContext is never promoted here.
  const manifest = {
    id: id(event), title: event.title, eventType: event.eventType, customType: event.customType,
    eventDate: event.eventDate, city: event.city, guestCount: event.guestCount, budget: event.budget,
    location: event.location, status: event.status, specialRequirements: event.specialRequirements,
    notes: event.notes,
  };
  const scope = requirements.map(r => ({ id: id(r), category: r.category, status: r.status, providedValue: r.providedValue, preferences: r.preferences, serviceLocation: r.serviceLocation, specialRequirements: r.specialRequirements, selectedOptionId: r.selectedOptionId }));
  return { event: manifest, customer: id(event.customer), requirements: scope, quotes, hash: hash({ event: manifest, requirements: scope, quotes }) };
}

async function dossierFor(source) {
  return ProposalDossier.findOneAndUpdate({ event: source.event.id }, { $setOnInsert: { customer: source.customer } }, { new: true, upsert: true });
}

// The shared distributed lock namespace is prefixed to avoid vendor schedule collisions.
async function mutate(eventId, actor, revision, work) {
  return withVendorSchedule(`proposal:${validId(eventId)}`, async lease => {
    const source = await getSource(eventId);
    const row = await dossierFor(source);
    if (Number(revision) !== row.revision) throw conflict('STALE_REVISION', 'This proposal changed. Refresh and try again.');
    if (row.audit.length >= 4000) throw conflict('PROPOSAL_HISTORY_LIMIT', 'Please contact support to archive this proposal history.');
    const change = await work(source, row);
    await lease();
    const saved = await ProposalDossier.findOneAndUpdate({ _id: row._id, revision: row.revision }, { $set: change, $inc: { revision: 1 }, $push: { audit: audit(actor, change._action || 'UPDATED', { fromRevision: row.revision, toRevision: row.revision + 1 }) } }, { new: true, runValidators: true, strict: true });
    if (!saved) throw conflict('STALE_REVISION', 'This proposal changed. Refresh and try again.');
    return saved;
  });
}

export async function customerWorkspace(customerId, eventId) {
  const source = await getSource(eventId, customerId);
  const row = await ProposalDossier.findOne({ event: eventId }).lean();
  const gate = generationGate(source, row || {});
  const versions = (row?.versions || []).filter(v => v.deliveredAt).map((v, i, all) => ({ ...customerVersion(v), current: i === all.length - 1 && v.sourceHash === source.hash && v.draftHash === hash(row.draft) && new Date(v.expiresAt) > new Date() && gate.ready })).reverse();
  return {
    event: source.event, requirements: source.requirements, revision: row?.revision || 0,
    readiness: { ready: gate.ready, blockers: [...new Set(gate.blockers.map(b => /commercial/i.test(b) ? 'STARVNT commercial review is pending.' : b.includes('Reconcile') || b.includes('allocation') ? 'STARVNT is reviewing your customer pricing and payment terms.' : b.includes('authorized visual') ? 'Your proposal visuals are being selected.' : b.includes('Every applicable') ? 'Vendor scope confirmations are pending.' : b))], approvedAgreements: gate.approvedAgreements, requiredServices: gate.requiredServices },
    preview: { label: 'PRELIMINARY — NOT A FINAL APPROVED PROPOSAL', theme: row?.draft?.theme || 'Your event vision', introduction: row?.draft?.introduction || '', assets: (row?.draft?.assets || []).map(({ url, caption, source, category }) => ({ url, caption, source, category })) },
    versions,
    changes: (row?.changes || []).map(c => ({ id: c.id, versionId: c.versionId, message: c.message, categories: c.categories, status: c.status, createdAt: c.createdAt })),
  };
}

export async function adminWorkspace(eventId) {
  const source = await getSource(eventId);
  const row = await dossierFor(source);
  const access = await ProposalDocumentAccess.find({ dossier: row._id }).sort({ createdAt: -1 }).limit(100).lean();
  return { source, dossier: row.toObject(), access, readiness: generationGate(source, row) };
}

export async function saveDraft(eventId, actor, input = {}) {
  const draft = cleanDraft(input.draft);
  return mutate(eventId, actor, input.revision, async () => ({ draft, commercial: null, _action: 'DRAFT_REVISED' }));
}

export async function sendAgreement(eventId, actor, input = {}) {
  const saved = await mutate(eventId, actor, input.revision, async (source, row) => {
    if (row.agreements.length >= 100) throw conflict('PROPOSAL_HISTORY_LIMIT', 'Please contact support to archive the agreement history.');
    const quote = source.quotes.find(q => q._id === input.quoteId && ['SUBMITTED', 'APPROVED'].includes(q.status) && q.eventDate === source.event.eventDate && new Date(q.validUntil) > new Date());
    if (!quote || !quote.vendorEligible || !source.requirements.some(r => r.category === quote.category)) throw badRequest('INVALID_QUOTATION', 'Choose a current vendor quotation for a required service in this event.');
    const allocation = row.draft.allocations?.find(a => a.category === quote.category);
    if (!allocation) throw badRequest('SAVE_SCOPE_FIRST', 'Save the customer service scope before sending its vendor agreement.');
    if (!text(input.terms, 6000)) throw badRequest('AGREEMENT_TERMS_REQUIRED', 'Record the service scope, deliverables, payment and cancellation terms.');
    const agreements = row.agreements.map(a => a.quoteId === quote._id && a.status !== 'SUPERSEDED' ? { ...a, previousStatus: a.status, status: 'SUPERSEDED' } : a);
    agreements.push({ id: crypto.randomUUID(), quoteId: quote._id, vendorId: quote.vendor, category: quote.category, serviceName: quote.serviceName, vendorCost: quote.pricingBreakdown.totalAmount, customerScope: { scope: allocation.scope, quantity: allocation.quantity, deliverables: allocation.deliverables }, scopeHash: scopeHash(allocation), terms: text(input.terms, 6000), expiresAt: future(input.expiresAt), sourceHash: source.hash, status: 'SENT', sentAt: new Date().toISOString(), sentBy: id(actor.id) });
    return { agreements, commercial: null, _action: 'AGREEMENT_SENT' };
  });
  const agreement = saved.agreements.at(-1);
  await notifyVendor({ vendorId: agreement.vendorId, type: 'SYSTEM', title: 'An event agreement is ready to review', message: agreement.serviceName, link: '/vendor/proposal-agreements', idempotencyKey: `proposal-agreement:${agreement.id}` });
  return saved;
}

export async function vendorAgreements(vendorId) {
  const rows = await ProposalDossier.find({ 'agreements.vendorId': id(vendorId) }).sort({ updatedAt: -1 }).limit(100).lean();
  return { agreements: rows.flatMap(row => row.agreements.filter(a => a.vendorId === id(vendorId) && a.status !== 'SUPERSEDED').map(a => ({ ...a, eventId: id(row.event), revision: row.revision }))) };
}

export async function decideAgreement(vendorId, eventId, actor, input = {}) {
  if (!['APPROVED', 'REJECTED', 'REVISION_REQUESTED'].includes(input.decision)) throw badRequest('INVALID_DECISION', 'Choose approve, reject or request revision.');
  return mutate(eventId, actor, input.revision, async (source, row) => {
    const a = row.agreements.find(a => a.id === input.agreementId && a.vendorId === id(vendorId));
    if (!a) throw notFound();
    if (a.status !== 'SENT' || a.sourceHash !== source.hash || a.scopeHash !== scopeHash(row.draft.allocations?.find(d => d.category === a.category)) || new Date(a.expiresAt) <= new Date()) throw conflict('AGREEMENT_NOT_CURRENT', 'This agreement changed or expired. Ask STARVNT for a revised agreement.');
    const agreements = row.agreements.map(a => a.id === input.agreementId ? { ...a, status: input.decision, decidedBy: id(actor.id), decidedAt: new Date().toISOString(), decisionNote: text(input.note, 1000) } : a);
    return { agreements, commercial: null, _action: `VENDOR_AGREEMENT_${input.decision}` };
  });
}

export async function approveCommercial(eventId, actor, input = {}) {
  return mutate(eventId, actor, input.revision, async (source, row) => {
    const commercial = { status: 'APPROVED', sourceHash: source.hash, draftHash: hash(row.draft), approvedBy: id(actor.id), approvedAt: new Date().toISOString(), expiresAt: future(input.expiresAt), note: text(input.note, 2000) };
    const gate = generationGate(source, { ...row.toObject(), commercial });
    if (!gate.ready) throw conflict('PROPOSAL_NOT_READY', 'Resolve the proposal readiness checks first.', { blockers: gate.blockers });
    return { commercial, _action: 'COMMERCIAL_APPROVED' };
  });
}

export async function generate(eventId, actor, input = {}) {
  const key = text(input.idempotencyKey, 160);
  if (!key) throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'A generation request identifier is required.');
  // Retry the exact completed request even when its prior revision is now old.
  const previous = await ProposalDossier.findOne({ event: validId(eventId), 'versions.idempotencyKey': key }).lean();
  if (previous) return customerVersion(previous.versions.find(v => v.idempotencyKey === key));
  let generated;
  await mutate(eventId, actor, input.revision, async (source, row) => {
    if (row.versions.length >= 50) throw conflict('PROPOSAL_HISTORY_LIMIT', 'Please contact support to archive the version history.');
    const existing = row.versions.find(v => v.idempotencyKey === key);
    if (existing) { generated = existing; return {}; }
    const gate = generationGate(source, row);
    if (!gate.ready) throw conflict('PROPOSAL_NOT_READY', 'Final generation is blocked.', { blockers: gate.blockers });
    const d = row.draft;
    const snapshot = { event: source.event, requirements: source.requirements, theme: d.theme, introduction: d.introduction, allocations: d.allocations, total: d.total, paymentTerms: d.paymentTerms, exclusions: d.exclusions, roadmap: d.roadmap, assets: d.assets.map(({ url, caption, source, category }) => ({ url, caption, source, category })) };
    if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > 100000) throw badRequest('PROPOSAL_TOO_LARGE', 'Please shorten the proposal descriptions before generation.');
    generated = { id: crypto.randomUUID(), number: row.versions.length + 1, status: 'SENT_TO_CUSTOMER', sourceHash: source.hash, draftHash: hash(d), agreementReferences: row.agreements.filter(a => a.status === 'APPROVED' && a.sourceHash === source.hash).map(a => a.id), commercialReference: row.commercial.approvedAt, snapshot, createdAt: new Date().toISOString(), deliveredAt: new Date().toISOString(), expiresAt: row.commercial.expiresAt, idempotencyKey: key };
    const approvedAgreements = row.agreements.filter(a => generated.agreementReferences.includes(a.id));
    generated.expiresAt = new Date(Math.min(+new Date(row.commercial.expiresAt), ...approvedAgreements.map(a => +new Date(a.expiresAt)), ...source.quotes.filter(q => approvedAgreements.some(a => a.quoteId === q._id)).map(q => +new Date(q.validUntil)))).toISOString();
    const bytes = await renderProposal(snapshot, generated);
    if (bytes.length > 8 * 1024 * 1024) throw badRequest('DOCUMENT_TOO_LARGE', 'Optimize the proposal images before generating.');
    // Revalidate actual business state after rendering, before publishing.
    const latest = await getSource(eventId);
    if (latest.hash !== source.hash || !generationGate(latest, row).ready) throw conflict('SOURCE_CHANGED', 'The source changed during generation. Refresh and obtain renewed approvals.');
    generated.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    generated.approvalEvidence = { commercial: row.commercial, agreements: row.agreements.filter(a => generated.agreementReferences.includes(a.id)) };
    await ProposalDocument.create({ dossier: row._id, versionId: generated.id, sha256: generated.sha256, bytes });
    return { versions: [...row.versions, generated], changes: row.changes.map(c => c.status === 'OPEN' ? { ...c, status: 'REVISED_PROPOSAL_ISSUED', resolvedByVersion: generated.id } : c), _action: 'FINAL_GENERATED_AND_DELIVERED' };
  });
  await notifyCustomer({ customerId: (await getSource(eventId)).customer, eventId, type: 'proposal', title: 'Your event proposal is ready', body: `Version ${generated.number} is ready to review.`, actionUrl: `/customer/events/${eventId}/proposal`, idempotencyKey: `proposal:${generated.id}` });
  return customerVersion(generated);
}

function currentVersion(source, row, versionId) {
  const latest = row.versions.at(-1);
  const version = row.versions.find(v => v.id === versionId && v.deliveredAt);
  if (!version) throw notFound();
  if (latest.id !== versionId || version.sourceHash !== source.hash || version.draftHash !== hash(row.draft) || new Date(version.expiresAt) <= new Date() || !generationGate(source, row).ready) throw conflict('VERSION_NOT_CURRENT', 'A newer proposal or renewed approval is required. Refresh your proposal.');
  return version;
}

export async function customerDecision(customerId, eventId, input = {}) {
  await getSource(eventId, customerId);
  if (!['CUSTOMER_APPROVED', 'CUSTOMER_DECLINED', 'CHANGE_REQUESTED'].includes(input.decision)) throw badRequest('INVALID_DECISION', 'Choose approve, decline or request changes.');
  return mutate(eventId, { id: customerId, role: 'CUSTOMER' }, input.revision, async (source, row) => {
    const v = currentVersion(source, row, input.versionId);
    if (['CUSTOMER_APPROVED', 'CUSTOMER_DECLINED', 'CHANGE_REQUESTED'].includes(v.status)) throw conflict('DECISION_RECORDED', 'A decision has already been recorded for this version.');
    if (input.decision === 'CHANGE_REQUESTED' && !text(input.message, 3000)) throw badRequest('CHANGE_DETAIL_REQUIRED', 'Describe the changes you would like.');
    if (input.decision === 'CHANGE_REQUESTED' && row.changes.length >= 200) throw conflict('PROPOSAL_HISTORY_LIMIT', 'Please contact support to archive the change history.');
    const at = new Date().toISOString();
    const changes = input.decision === 'CHANGE_REQUESTED' ? [...row.changes, { id: crypto.randomUUID(), versionId: v.id, message: text(input.message, 3000), categories: (Array.isArray(input.categories) ? input.categories : []).map(c => text(c, 80)).filter(c => source.requirements.some(r => r.category === c)), status: 'OPEN', customer: id(customerId), createdAt: at }] : row.changes;
    return { versions: row.versions.map(v => v.id === input.versionId ? { ...v, status: input.decision, decisionAt: at, decidedBy: id(customerId) } : v), changes, ...(input.decision === 'CHANGE_REQUESTED' ? { commercial: null } : {}), _action: input.decision };
  });
}

export async function download(customerId, eventId, versionId) {
  await getSource(eventId, customerId);
  const row = await ProposalDossier.findOne({ event: eventId }).lean();
  if (!row?.versions.some(v => v.id === versionId && v.deliveredAt)) throw notFound();
  const doc = await ProposalDocument.findOne({ dossier: row._id, versionId }).select('+bytes').lean();
  if (!doc) throw notFound('Document not available. Please contact STARVNT.');
  const bytes = Buffer.isBuffer(doc.bytes) ? doc.bytes : Buffer.from(doc.bytes.buffer);
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== doc.sha256) throw conflict('DOCUMENT_INTEGRITY_ERROR', 'This document could not be verified. Please contact STARVNT.');
  await ProposalDocumentAccess.create({ dossier: row._id, versionId, customer: customerId });
  return bytes;
}

export async function explain(customerId, eventId, question) {
  const source = await getSource(eventId, customerId);
  const row = await ProposalDossier.findOne({ event: eventId }).lean();
  const v = row?.versions.at(-1);
  if (!v || v.status === 'CHANGE_REQUESTED') return { answer: 'There is no current approved proposal to explain. Review the pending steps with STARVNT.', versionId: null };
  try { currentVersion(source, row, v.id); } catch { return { answer: 'This proposal needs renewed approval. Please review the pending steps with STARVNT.', versionId: null }; }
  const s = v.snapshot;
  const q = text(question, 1000).toLowerCase();
  const included = s.allocations.map(a => `${a.category}: ${a.scope}. ${a.deliverables || ''}`).join('\n');
  let answer = included;
  if (/pay|schedule|advance/.test(q)) answer = s.paymentTerms;
  else if (/exclu|not included/.test(q)) answer = s.exclusions;
  else if (/budget|price|total|cost/.test(q)) answer = `Approved customer package: INR ${s.total.toLocaleString('en-IN')}.\n${s.allocations.map(a => `${a.category}: INR ${a.amount.toLocaleString('en-IN')}`).join('\n')}`;
  else if (/change|add|replace|remove|modify/.test(q)) answer = 'Use Request changes to record your request against this proposal version. STARVNT will validate the scope, vendor agreements and pricing before issuing a new version.';
  else { const match = s.allocations.filter(a => q.includes(a.category.toLowerCase())); if (match.length) answer = match.map(a => `${a.category}: ${a.scope}. ${a.deliverables || ''}`).join('\n'); }
  return { answer, versionId: v.id, version: v.number, source: 'APPROVED_PROPOSAL_SNAPSHOT', notice: 'Proposal approval does not confirm a booking or verify payment.' };
}
