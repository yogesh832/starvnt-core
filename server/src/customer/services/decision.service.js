import * as eventsRepo from '../repositories/events.repo.js';
import * as reqRepo from '../repositories/requirements.repo.js';
import * as quotesRepo from '../repositories/quotes.repo.js';
import * as catalog from './catalog.service.js';
import { getOwnedEventOr404 } from './events.service.js';
import { serializeEvent, serializeRequirement } from './understanding.js';
import { categoryLabel, normalizeCategory } from './planCatalog.js';
import { CLOSED_EVENT_STATUSES, LOCKED_REQUIREMENT_STATUSES } from '../models/index.js';
import { badRequest, conflict, notFound, HttpError } from '../utils/http.js';

/**
 * Customer decision + quote (Blueprint §6, phase 8).
 * Selecting is the customer's explicit choice; the plan item stays "pending".
 * A quote snapshots the selections. Neither is a reservation or a booking.
 */

const QUOTE_VALID_DAYS = 7;
export const EMPTY_SELECTION = { vendorName: null, packageName: null, price: null, isDemo: false };

export function assertCommerceAllowed(event) {
  if (event.status === 'draft') throw badRequest('EVENT_NOT_CONFIRMED', 'Please confirm your event details first');
  if (CLOSED_EVENT_STATUSES.includes(event.status)) throw badRequest('EVENT_CLOSED', 'This event is closed and read-only');
}

/** optionId = null clears the choice. */
export async function selectOption(customerId, eventId, categoryParam, optionId) {
  const category = normalizeCategory(categoryParam);
  if (!category) throw badRequest('UNKNOWN_CATEGORY', 'Unknown service');
  const event = await getOwnedEventOr404(customerId, eventId);
  assertCommerceAllowed(event);

  const existing = await reqRepo.findRequirement(event._id, category);
  if (existing && LOCKED_REQUIREMENT_STATUSES.includes(existing.status)) {
    throw conflict('REQUIREMENT_LOCKED', `${categoryLabel(category)} is already ${existing.status}`);
  }

  if (optionId === null) {
    if (!existing?.selectedOptionId) return serializeRequirement(event.eventType, existing || { _id: null, category, status: 'missing' });
    const { row } = await reqRepo.upsertRequirement(event._id, category, { selectedOptionId: null, selectedOption: EMPTY_SELECTION });
    await eventsRepo.appendHistory({ eventId: event._id, actorType: 'customer', actorId: customerId, action: 'option_cleared', details: { category } });
    return serializeRequirement(event.eventType, row);
  }
  if (typeof optionId !== 'string' || !optionId) throw badRequest('OPTION_REQUIRED', 'Choose an option');

  let option;
  try {
    option = await catalog.getOption(event, optionId);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) throw badRequest('OPTION_UNAVAILABLE', 'That option is no longer available');
    throw err;
  }
  if (option.category !== category) throw badRequest('WRONG_CATEGORY', `That option is not a ${categoryLabel(category).toLowerCase()} option`);
  if (!catalog.isBookable(option)) throw badRequest('OPTION_NOT_AVAILABLE', 'That option is not available on your date');
  if (option.price == null) throw badRequest('NO_PRICE', 'That option has no fixed total yet, so it can’t be quoted');

  const { row, changed } = await reqRepo.upsertRequirement(
    event._id,
    category,
    {
      // Choosing an option means the customer wants help with this service.
      status: 'pending',
      source: 'customer',
      providedValue: null,
      selectedOptionId: option.id,
      selectedOption: { vendorName: option.vendorName, packageName: option.packageName, price: option.price, isDemo: option.isDemo },
    },
    { onlyIfStatusIn: ['missing', 'pending', 'customer_provided'] }
  );
  if (!changed && LOCKED_REQUIREMENT_STATUSES.includes(row.status)) throw conflict('REQUIREMENT_LOCKED', `${categoryLabel(category)} can’t be changed now`);
  await eventsRepo.appendHistory({
    eventId: event._id,
    actorType: 'customer',
    actorId: customerId,
    action: 'option_selected',
    details: { category, vendorName: option.vendorName, isDemo: option.isDemo },
  });
  return serializeRequirement(event.eventType, row);
}

export function serializeQuote(q) {
  return {
    id: String(q._id),
    eventId: String(q.event),
    status: q.status,
    total: q.total,
    validUntil: q.validUntil,
    acceptedAt: q.acceptedAt,
    createdAt: q.createdAt,
    includesDemo: q.items.some((i) => i.isDemo),
    items: q.items.map((i) => ({
      id: String(i._id),
      category: i.category,
      label: categoryLabel(i.category),
      optionId: i.optionId,
      vendorName: i.vendorName,
      packageName: i.packageName,
      price: i.price,
      costBreakdown: i.costBreakdown,
      isDemo: i.isDemo,
    })),
  };
}

/**
 * Snapshot the current selections into a new draft quote (valid 7 days).
 * Each selection is re-validated first; an older draft is superseded.
 */
export async function createQuote(customerId, eventId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  assertCommerceAllowed(event);
  const selected = (await reqRepo.listRequirements(event._id)).filter((r) => r.selectedOptionId && r.status === 'pending');
  if (!selected.length) throw badRequest('NO_SELECTIONS', 'Select at least one option first');

  const items = [];
  const problems = [];
  for (const r of selected) {
    try {
      const o = await catalog.getOption(event, r.selectedOptionId);
      if (o.category !== r.category || !catalog.isBookable(o) || o.price == null) throw new Error('unavailable');
      items.push({
        requirement: r._id,
        category: r.category,
        optionId: o.id,
        vendorName: o.vendorName,
        packageName: o.packageName,
        price: o.price,
        costBreakdown: o.costBreakdown || {},
        isDemo: o.isDemo,
      });
    } catch {
      problems.push(categoryLabel(r.category));
    }
  }
  if (problems.length) {
    throw conflict('SELECTION_UNAVAILABLE', `These choices are no longer available: ${problems.join(', ')}. Please choose again.`, { categories: problems });
  }

  const { quote, supersededCount } = await quotesRepo.createSuperseding({
    event: event._id,
    customer: customerId,
    status: 'draft',
    items,
    total: items.reduce((s, i) => s + i.price, 0),
    validUntil: new Date(Date.now() + QUOTE_VALID_DAYS * 86400000),
  });
  await eventsRepo.appendHistory({
    eventId: event._id,
    actorType: 'customer',
    actorId: customerId,
    action: 'quote_created',
    details: { total: quote.total, itemCount: items.length, superseded: supersededCount },
  });
  return serializeQuote(quote);
}

export async function listQuotes(customerId, eventId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  const [quotes, requirements] = await Promise.all([quotesRepo.listForEvent(event._id), reqRepo.listRequirements(event._id)]);
  return {
    event: serializeEvent(event),
    selections: requirements
      .filter((r) => r.selectedOptionId && r.status === 'pending')
      .map((r) => serializeRequirement(event.eventType, r)),
    quotes: quotes.map(serializeQuote),
  };
}

export async function getQuote(customerId, quoteId) {
  const q = await quotesRepo.findOwned(customerId, quoteId).catch(() => null);
  if (!q) throw notFound('Quote not found');
  return serializeQuote(q);
}
