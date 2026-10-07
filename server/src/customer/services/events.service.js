import * as eventsRepo from '../repositories/events.repo.js';
import * as reqRepo from '../repositories/requirements.repo.js';
import * as auraRepo from '../repositories/aura.repo.js';
import * as quotesRepo from '../repositories/quotes.repo.js';
import * as commerceRepo from '../repositories/commerce.repo.js';
import * as circleRepo from '../repositories/circle.repo.js';
import { countUnreadTotal } from './circle.service.js';
import { serializeBooking, serializePayment } from './commerce.service.js';
import { badRequest, notFound, conflict } from '../utils/http.js';
import { CLOSED_EVENT_STATUSES, LOCKED_REQUIREMENT_STATUSES } from '../models/index.js';
import { PortfolioItem } from '../../external/models/PortfolioItem.js';
import { VendorCapability } from '../../external/models/VendorCapability.js';
import { VendorReview } from '../../external/models/VendorReview.js';
import { VendorResource } from '../../external/models/VendorResource.js';
import { OperatingLocation } from '../../external/models/OperatingLocation.js';
import { TravelPolicy } from '../../external/models/TravelPolicy.js';
import { VendorOrganization } from '../../external/models/VendorOrganization.js';
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  CATEGORY_LABELS,
  normalizeEventType,
  normalizeCategory,
  templateFor,
  budgetRangesFor,
  findBudgetRange,
} from './planCatalog.js';
import { isValidISODate, todayISO } from './dates.js';
import {
  HANDLED_STATUSES,
  buildUnderstanding,
  missingForConfirm,
  progressOf,
  serializeEvent,
  serializeRequirement,
} from './understanding.js';
import * as catalog from './catalog.service.js';
import { serviceFields, validateDetails, validateServiceLocation, LOCATION_SENSITIVE, ROUTE_CATEGORIES } from './serviceRequirements.js';
import { computeEventSummary, eventSteps, attentionFor } from './summary.js';
import { customerHistory } from './history.service.js';

const EDITABLE_STATUSES = ['draft', 'planning'];
// Arranged elsewhere or reset: an earlier option choice no longer applies.
const NO_SELECTION = { selectedOptionId: null, selectedOption: { vendorName: null, packageName: null, price: null, isDemo: false } };
const FACT_KEYS = ['eventType', 'title', 'eventDate', 'city', 'guestCount', 'budget', 'budgetRange', 'budgetMin', 'budgetMax', 'customType', 'location', 'specialRequirements', 'notes'];

// Event location keys (area is accepted as an alias of locality; city maps to the top-level city).
const LOCATION_TEXT = { country: 60, state: 60, locality: 80, venueName: 120, address: 300, pincode: 12, landmark: 120, notes: 500 };

function validateLocation(input, errors, out) {
  if (input === null) {
    for (const k of Object.keys(LOCATION_TEXT)) out[`location.${k}`] = null;
    out['location.coordinates'] = { lat: null, lng: null };
    return;
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    errors.location = 'Location must be an object';
    return;
  }
  const loc = { ...input };
  if ('area' in loc) {
    if (!('locality' in loc)) loc.locality = loc.area;
    delete loc.area;
  }
  for (const [k, v] of Object.entries(loc)) {
    if (k === 'city') {
      const c = v == null ? '' : String(v).trim();
      if (c.length > 80) errors['location.city'] = 'City name is too long';
      else out.city = c || null;
    } else if (k === 'coordinates') {
      if (v == null) out['location.coordinates'] = { lat: null, lng: null };
      else {
        const lat = Number(v.lat);
        const lng = Number(v.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) errors['location.coordinates'] = 'Invalid map point';
        else out['location.coordinates'] = { lat, lng };
      }
    } else if (k in LOCATION_TEXT) {
      const s = v == null ? '' : String(v).trim();
      if (s.length > LOCATION_TEXT[k]) errors[`location.${k}`] = 'Too long';
      else if (k === 'pincode' && s && !/^[A-Za-z0-9 -]{3,12}$/.test(s)) errors['location.pincode'] = 'Enter a valid pincode';
      else out[`location.${k}`] = s || null;
    } else {
      errors[`location.${k}`] = 'Unknown location field';
    }
  }
}

/** Dotted update keys → nested object (for creating a document). */
function nest(flat) {
  const out = {};
  for (const [k, v] of Object.entries(flat)) {
    const parts = k.split('.');
    let cur = out;
    for (const p of parts.slice(0, -1)) cur = cur[p] ||= {};
    cur[parts.at(-1)] = v;
  }
  return out;
}

/**
 * Validate customer-editable event facts. Throws before anything is written.
 * `status` is never accepted: only Core moves an event between states.
 */
export function validateFacts(input = {}) {
  if (input == null || typeof input !== 'object') throw badRequest('INVALID_BODY', 'Invalid request body');
  if ('status' in input) throw badRequest('STATUS_NOT_EDITABLE', 'Event status cannot be changed directly');

  const errors = {};
  const out = {};
  for (const key of Object.keys(input)) {
    if (!FACT_KEYS.includes(key)) errors[key] = 'Unknown field';
  }

  if (input.eventType !== undefined) {
    const t = input.eventType === null ? null : String(input.eventType).toLowerCase().trim();
    if (t === null) errors.eventType = 'Event type is required';
    else if (!EVENT_TYPES.includes(t)) errors.eventType = 'Unknown event type';
    else out.eventType = t;
  }
  if (input.title !== undefined) {
    const t = String(input.title ?? '').trim();
    if (t.length > 120) errors.title = 'Title is too long';
    else out.title = t;
  }
  if (input.eventDate !== undefined) {
    if (input.eventDate === null || input.eventDate === '') out.eventDate = null;
    else if (!isValidISODate(input.eventDate)) errors.eventDate = 'Use a valid date (YYYY-MM-DD)';
    else if (input.eventDate < todayISO()) errors.eventDate = 'The date is in the past';
    else out.eventDate = input.eventDate;
  }
  if (input.city !== undefined) {
    const c = input.city === null ? '' : String(input.city).trim();
    if (c.length > 80) errors.city = 'City name is too long';
    else out.city = c || null;
  }
  if (input.guestCount !== undefined) {
    if (input.guestCount === null || input.guestCount === '') out.guestCount = null;
    else {
      const n = Number(input.guestCount);
      if (!Number.isInteger(n) || n < 1 || n > 100000) errors.guestCount = 'Guest count must be a whole number between 1 and 100000';
      else out.guestCount = n;
    }
  }
  if (input.budget !== undefined && input.budgetRange !== undefined && input.budget !== null && input.budgetRange !== null) {
    errors.budget = 'Give either an exact budget or a range, not both';
  } else if (input.budget !== undefined) {
    if (input.budget === null || input.budget === '') out.budget = null;
    else {
      const n = Number(input.budget);
      if (!Number.isFinite(n) || n <= 0 || n > 1e10) errors.budget = 'Budget must be a positive amount';
      else {
        // An exact budget replaces any range.
        out.budget = Math.round(n);
        out.budgetMin = null;
        out.budgetMax = null;
      }
    }
  } else if (input.budgetRange !== undefined) {
    if (input.budgetRange === null) {
      out.budgetMin = null;
      out.budgetMax = null;
    } else {
      const r = findBudgetRange(String(input.budgetRange));
      if (!r) errors.budgetRange = 'Unknown budget range';
      else {
        // Open-ended ranges clear any old ceiling (max = null).
        out.budget = null;
        out.budgetMin = r.min;
        out.budgetMax = r.max;
      }
    }
  }

  // A range in the customer's own numbers ("10 to 15 lakh").
  if (input.budgetMin !== undefined || input.budgetMax !== undefined) {
    const lo = Number(input.budgetMin);
    const hi = input.budgetMax == null ? null : Number(input.budgetMax);
    if (out.budget != null || input.budgetRange) errors.budgetMin = 'Give either an exact budget or a range, not both';
    else if (!Number.isFinite(lo) || lo < 0 || (hi != null && (!Number.isFinite(hi) || hi <= lo || hi > 1e10))) {
      errors.budgetMin = 'Budget range must go from a lower to a higher amount';
    } else {
      out.budget = null;
      out.budgetMin = Math.round(lo);
      out.budgetMax = hi == null ? null : Math.round(hi);
    }
  }
  if (input.customType !== undefined) {
    const s = input.customType == null ? '' : String(input.customType).trim();
    if (s.length > 60) errors.customType = 'Too long';
    else out.customType = s || null;
  }
  for (const k of ['specialRequirements', 'notes']) {
    if (input[k] === undefined) continue;
    const s = input[k] == null ? '' : String(input[k]).trim();
    if (s.length > 1000) errors[k] = 'Too long';
    else out[k] = s || null;
  }
  if (input.location !== undefined) validateLocation(input.location, errors, out);

  if (Object.keys(errors).length) throw badRequest('VALIDATION_FAILED', 'Please check the event details', { fields: errors });
  return out;
}

/**
 * The venue is one fact in two places: the event location's venue name and
 * the "venue" plan item (arranged by the customer). Keep them in step so the
 * manual form and Aura+ always converge on the same data.
 */
async function syncVenueRequirement(event, venueName, actor) {
  if (!venueName) return;
  const existing = await reqRepo.findRequirement(event._id, 'venue');
  if (existing && LOCKED_REQUIREMENT_STATUSES.includes(existing.status)) return;
  if (existing?.status === 'customer_provided' && existing.providedValue === venueName) return;
  const { changed } = await reqRepo.upsertRequirement(
    event._id,
    'venue',
    { status: 'customer_provided', source: 'customer', providedValue: venueName, ...NO_SELECTION },
    { onlyIfStatusIn: ['missing', 'pending', 'customer_provided'] }
  );
  if (changed) {
    await eventsRepo.appendHistory({ eventId: event._id, ...actor, action: 'requirement_updated', details: { category: 'venue', status: 'customer_provided' } });
  }
}

async function syncLocationVenue(event, venueName) {
  if (!venueName || event.location?.venueName === venueName) return;
  if (!EDITABLE_STATUSES.includes(event.status)) return;
  await eventsRepo.updateEventFields(event.customer, event._id, { 'location.venueName': venueName });
}

export async function getOwnedEventOr404(customerId, eventId) {
  const event = await eventsRepo.findOwnedEvent(customerId, eventId);
  if (!event) throw notFound('Event not found');
  return event;
}

function defaultTitle(eventType, customType) {
  if (eventType === 'other') return customType ? `My ${customType.toLowerCase()}` : 'My event';
  return `My ${(EVENT_TYPE_LABELS[eventType] || 'Event').toLowerCase()}`;
}

export async function eventDetail(customerId, eventId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const [requirements, contextRows] = await Promise.all([
    reqRepo.listRequirements(event._id),
    auraRepo.listContext(event._id),
  ]);
  return {
    event: serializeEvent(event),
    requirements: requirements.map((r) => serializeRequirement(event.eventType, r)),
    progress: progressOf(event, requirements),
    understanding: buildUnderstanding(event, requirements, contextRows),
  };
}

export async function listEvents(customerId) {
  const events = await eventsRepo.listEventsForCustomer(customerId);
  const reqs = await reqRepo.listRequirementsForEvents(events.map((e) => e._id));
  const byEvent = new Map();
  for (const r of reqs) {
    const k = String(r.event);
    if (!byEvent.has(k)) byEvent.set(k, []);
    byEvent.get(k).push(r);
  }
  return events.map((e) => ({ ...serializeEvent(e), ...progressOf(e, byEvent.get(String(e._id)) || []) }));
}

export async function createDraftEvent(customerId, facts, { actorType = 'customer', actorId = null } = {}) {
  const clean = validateFacts(facts);
  if (!clean.eventType) throw badRequest('VALIDATION_FAILED', 'Event type is required', { fields: { eventType: 'Required' } });
  const event = await eventsRepo.createEvent({
    ...nest(clean),
    title: clean.title || defaultTitle(clean.eventType, clean.customType),
    customer: customerId,
    status: 'draft',
  });
  await eventsRepo.appendHistory({ eventId: event._id, actorType, actorId, action: 'event_draft_created', details: { eventType: event.eventType } });
  return event;
}

export async function patchEvent(customerId, eventId, input, { actorType = 'customer', actorId = null } = {}) {
  const clean = validateFacts(input);
  const event = await getOwnedEventOr404(customerId, eventId);
  if (CLOSED_EVENT_STATUSES.includes(event.status)) throw badRequest('EVENT_CLOSED', 'This event is closed and read-only');
  if (!EDITABLE_STATUSES.includes(event.status)) throw conflict('EVENT_LOCKED', 'Event details can no longer be changed here');
  if (event.status !== 'draft' && 'eventType' in clean && clean.eventType !== event.eventType) {
    throw conflict('EVENT_TYPE_LOCKED', 'Event type cannot change after the plan is built');
  }
  if (!Object.keys(clean).length) return event;

  const updated = await eventsRepo.updateEventFields(customerId, eventId, clean, { onlyStatuses: EDITABLE_STATUSES });
  if (!updated) throw conflict('EVENT_LOCKED', 'Event details can no longer be changed here');
  // A date the customer typed with a year is no longer "assumed".
  if ('eventDate' in clean && actorType === 'customer') {
    await auraRepo.setContext(event._id, 'event.date', { value: { date: clean.eventDate }, state: 'KNOWN', source: 'customer' });
  }
  if (clean['location.venueName']) await syncVenueRequirement(updated, clean['location.venueName'], { actorType, actorId });
  await eventsRepo.appendHistory({
    eventId: event._id,
    actorType,
    actorId,
    action: 'event_details_updated',
    details: { fields: [...new Set(Object.keys(clean).filter((k) => !['budgetMin', 'budgetMax'].includes(k)).map((k) => (k.startsWith('location.') ? k.slice(9) : k)))] },
  });
  return updated;
}

/**
 * draft → planning. Needs type + date + city. Idempotent: confirming an
 * already-confirmed event is a no-op. Plan rows are inserted only where
 * missing, so services stated during the draft survive.
 */
export async function confirmEvent(customerId, eventId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  if (event.status !== 'draft') {
    return { ...(await eventDetail(customerId, eventId)), alreadyConfirmed: true };
  }
  const missing = missingForConfirm(event);
  if (missing.length) {
    throw badRequest('MISSING_DETAILS', `Please add: ${missing.map((m) => m.label).join(', ')}`, { missing });
  }
  const moved = await eventsRepo.transitionStatus(customerId, eventId, 'draft', 'planning');
  const t = templateFor(event.eventType);
  await reqRepo.insertMissingRequirements(event._id, [...t.essential, ...t.recommended, ...t.optional]);
  if (moved) {
    await eventsRepo.appendHistory({ eventId: event._id, actorType: 'customer', actorId: customerId, action: 'event_confirmed', details: {} });
  }
  return { ...(await eventDetail(customerId, eventId)), alreadyConfirmed: !moved };
}

/**
 * Apply one service statement to a requirement, honouring locks.
 * kind: 'provided' (customer has it) | 'needs_help' | 'needed'.
 * Returns { applied, reason? }.
 */
export async function applyServiceStatement(customerId, eventId, category, { kind, value }, { actorType = 'customer', actorId = null } = {}) {
  const cat = normalizeCategory(category);
  if (!cat) return { applied: false, reason: 'unknown_category' };
  const event = await getOwnedEventOr404(customerId, eventId);
  if (CLOSED_EVENT_STATUSES.includes(event.status)) return { applied: false, reason: 'event_closed' };

  const existing = await reqRepo.findRequirement(event._id, cat);
  if (existing && LOCKED_REQUIREMENT_STATUSES.includes(existing.status)) return { applied: false, reason: 'locked' };

  let result;
  if (kind === 'provided') {
    // "Catering is already arranged" needs no name; a name, when given, is kept.
    const v = String(value || '').trim().slice(0, 200) || null;
    result = await reqRepo.upsertRequirement(
      event._id,
      cat,
      { status: 'customer_provided', source: 'customer', ...(v || existing?.status !== 'customer_provided' ? { providedValue: v } : {}), ...NO_SELECTION },
      { onlyIfStatusIn: ['missing', 'pending', 'customer_provided'] }
    );
    if (cat === 'venue' && v) await syncLocationVenue(event, v);
  } else if (kind === 'needs_help') {
    // An explicit "help me find one" may reopen something the customer said they had.
    result = await reqRepo.upsertRequirement(event._id, cat, { status: 'pending', source: 'customer', providedValue: null }, {
      onlyIfStatusIn: ['missing', 'pending', 'customer_provided'],
    });
  } else if (kind === 'needed') {
    // A general "I need X" never downgrades something already arranged.
    result = await reqRepo.upsertRequirement(event._id, cat, { status: 'pending', source: 'customer' }, { onlyIfStatusIn: ['missing'] });
  } else {
    return { applied: false, reason: 'unknown_kind' };
  }
  if (result.changed) {
    await eventsRepo.appendHistory({ eventId: event._id, actorType, actorId, action: 'requirement_updated', details: { category: cat, status: result.row.status } });
  }
  return { applied: result.changed, reason: result.changed ? undefined : 'unchanged' };
}

/** Merge preference keys into a requirement (e.g. photography style). */
export async function mergePreferences(customerId, eventId, category, preferences, { actorType = 'customer', actorId = null } = {}) {
  const cat = normalizeCategory(category);
  if (!cat) return { applied: false, reason: 'unknown_category' };
  const event = await getOwnedEventOr404(customerId, eventId);
  if (CLOSED_EVENT_STATUSES.includes(event.status)) return { applied: false, reason: 'event_closed' };
  const existing = await reqRepo.findRequirement(event._id, cat);
  if (existing && LOCKED_REQUIREMENT_STATUSES.includes(existing.status)) return { applied: false, reason: 'locked' };
  const { changed } = await reqRepo.upsertRequirement(event._id, cat, { preferences, source: existing?.source ?? 'customer' });
  if (changed) {
    await eventsRepo.appendHistory({ eventId: event._id, actorType, actorId, action: 'preferences_updated', details: { category: cat, keys: Object.keys(preferences) } });
  }
  return { applied: changed };
}

const CUSTOMER_SETTABLE = ['missing', 'pending', 'customer_provided'];

/**
 * Aura+ (or the customer) says where one service happens, e.g. "makeup will
 * be at my hotel". Saying so means the customer wants that service, so a
 * not-yet-requested item becomes "needed"; arranged items keep their status.
 */
export async function applyServiceLocation(customerId, eventId, category, location, { actorType = 'customer', actorId = null } = {}) {
  const cat = normalizeCategory(category);
  if (!cat) return { applied: false, reason: 'unknown_category' };
  const event = await getOwnedEventOr404(customerId, eventId);
  if (CLOSED_EVENT_STATUSES.includes(event.status)) return { applied: false, reason: 'event_closed' };
  const existing = await reqRepo.findRequirement(event._id, cat);
  if (existing && LOCKED_REQUIREMENT_STATUSES.includes(existing.status)) return { applied: false, reason: 'locked' };
  let clean;
  try {
    clean = validateServiceLocation(cat, location);
  } catch {
    return { applied: false, reason: 'invalid' };
  }
  const { changed } = await reqRepo.upsertRequirement(
    event._id,
    cat,
    { serviceLocation: clean, ...(!existing || existing.status === 'missing' ? { status: 'pending', source: 'customer' } : {}) },
    { onlyIfStatusIn: ['missing', 'pending', 'customer_provided'] }
  );
  if (changed) {
    await eventsRepo.appendHistory({ eventId: event._id, actorType, actorId, action: 'service_location_updated', details: { category: cat, mode: clean.mode } });
  }
  return { applied: changed };
}

const REQUIREMENT_KEYS = ['status', 'providedValue', 'details', 'serviceLocation', 'specialRequirements'];

/**
 * Customer changes one plan item: status (missing / pending /
 * customer_provided), service details, service location, notes.
 * confirmed / booked / completed are locked (409); closed events are
 * read-only (400). A new category adds a service to the plan.
 */
export async function setRequirement(customerId, eventId, categoryParam, body = {}) {
  const category = normalizeCategory(categoryParam);
  if (!category) throw badRequest('UNKNOWN_CATEGORY', 'Unknown service');
  const extra = Object.keys(body || {}).filter((k) => !REQUIREMENT_KEYS.includes(k));
  if (extra.length) throw badRequest('VALIDATION_FAILED', 'That can’t be changed here', { fields: Object.fromEntries(extra.map((k) => [k, 'Not editable'])) });
  const { status } = body;
  if (status !== undefined && !CUSTOMER_SETTABLE.includes(status)) {
    throw badRequest('INVALID_STATUS', 'You can mark a service as needed, arranged by you, or reset it');
  }
  const value = typeof body.providedValue === 'string' ? body.providedValue.trim() : '';
  if (value.length > 200) throw badRequest('VALIDATION_FAILED', 'That name is too long');
  const notes = body.specialRequirements === undefined ? undefined : String(body.specialRequirements ?? '').trim();
  if (notes && notes.length > 1000) throw badRequest('VALIDATION_FAILED', 'Special requirements are too long');

  const event = await getOwnedEventOr404(customerId, eventId);
  if (CLOSED_EVENT_STATUSES.includes(event.status)) throw badRequest('EVENT_CLOSED', 'This event is closed and read-only');
  const details = body.details === undefined ? undefined : validateDetails(category, event.eventType, body.details);
  const serviceLocation = body.serviceLocation === undefined ? undefined : validateServiceLocation(category, body.serviceLocation);

  const existing = await reqRepo.findRequirement(event._id, category);
  if (existing && LOCKED_REQUIREMENT_STATUSES.includes(existing.status)) {
    throw conflict('REQUIREMENT_LOCKED', `${CATEGORY_LABELS[category]} is already ${existing.status} and can't be changed here`);
  }
  // Details for a service not yet in the plan add it as "needed".
  const nextStatus = status ?? (existing ? undefined : 'pending');
  const { row, changed } = await reqRepo.upsertRequirement(
    event._id,
    category,
    {
      ...(nextStatus !== undefined
        ? {
            status: nextStatus,
            source: 'customer',
            providedValue: nextStatus === 'customer_provided' ? value || null : null,
            // Arranged elsewhere or reset: any earlier option choice no longer applies.
            ...(nextStatus !== 'pending' ? NO_SELECTION : {}),
          }
        : {}),
      ...(details ? { preferences: details } : {}),
      ...(serviceLocation ? { serviceLocation } : {}),
      ...(notes !== undefined ? { specialRequirements: notes || null } : {}),
    },
    { onlyIfStatusIn: CUSTOMER_SETTABLE }
  );
  if (!changed && LOCKED_REQUIREMENT_STATUSES.includes(row.status)) {
    throw conflict('REQUIREMENT_LOCKED', `${CATEGORY_LABELS[category]} can't be changed here`);
  }
  if (category === 'venue' && nextStatus === 'customer_provided' && value) await syncLocationVenue(event, value);
  if (changed) {
    const action = nextStatus !== undefined ? 'requirement_updated' : serviceLocation ? 'service_location_updated' : 'preferences_updated';
    await eventsRepo.appendHistory({
      eventId: event._id,
      actorType: 'customer',
      actorId: customerId,
      action,
      details: { category, status: row.status, mode: serviceLocation?.mode, keys: details ? Object.keys(details) : undefined },
    });
  }
  return serializeRequirement(event.eventType, row);
}

/** Confirmed bookings as summary input: { category, amount, vendorName }. */
async function confirmedBookings(eventId) {
  return (await commerceRepo.listBookings(eventId)).filter((b) => b.status === 'confirmed');
}

/** Per-event attention inputs, built only from real rows. */
async function attentionSignals(eventIds) {
  const [draftQuotes, awaiting, failed] = await Promise.all([
    quotesRepo.countDraftsForEvents(eventIds),
    commerceRepo.countPendingPaymentByEvent(eventIds),
    commerceRepo.countRetryableFailedByEvent(eventIds),
  ]);
  return (id) => ({
    draftQuotes: draftQuotes.get(String(id)) || 0,
    awaitingPayment: awaiting.get(String(id)) || 0,
    failedPayments: failed.get(String(id)) || 0,
  });
}

export async function requirementsDetail(customerId, eventId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const [requirements, stats, bookings] = await Promise.all([reqRepo.listRequirements(event._id), catalog.optionStats(event), confirmedBookings(event._id)]);
  const summary = computeEventSummary(event, requirements, stats, bookings);
  const byCat = new Map(summary.items.map((i) => [i.category, i]));
  const rows = requirements.map((r) => {
    const i = byCat.get(r.category);
    return { ...serializeRequirement(event.eventType, r), optionCount: i.optionCount, estimatedCost: i.estimatedCost, estimateIsDemo: i.estimateIsDemo };
  });
  const counts = { all: rows.length };
  for (const t of ['essential', 'recommended', 'optional', 'custom']) counts[t] = rows.filter((r) => r.tier === t).length;
  return { event: serializeEvent(event), requirements: rows, counts, summary: { ...summary, items: undefined } };
}

export async function dashboard(customerId, eventId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const [requirements, contextRows, stats, recent, signals, allBookings, payments] = await Promise.all([
    reqRepo.listRequirements(event._id),
    auraRepo.listContext(event._id),
    event.status === 'draft' ? new Map() : catalog.optionStats(event),
    customerHistory(event._id, { limit: 5 }),
    attentionSignals([event._id]),
    commerceRepo.listBookings(event._id),
    commerceRepo.listPayments(event._id),
  ]);
  const summary = computeEventSummary(event, requirements, stats, allBookings.filter((b) => b.status === 'confirmed'));
  const attention = attentionFor(event, signals(event._id));
  return {
    event: serializeEvent(event),
    summary,
    counts: {
      services: requirements.length,
      handled: requirements.filter((r) => HANDLED_STATUSES.includes(r.status)).length,
      needHelp: requirements.filter((r) => r.status === 'pending').length,
      notArranged: requirements.filter((r) => r.status === 'missing').length,
      bookings: allBookings.filter((b) => b.status !== 'cancelled').length,
      payments: payments.length,
    },
    bookings: allBookings.map(serializeBooking),
    payments: payments.map(serializePayment),
    attention,
    attentionCount: attention.length,
    steps: eventSteps(event, requirements),
    understanding: event.status === 'draft' ? buildUnderstanding(event, requirements, contextRows) : null,
    recentHistory: recent,
  };
}

export async function home(customerId) {
  const events = await eventsRepo.listEventsForCustomer(customerId);
  const reqs = await reqRepo.listRequirementsForEvents(events.map((e) => e._id));
  const byEvent = new Map();
  for (const r of reqs) {
    const k = String(r.event);
    if (!byEvent.has(k)) byEvent.set(k, []);
    byEvent.get(k).push(r);
  }
  const active = events.filter((e) => !CLOSED_EVENT_STATUSES.includes(e.status));
  const [signals, unread] = await Promise.all([attentionSignals(active.map((e) => e._id)), countUnreadTotal(customerId)]);
  return {
    activeEvents: active.map((e) => {
      const rows = byEvent.get(String(e._id)) || [];
      return { ...serializeEvent(e), ...progressOf(e, rows), steps: eventSteps(e, rows) };
    }),
    attention: active.flatMap((e) => attentionFor(e, signals(e._id))),
    unreadUpdates: unread,
  };
}

/** Event day: only what was recorded (check-in / start / complete), nothing assumed. */
export async function eventDay(customerId, eventId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const bookings = (await commerceRepo.listBookings(event._id)).filter((b) => b.status === 'confirmed');
  return {
    event: serializeEvent(event),
    live: event.status === 'in_progress',
    services: bookings.map(serializeBooking),
    allCompleted: bookings.length > 0 && bookings.every((b) => b.executionStatus === 'completed'),
  };
}

/**
 * Manual planning form. Everything is validated BEFORE anything is written,
 * so an invalid service never leaves a half-created event behind. The
 * customer typed the facts, so the event starts in planning (no draft).
 */
export async function createManualEvent(customerId, body = {}) {
  const { services = [], ...factInput } = body || {};
  const facts = validateFacts(factInput);
  const missing = [];
  if (!facts.eventType) missing.push({ field: 'eventType', label: 'Event type' });
  if (!facts.eventDate) missing.push({ field: 'eventDate', label: 'Date' });
  if (!facts.city) missing.push({ field: 'city', label: 'Location' });
  if (missing.length) throw badRequest('MISSING_DETAILS', `Please add: ${missing.map((m) => m.label).join(', ')}`, { missing });

  if (!Array.isArray(services) || services.length > 40) throw badRequest('VALIDATION_FAILED', 'services must be a list');
  const statements = [];
  const seen = new Set();
  for (const [i, s] of services.entries()) {
    const category = normalizeCategory(s?.category);
    if (!category) throw badRequest('VALIDATION_FAILED', `Service ${i + 1}: unknown service`, { fields: { [`services.${i}.category`]: 'Unknown service' } });
    const label = CATEGORY_LABELS[category];
    if (seen.has(category)) throw badRequest('VALIDATION_FAILED', `${label} is listed twice`);
    seen.add(category);
    if (!['pending', 'customer_provided'].includes(s.status)) throw badRequest('VALIDATION_FAILED', `${label}: choose "Need help" or "Already arranged"`);
    const value = typeof s.providedValue === 'string' ? s.providedValue.trim() : '';
    if (value.length > 200) throw badRequest('VALIDATION_FAILED', `${label}: name is too long`);
    const notes = s.specialRequirements == null ? null : String(s.specialRequirements).trim().slice(0, 1000) || null;
    let details;
    let serviceLocation;
    try {
      details = validateDetails(category, facts.eventType, s.details);
      serviceLocation = s.serviceLocation == null ? null : validateServiceLocation(category, s.serviceLocation);
    } catch (err) {
      err.message = `${label}: ${err.message}`;
      throw err;
    }
    statements.push({
      category,
      status: s.status,
      providedValue: s.status === 'customer_provided' ? value || null : null,
      details,
      serviceLocation,
      specialRequirements: notes,
    });
  }

  const event = await eventsRepo.createEvent({
    ...nest(facts),
    title: facts.title || defaultTitle(facts.eventType, facts.customType),
    customer: customerId,
    status: 'planning',
  });
  const t = templateFor(event.eventType);
  await reqRepo.insertMissingRequirements(event._id, [...t.essential, ...t.recommended, ...t.optional]);
  for (const st of statements) {
    await reqRepo.upsertRequirement(event._id, st.category, {
      status: st.status,
      source: 'customer',
      providedValue: st.providedValue,
      preferences: st.details,
      ...(st.serviceLocation ? { serviceLocation: st.serviceLocation } : {}),
      ...(st.specialRequirements ? { specialRequirements: st.specialRequirements } : {}),
    });
  }
  const actor = { actorType: 'customer', actorId: customerId };
  const venueStatement = statements.find((s) => s.category === 'venue' && s.status === 'customer_provided' && s.providedValue);
  if (facts['location.venueName']) await syncVenueRequirement(event, facts['location.venueName'], actor);
  else if (venueStatement) await syncLocationVenue(event, venueStatement.providedValue);
  await eventsRepo.appendHistory({ eventId: event._id, ...actor, action: 'event_created_manually', details: { eventType: event.eventType } });
  return eventDetail(customerId, event._id);
}

// ── Discovery (read-only; draft events may browse, not select) ─────────────
const OPEN_STATUSES = ['missing', 'pending'];

export async function serviceCategories(customerId, eventId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const [requirements, stats] = await Promise.all([reqRepo.listRequirements(event._id), catalog.optionStats(event)]);
  const open = requirements
    .filter((r) => OPEN_STATUSES.includes(r.status))
    .map((r) => {
      const s = stats.get(r.category) || { optionCount: 0, lowestPrice: null, lowestIsDemo: false };
      return { ...serializeRequirement(event.eventType, r), optionCount: s.optionCount, lowestPrice: s.lowestPrice, lowestIsDemo: s.lowestIsDemo };
    });
  const rank = { essential: 0, recommended: 1, optional: 2, custom: 3 };
  open.sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || rank[a.tier] - rank[b.tier]);
  return { event: serializeEvent(event), categories: open };
}

export async function serviceOptions(customerId, eventId, category) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const result = await catalog.optionsForCategory(event, category);
  const req = await reqRepo.findRequirement(event._id, result.category);
  return {
    event: serializeEvent(event),
    requirement: req ? serializeRequirement(event.eventType, req) : null,
    selectedOptionId: req?.selectedOptionId || null,
    ...result,
  };
}

export async function serviceDetail(customerId, eventId, optionId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const option = await catalog.getOption(event, optionId);
  const req = await reqRepo.findRequirement(event._id, option.category);

  let vendorProfile = null;
  let portfolio = [];
  let capabilities = [];
  let reviews = [];
  let resources = [];
  let locations = [];
  let travelPolicy = null;
  let googleRating = null;

  if (option.vendorId) {
    const [
      fetchedPortfolio,
      fetchedCapabilities,
      fetchedReviews,
      fetchedResources,
      fetchedLocations,
      fetchedTravelPolicy,
      vendorOrg
    ] = await Promise.all([
      PortfolioItem.find({ vendor: option.vendorId, visibility: 'PUBLIC', status: { $in: ['PUBLISHED', 'VERIFIED', 'BOOKING_PROVEN'] } }).sort({ isFeatured: -1, createdAt: -1 }).limit(20).lean(),
      VendorCapability.find({ vendor: option.vendorId }).lean(),
      VendorReview.find({ vendor: option.vendorId, status: 'PUBLISHED' }).sort({ createdAt: -1 }).limit(10).lean(),
      VendorResource.find({ vendor: option.vendorId, status: 'AVAILABLE' }).lean(),
      OperatingLocation.find({ vendor: option.vendorId }).lean(),
      TravelPolicy.findOne({ vendor: option.vendorId }).lean(),
      VendorOrganization.findById(option.vendorId).lean()
    ]);

    portfolio = fetchedPortfolio;
    capabilities = fetchedCapabilities;
    reviews = fetchedReviews;
    resources = fetchedResources;
    locations = fetchedLocations;
    travelPolicy = fetchedTravelPolicy;

    if (vendorOrg) {
      vendorProfile = {
        businessName: vendorOrg.businessName,
        bio: vendorOrg.bio,
        phone: vendorOrg.phone,
        website: vendorOrg.website,
        profilePicUrl: vendorOrg.profilePicUrl,
        location: vendorOrg.location,
        category: vendorOrg.category,
        isVerified: vendorOrg.verification?.isVerified || false,
        workingHours: vendorOrg.workingHours,
        rating: vendorOrg.rating,
      };

      if (vendorOrg.googlePlaceId) {
        try {
          const key = process.env.GOOGLE_PLACES_API_KEY || '';
          const url = `https://places.googleapis.com/v1/places/${vendorOrg.googlePlaceId}?fields=id,displayName,rating,userRatingCount,reviews,googleMapsUri,formattedAddress&key=${key}`;
          const res = await fetch(url);
          const gData = await res.json();
          if (gData && !gData.error) {
            googleRating = {
              rating: gData.rating,
              reviewCount: gData.userRatingCount,
              googleMapsUrl: gData.googleMapsUri,
              reviews: gData.reviews || [],
              address: gData.formattedAddress,
              businessName: gData.displayName?.text,
            };
          }
        } catch (err) {
          console.warn('[serviceDetail] Google Places fetch failed:', err.message);
        }
      }
    }
  }

  return {
    event: serializeEvent(event),
    option,
    selected: req?.selectedOptionId === option.id,
    vendorProfile,
    portfolio,
    capabilities,
    reviews,
    resources,
    locations,
    travelPolicy,
    googleRating,
  };
}

export async function compareServices(customerId, eventId, ids) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const result = await catalog.compareOptions(event, ids);
  const req = await reqRepo.findRequirement(event._id, result.category);
  return { event: serializeEvent(event), selectedOptionId: req?.selectedOptionId || null, ...result };
}

export async function eventHistory(customerId, eventId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  return { history: await customerHistory(event._id) };
}

export function planOptions(eventType) {
  const t = eventType ? normalizeEventType(eventType) : null;
  const template = t ? templateFor(t) : null;
  return {
    eventTypes: EVENT_TYPES.map((v) => ({ value: v, label: EVENT_TYPE_LABELS[v] })),
    categories: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
    template: template ? { eventType: t, ...template } : null,
    budgetRanges: t ? budgetRangesFor(t) : { wedding: budgetRangesFor('wedding'), other: budgetRangesFor('other') },
    // Event Type + Service Category → relevant requirement fields (options from the Vendor OS taxonomy).
    serviceFields: Object.fromEntries(Object.keys(CATEGORY_LABELS).map((c) => [c, serviceFields(c, t || 'other')])),
    locationSensitive: LOCATION_SENSITIVE,
    routeCategories: ROUTE_CATEGORIES,
  };
}
