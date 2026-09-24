import * as eventsRepo from '../repositories/events.repo.js';
import * as reqRepo from '../repositories/requirements.repo.js';
import * as auraRepo from '../repositories/aura.repo.js';
import * as quotesRepo from '../repositories/quotes.repo.js';
import * as commerceRepo from '../repositories/commerce.repo.js';
import * as circleRepo from '../repositories/circle.repo.js';
import { serializeBooking, serializePayment } from './commerce.service.js';
import { badRequest, notFound, conflict } from '../utils/http.js';
import { CLOSED_EVENT_STATUSES, LOCKED_REQUIREMENT_STATUSES } from '../models/index.js';
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
import { computeEventSummary, eventSteps, attentionFor } from './summary.js';
import { customerHistory } from './history.service.js';

const EDITABLE_STATUSES = ['draft', 'planning'];
// Arranged elsewhere or reset: an earlier option choice no longer applies.
const NO_SELECTION = { selectedOptionId: null, selectedOption: { vendorName: null, packageName: null, price: null, isDemo: false } };
const FACT_KEYS = ['eventType', 'title', 'eventDate', 'city', 'guestCount', 'budget', 'budgetRange'];

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

  if (Object.keys(errors).length) throw badRequest('VALIDATION_FAILED', 'Please check the event details', { fields: errors });
  return out;
}

export async function getOwnedEventOr404(customerId, eventId) {
  const event = await eventsRepo.findOwnedEvent(customerId, eventId);
  if (!event) throw notFound('Event not found');
  return event;
}

function defaultTitle(eventType) {
  const label = EVENT_TYPE_LABELS[eventType] || 'Event';
  return eventType === 'other' ? 'My event' : `My ${label.toLowerCase()}`;
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
    ...clean,
    title: clean.title || defaultTitle(clean.eventType),
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
  await eventsRepo.appendHistory({
    eventId: event._id,
    actorType,
    actorId,
    action: 'event_details_updated',
    details: { fields: Object.keys(clean).filter((k) => !['budgetMin', 'budgetMax'].includes(k)) },
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
    const v = String(value || '').trim().slice(0, 200);
    if (!v) return { applied: false, reason: 'no_value' };
    result = await reqRepo.upsertRequirement(event._id, cat, { status: 'customer_provided', source: 'customer', providedValue: v, ...NO_SELECTION }, {
      onlyIfStatusIn: ['missing', 'pending', 'customer_provided'],
    });
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
 * Customer changes one plan item. Only missing / pending / customer_provided
 * may be set; confirmed / booked / completed are locked (409); closed events
 * are read-only (400). A new category adds a service to the plan.
 */
export async function setRequirement(customerId, eventId, categoryParam, body = {}) {
  const category = normalizeCategory(categoryParam);
  if (!category) throw badRequest('UNKNOWN_CATEGORY', 'Unknown service');
  const extra = Object.keys(body || {}).filter((k) => !['status', 'providedValue'].includes(k));
  if (extra.length) throw badRequest('VALIDATION_FAILED', 'Only status and providedValue can be changed', { fields: Object.fromEntries(extra.map((k) => [k, 'Not editable'])) });
  const { status } = body;
  if (!CUSTOMER_SETTABLE.includes(status)) throw badRequest('INVALID_STATUS', 'You can mark a service as needed, arranged by you, or reset it');
  const value = typeof body.providedValue === 'string' ? body.providedValue.trim() : '';
  if (status === 'customer_provided' && !value) throw badRequest('VALUE_REQUIRED', 'Tell us who or what you have arranged');
  if (value.length > 200) throw badRequest('VALIDATION_FAILED', 'That name is too long');

  const event = await getOwnedEventOr404(customerId, eventId);
  if (CLOSED_EVENT_STATUSES.includes(event.status)) throw badRequest('EVENT_CLOSED', 'This event is closed and read-only');

  const existing = await reqRepo.findRequirement(event._id, category);
  if (existing && LOCKED_REQUIREMENT_STATUSES.includes(existing.status)) {
    throw conflict('REQUIREMENT_LOCKED', `${CATEGORY_LABELS[category]} is already ${existing.status} and can't be changed here`);
  }
  const { row, changed } = await reqRepo.upsertRequirement(
    event._id,
    category,
    {
      status,
      source: 'customer',
      providedValue: status === 'customer_provided' ? value : null,
      // Arranged elsewhere or reset: any earlier option choice no longer applies.
      ...(status !== 'pending' ? NO_SELECTION : {}),
    },
    { onlyIfStatusIn: CUSTOMER_SETTABLE }
  );
  if (!changed && LOCKED_REQUIREMENT_STATUSES.includes(row.status)) {
    throw conflict('REQUIREMENT_LOCKED', `${CATEGORY_LABELS[category]} can't be changed here`);
  }
  if (changed) {
    await eventsRepo.appendHistory({ eventId: event._id, actorType: 'customer', actorId: customerId, action: 'requirement_updated', details: { category, status } });
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
  const [signals, unread] = await Promise.all([attentionSignals(active.map((e) => e._id)), circleRepo.countUnread(customerId)]);
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
    if (seen.has(category)) throw badRequest('VALIDATION_FAILED', `${CATEGORY_LABELS[category]} is listed twice`);
    seen.add(category);
    if (!['pending', 'customer_provided'].includes(s.status)) throw badRequest('VALIDATION_FAILED', `${CATEGORY_LABELS[category]}: choose "Need help" or "Already arranged"`);
    const value = typeof s.providedValue === 'string' ? s.providedValue.trim() : '';
    if (s.status === 'customer_provided' && !value) throw badRequest('VALUE_REQUIRED', `${CATEGORY_LABELS[category]}: tell us who you have arranged`);
    if (value.length > 200) throw badRequest('VALIDATION_FAILED', `${CATEGORY_LABELS[category]}: name is too long`);
    statements.push({ category, status: s.status, providedValue: s.status === 'customer_provided' ? value : null });
  }

  const event = await eventsRepo.createEvent({
    ...facts,
    title: facts.title || defaultTitle(facts.eventType),
    customer: customerId,
    status: 'planning',
  });
  const t = templateFor(event.eventType);
  await reqRepo.insertMissingRequirements(event._id, [...t.essential, ...t.recommended, ...t.optional]);
  for (const st of statements) {
    await reqRepo.upsertRequirement(event._id, st.category, { status: st.status, source: 'customer', providedValue: st.providedValue });
  }
  await eventsRepo.appendHistory({ eventId: event._id, actorType: 'customer', actorId: customerId, action: 'event_created_manually', details: { eventType: event.eventType } });
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
  return { event: serializeEvent(event), option, selected: req?.selectedOptionId === option.id };
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
  };
}
