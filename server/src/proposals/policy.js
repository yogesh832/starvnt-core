import crypto from 'node:crypto';
import { isValidISODate, todayISO } from '../customer/services/dates.js';
import { badRequest } from '../customer/utils/http.js';

export const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sourceLabel = {
  portfolio: 'Actual Approved Portfolio', vendor: 'Vendor-Submitted Reference',
  customer: 'Customer-Provided Reference', ai: 'AI-Generated Concept', reference: 'Illustrative Reference',
};
export const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
export const scopeHash = a => hash(a ? { category: a.category, scope: a.scope, quantity: a.quantity, deliverables: a.deliverables } : null);
export const cents = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e9 && Math.abs(value * 100 - Math.round(value * 100)) < .0001 ? Math.round(value * 100) : null;
export function cleanDraft(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw badRequest('INVALID_DRAFT', 'Enter a proposal draft.');
  const allocations = Array.isArray(input.allocations) ? input.allocations : [];
  const assets = Array.isArray(input.assets) ? input.assets : [];
  if (allocations.length > 30 || assets.length > 12) throw badRequest('TOO_MANY_ITEMS', 'Use at most 30 services and 12 images.');
  const draft = {
    theme: text(input.theme || 'Soft Ivory Editorial', 80),
    introduction: text(input.introduction, 1600),
    allocations: allocations.map(a => {
      if (!text(a.category, 80) || !text(a.scope, 1800) || cents(a.amount) === null || !Number.isFinite(a.quantity) || a.quantity <= 0 || a.quantity > 100000) throw badRequest('INVALID_ALLOCATION', 'Every service needs category, scope, positive quantity and a valid customer price.');
      return { category: text(a.category, 80), scope: text(a.scope, 1800), quantity: a.quantity, amount: a.amount, deliverables: text(a.deliverables, 1800) };
    }),
    total: input.total,
    paymentTerms: text(input.paymentTerms, 3000),
    exclusions: text(input.exclusions, 3000),
    roadmap: text(input.roadmap, 3000),
    assets: assets.map(a => {
      if (!sourceLabel[a.source] || !text(a.caption, 300) || !text(a.rights, 500)) throw badRequest('ASSET_PROVENANCE_REQUIRED', 'Each image needs its source, caption and permission or license reference.');
      let url;
      try { url = new URL(a.url); } catch { throw badRequest('INVALID_IMAGE', 'Choose an uploaded PNG or JPEG.'); }
      // No arbitrary server-side URL fetch: only the existing image storage host.
      if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.username || url.password || url.port || !/\/image\/upload\//.test(url.pathname) || !/\.(png|jpe?g)$/i.test(url.pathname)) throw badRequest('INVALID_IMAGE', 'Choose a PNG or JPEG from STARVNT image storage.');
      return { url: url.href, source: a.source, caption: text(a.caption, 300), rights: text(a.rights, 500), category: text(a.category, 80) };
    }),
  };
  if (cents(draft.total) === null) throw badRequest('INVALID_TOTAL', 'Enter a valid customer package total.');
  if (new Set(draft.allocations.map(a => a.category)).size !== draft.allocations.length) throw badRequest('DUPLICATE_CATEGORY', 'Combine each service category into one approved scope.');
  return draft;
}

export function generationGate(source, dossier = {}, now = new Date()) {
  const blockers = [];
  const event = source.event || {};
  if (!event.eventType || (!isValidISODate(event.eventDate) || event.eventDate < todayISO(now)) || !event.city || !event.location?.venueName || !(event.guestCount > 0) || !(event.budget > 0) || ['draft', 'cancelled', 'completed'].includes(event.status)) blockers.push('Complete the event type, date, city, venue, guest count and budget for an active event.');
  if (!source.requirements.length) blockers.push('Confirm the services required for this event.');
  const required = source.requirements.filter(r => !['customer_provided', 'completed'].includes(r.status));
  const currentAgreements = (dossier.agreements || []).filter(a => a.sourceHash === source.hash && a.scopeHash === scopeHash((dossier.draft?.allocations || []).find(d => d.category === a.category)) && a.status === 'APPROVED' && new Date(a.expiresAt) > now && source.quotes.some(q => String(q._id) === a.quoteId && q.vendor === a.vendorId && q.vendorEligible && ['SUBMITTED', 'APPROVED'].includes(q.status) && new Date(q.validUntil) > now));
  for (const r of required) {
    if (['INFERRED', 'MISSING', 'AMBIGUOUS', 'RECOMMENDED', 'missing'].includes(r.status)) blockers.push(`Confirm the ${r.category} requirement.`);
    if (!currentAgreements.some(a => a.category === r.category)) blockers.push(`An approved, valid vendor agreement is required for ${r.category}.`);
  }
  const d = dossier.draft || {};
  const mandatory = (dossier.agreements || []).filter(a => a.sourceHash === source.hash && a.status !== 'SUPERSEDED');
  if (mandatory.some(a => !currentAgreements.some(valid => valid.id === a.id))) blockers.push('Every applicable vendor agreement must be approved, current and valid.');
  const approvedVendorCost = currentAgreements.reduce((sum, a) => sum + (cents(a.vendorCost) ?? NaN), 0);
  if (!Number.isFinite(approvedVendorCost) || approvedVendorCost > (cents(d.total) ?? 0)) blockers.push('Internal commercial costs need review before customer pricing can be approved.');
  const sum = (d.allocations || []).reduce((n, a) => n + (cents(a.amount) ?? NaN), 0);
  if (!d.allocations?.length || cents(d.total) === null || sum !== cents(d.total) || !d.paymentTerms || !d.exclusions) blockers.push('Reconcile the customer allocations with the total and record payment terms and exclusions.');
  if (required.some(r => !(d.allocations || []).some(a => a.category === r.category))) blockers.push('Include every required service in the customer allocation.');
  if (d.total > event.budget) blockers.push('The proposal exceeds the confirmed customer budget. Update the agreed scope or budget.');
  if (!d.assets?.length) blockers.push('Add at least one authorized visual with an accurate source label.');
  const c = dossier.commercial;
  if (!c || c.status !== 'APPROVED' || c.sourceHash !== source.hash || c.draftHash !== hash(d) || new Date(c.expiresAt) <= now) blockers.push('Current internal commercial approval is required.');
  return { ready: !blockers.length, blockers: [...new Set(blockers)], requiredServices: required.map(r => r.category), approvedAgreements: currentAgreements.length };
}

export function customerVersion(version) {
  // Explicit projection. Never spread an internal dossier or agreement here.
  return { id: version.id, number: version.number, status: version.status, createdAt: version.createdAt, expiresAt: version.expiresAt, decisionAt: version.decisionAt || null, snapshot: version.snapshot, sha256: version.sha256 };
}
