import { CustomerEvent, EventRequirement, EventHistory } from '../customer/models/index.js';
import { categoryLabel, templateFor, tierOf } from '../customer/services/planCatalog.js';
import { recordBusinessAudit } from '../admin/utils/audit.js';
import { EventManifest } from './models.js';
import { hashOf, proposalError } from './utils.js';

const INCLUDED = new Set(['confirmed', 'booked', 'completed', 'CONFIRMED', 'KNOWN']);
const PENDING = new Set(['pending']);
const CUSTOMER_PROVIDED = new Set(['customer_provided']);

function requirementEntry(eventType, req) {
  const status = INCLUDED.has(req.status) ? 'included'
    : PENDING.has(req.status) ? 'pending'
      : CUSTOMER_PROVIDED.has(req.status) ? 'customer_provided'
        : null;
  if (!status) return null; // missing / inferred / recommended never enter the manifest
  const tier = tierOf(eventType, req.category);
  const label = categoryLabel(req.category);
  return {
    category: req.category,
    label,
    tier,
    status,
    mandatory: status === 'included' && tier === 'essential',
    details: req.preferences || {},
    pendingItems: status === 'pending' ? [`Confirm ${label.toLowerCase()} selection`] : [],
    specialRequirements: req.specialRequirements || null,
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function validateManifestContent({ eventInfo, requirements }, eventType) {
  const errors = [], warnings = [];
  const need = (field, value, message) => { if (value == null || value === '') errors.push({ code: 'REQUIRED_FIELD_MISSING', field, message }); };
  need('eventInfo.type', eventInfo.type, 'Event type is required.');
  need('eventInfo.date', eventInfo.date, 'Event date is required.');
  need('eventInfo.city', eventInfo.city, 'Event city is required.');
  need('eventInfo.guestCount', eventInfo.guestCount, 'Guest count is required.');
  if (eventInfo.date && eventInfo.date < todayIso()) errors.push({ code: 'EVENT_DATE_IN_PAST', field: 'eventInfo.date', message: 'Event date has already passed.' });
  if (eventInfo.budgetMin != null && eventInfo.budgetMax != null && eventInfo.budgetMin > eventInfo.budgetMax) {
    errors.push({ code: 'BUDGET_RANGE_INVALID', field: 'eventInfo.budget', message: 'Budget minimum is above the maximum.' });
  }
  if (!requirements.some((r) => r.status === 'included')) {
    errors.push({ code: 'NO_CONFIRMED_SERVICES', field: 'requirements', message: 'At least one confirmed service is required.' });
  }
  const handled = new Set(requirements.map((r) => r.category));
  for (const category of templateFor(eventType).essential) {
    if (!handled.has(category)) {
      warnings.push({ code: 'ESSENTIAL_SERVICE_NOT_PLANNED', field: `requirements.${category}`, message: `${categoryLabel(category)} is usually essential for this event and is not in the plan.` });
    }
  }
  for (const r of requirements.filter((x) => x.status === 'pending')) {
    warnings.push({ code: 'PENDING_SELECTION', field: `requirements.${r.category}`, message: `${r.label} is still pending confirmation.` });
  }
  return { status: errors.length ? 'INVALID' : 'VALID', errors, warnings, validatedAt: new Date() };
}

/** Builds a new manifest version from live Core event data. Aura+ never writes here. */
export async function buildManifest(eventId, { actor = 'SYSTEM' } = {}) {
  const event = await CustomerEvent.findById(eventId).lean();
  if (!event) throw proposalError('EVENT_NOT_FOUND', 'Event not found.', 404);
  const reqs = await EventRequirement.find({ event: event._id }).lean();
  const decor = reqs.find((r) => r.category === 'decor')?.preferences || {};

  const eventInfo = {
    type: event.eventType || null,
    title: event.title || '',
    date: event.eventDate || null,
    city: event.city || null,
    venueName: event.location?.venueName || null,
    address: event.location?.address || null,
    guestCount: event.guestCount || null,
    budgetMin: event.budgetMin ?? null,
    budgetMax: event.budgetMax ?? event.budget ?? null,
    theme: event.theme || decor.theme || decor.decorTheme || null,
    colourPalette: event.colourPalette?.length ? event.colourPalette : [],
    specialRequirements: event.specialRequirements || null,
  };
  const requirements = reqs.map((r) => requirementEntry(event.eventType, r)).filter(Boolean)
    .sort((a, b) => a.category.localeCompare(b.category));
  const validation = validateManifestContent({ eventInfo, requirements }, event.eventType);

  const latest = await EventManifest.findOne({ event: event._id }).sort({ version: -1 }).select('version').lean();
  const manifest = await EventManifest.create({
    customer: event.customer,
    event: event._id,
    version: (latest?.version || 0) + 1,
    eventInfo,
    requirements,
    validation,
    contentHash: hashOf({ eventInfo, requirements }),
    createdBy: String(actor),
  });
  await recordBusinessAudit({ actorId: String(actor), actorType: 'ADMIN', action: 'MANIFEST_BUILT', resourceType: 'EventManifest', resourceId: String(manifest._id), referenceId: String(event._id), toState: `DRAFT/${validation.status}`, why: 'Manifest built from Core event data', source: 'PROPOSAL_STUDIO' });
  return manifest;
}

/** Freezes a VALID manifest; the previous frozen version for the event becomes SUPERSEDED. */
export async function freezeManifest(manifestId, { actor = 'SYSTEM' } = {}) {
  const manifest = await EventManifest.findById(manifestId);
  if (!manifest) throw proposalError('MANIFEST_NOT_FOUND', 'Manifest not found.', 404);
  if (manifest.status !== 'DRAFT') throw proposalError('MANIFEST_NOT_DRAFT', 'Only a draft manifest can be frozen.');
  if (manifest.validation.status !== 'VALID') {
    throw proposalError('MANIFEST_INVALID', 'Manifest has validation errors.', 409, { errors: manifest.validation.errors });
  }
  if (hashOf({ eventInfo: manifest.eventInfo, requirements: manifest.requirements }) !== manifest.contentHash) {
    throw proposalError('MANIFEST_CONTENT_CHANGED', 'Manifest content changed after it was built. Rebuild it.');
  }
  const previous = await EventManifest.find({ event: manifest.event, status: 'FROZEN' }).select('_id').lean();
  manifest.status = 'FROZEN';
  manifest.frozenAt = new Date();
  manifest.frozenBy = String(actor);
  await manifest.save();
  if (previous.length) {
    await EventManifest.updateMany({ _id: { $in: previous.map((p) => p._id) } }, { $set: { status: 'SUPERSEDED', supersededBy: manifest._id } });
  }
  await EventHistory.create({ event: manifest.event, actorType: 'ops', actorId: String(actor), action: 'manifest_frozen', details: { manifestId: String(manifest._id), version: manifest.version } });
  await recordBusinessAudit({ actorId: String(actor), actorType: 'ADMIN', action: 'MANIFEST_FROZEN', resourceType: 'EventManifest', resourceId: String(manifest._id), referenceId: String(manifest.event), fromState: 'DRAFT', toState: 'FROZEN', why: 'Validated manifest frozen for proposal', source: 'PROPOSAL_STUDIO' });
  return manifest;
}

export function currentFrozenManifest(eventId) {
  return EventManifest.findOne({ event: eventId, status: 'FROZEN' }).sort({ version: -1 });
}
