import * as eventsRepo from '../repositories/events.repo.js';
import * as reqRepo from '../repositories/requirements.repo.js';
import * as quotesRepo from '../repositories/quotes.repo.js';
import * as catalog from './catalog.service.js';
import { Opportunity } from '../../external/models/Opportunity.js';
import { notifyVendor } from '../../notifications/notification.service.js';
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

function eventServiceLocation(event) {
  const location = event?.location || {};
  return {
    address: location.address || [location.venueName, location.locality, event?.city].filter(Boolean).join(', '),
    locality: location.locality || '',
    city: event?.city || location.city || '',
    coordinates: location.coordinates || undefined,
  };
}

function serviceRequirementSummary(requirement, option, event) {
  const parts = [
    option.packageName,
    requirement?.specialRequirements,
    requirement?.preferences && Object.keys(requirement.preferences || {}).length
      ? Object.entries(requirement.preferences)
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
          .join(' | ')
      : '',
    event?.guestCount ? `${event.guestCount} guests` : '',
  ].filter(Boolean);
  return parts.join(' · ') || 'Customer selected this vendor option and requested a formal quote.';
}

async function createVendorOpportunityForSelection({ customerId, event, requirement, option, optionId }) {
  if (!option?.vendorId || option.isDemo || typeof optionId !== 'string' || !optionId.startsWith('vs_')) return;
  const vendorServiceId = optionId.slice(3);
  const eventDate = event.eventDate || new Date().toISOString().slice(0, 10);
  const serviceLocation = eventServiceLocation(event);
  const existing = await Opportunity.findOne({
    vendor: option.vendorId,
    customer: customerId,
    vendorService: vendorServiceId,
    eventDate,
    status: { $ne: 'EXPIRED' },
  }).sort({ createdAt: -1 });

  const payload = {
    serviceName: option.packageName || categoryLabel(option.category),
    eventDate,
    serviceLocation,
    guestCount: event.guestCount || 100,
    requiredCapability: serviceRequirementSummary(requirement, option, event),
    estimatedTravel: `${option.vendorLocation || 'Vendor base'} -> ${serviceLocation.locality || serviceLocation.city || 'Event location'}`,
    travelCost: Number(option.costBreakdown?.travel || 0),
    action: 'Respond / Quote',
  };

  if (existing) {
    Object.assign(existing, payload);
    if (existing.status === 'DECLINED') existing.status = 'NEW';
    await existing.save();
    return;
  }

  const opportunity = await Opportunity.create({
    vendor: option.vendorId,
    customer: customerId,
    vendorService: vendorServiceId,
    status: 'NEW',
    ...payload,
  });

  await notifyVendor({
    vendorId: option.vendorId,
    title: 'New quote request',
    message: `${payload.serviceName} · ${eventDate} · ${serviceLocation.locality || serviceLocation.city || 'Event location'} · ${payload.guestCount} guests`,
    type: 'ENQUIRY',
    priority: 'HIGH',
    link: '/vendor/enquiries',
    idempotencyKey: `vendor.enquiry.selection.${opportunity._id}`,
    metadata: {
      opportunityId: opportunity._id,
      customerEventId: event._id,
      selectedOptionId: optionId,
    },
  });
}

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
  await createVendorOpportunityForSelection({ customerId, event, requirement: row, option, optionId });
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

export async function requestVendorQuotes(customerId, eventId) {
  const event = await getOwnedEventOr404(customerId, eventId);
  assertCommerceAllowed(event);
  const selected = (await reqRepo.listRequirements(event._id)).filter((r) => r.selectedOptionId && r.status === 'pending');
  if (!selected.length) throw badRequest('NO_SELECTIONS', 'Select at least one real vendor option first');

  let requestedCount = 0;
  let skippedDemoCount = 0;
  const problems = [];
  for (const r of selected) {
    try {
      const option = await catalog.getOption(event, r.selectedOptionId);
      if (!option.vendorId || option.isDemo) {
        skippedDemoCount += 1;
        continue;
      }
      await createVendorOpportunityForSelection({ customerId, event, requirement: r, option, optionId: r.selectedOptionId });
      requestedCount += 1;
    } catch {
      problems.push(categoryLabel(r.category));
    }
  }
  if (!requestedCount && skippedDemoCount > 0) {
    throw badRequest('NO_REAL_VENDOR_SELECTIONS', 'Select a real vendor option first. Demo listings can continue through catalog quote flow only.');
  }
  if (!requestedCount) throw badRequest('NO_VENDOR_REQUESTS_CREATED', 'No vendor quote request could be created for the current selections.');
  await eventsRepo.appendHistory({
    eventId: event._id,
    actorType: 'customer',
    actorId: customerId,
    action: 'vendor_quote_requested',
    details: { requestedCount, skippedDemoCount, problems },
  });
  return { ok: true, requestedCount, skippedDemoCount, problems };
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
