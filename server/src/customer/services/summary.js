import { categoryLabel, tierOf, templateFor, budgetRangeLabel } from './planCatalog.js';
import { HANDLED_STATUSES, progressOf } from './understanding.js';

/**
 * Event summary, journey steps and attention list (Blueprint §5).
 * Pure functions over stored rows: nothing here is invented or assumed.
 */

/**
 * @param stats Map category → { optionCount, lowestPrice, lowestIsDemo } from the catalogue
 * @param bookings rows with { category, amount, vendorName } (none until bookings exist)
 */
export function computeEventSummary(event, requirements, stats = new Map(), bookings = []) {
  const bookedByCat = new Map(bookings.map((b) => [b.category, b]));
  const items = requirements.map((r) => {
    const handled = HANDLED_STATUSES.includes(r.status);
    const s = stats.get(r.category) || { optionCount: 0, lowestPrice: null, lowestIsDemo: false };
    const booked = bookedByCat.get(r.category);
    return {
      category: r.category,
      label: categoryLabel(r.category),
      tier: tierOf(event.eventType, r.category),
      status: r.status,
      providedValue: r.providedValue || null,
      selected: Boolean(r.selectedOptionId),
      selectedOption: r.selectedOptionId ? r.selectedOption : null,
      optionCount: s.optionCount,
      // Only for things still to arrange; "lowest listed option", never a quote.
      estimatedCost: handled ? null : s.lowestPrice,
      estimateIsDemo: handled ? false : Boolean(s.lowestIsDemo && s.lowestPrice != null),
      bookedCost: booked?.amount ?? null,
      vendorName: booked?.vendorName ?? null,
    };
  });

  // What the customer is actually planning to arrange: essentials + anything they asked for.
  const inScope = items.filter((i) => i.tier === 'essential' || i.status === 'pending');
  const committedCost = items.reduce((sum, i) => sum + (i.bookedCost || 0), 0);
  const estimatedCost = inScope.reduce((sum, i) => sum + (i.estimatedCost || 0), 0);
  const withoutEstimate = inScope.filter((i) => !HANDLED_STATUSES.includes(i.status) && i.estimatedCost == null).map((i) => i.label);
  const target = event.budget ?? event.budgetMax ?? null;

  return {
    items,
    ...progressOf(event, requirements),
    budget: {
      target,
      isRange: event.budget == null && (event.budgetMin != null || event.budgetMax != null),
      rangeLabel: event.budget == null ? budgetRangeLabel(event.budgetMin, event.budgetMax) : null,
      committedCost,
      estimatedCost,
      remaining: target == null ? null : target - committedCost - estimatedCost,
      servicesWithoutEstimate: withoutEstimate,
      estimateUsesDemoData: inScope.some((i) => i.estimateIsDemo),
    },
  };
}

const STEP_LABELS = [
  ['planning', 'Planning'],
  ['vendors', 'Vendors'],
  ['booking', 'Booking'],
  ['payment', 'Payment'],
  ['execution', 'Execution'],
  ['completed', 'Completed'],
];
const AT_LEAST_BOOKED = ['booked', 'in_progress', 'completed'];

/** Journey tracker, derived only from state and counts. */
export function eventSteps(event, requirements) {
  const essentials = templateFor(event.eventType).essential;
  const byCat = new Map(requirements.map((r) => [r.category, r]));
  const essentialsDecided = essentials.every((c) => {
    const r = byCat.get(c);
    return r && (HANDLED_STATUSES.includes(r.status) || r.selectedOptionId);
  });
  const done = {
    planning: event.status !== 'draft',
    vendors: event.status !== 'draft' && essentialsDecided,
    booking: AT_LEAST_BOOKED.includes(event.status),
    payment: AT_LEAST_BOOKED.includes(event.status),
    execution: event.status === 'completed',
    completed: event.status === 'completed',
  };
  let currentFound = false;
  return STEP_LABELS.map(([key, label]) => {
    let state = done[key] ? 'done' : 'upcoming';
    if (!done[key] && !currentFound && event.status !== 'cancelled') {
      state = 'current';
      currentFound = true;
    }
    return { key, label, state };
  });
}

/**
 * Attention items built only from real rows. Quotes, reservations and
 * payments join this list when those phases exist.
 */
export function attentionFor(event, { draftQuotes = 0, awaitingPayment = 0, failedPayments = 0 } = {}) {
  const items = [];
  if (awaitingPayment > 0) {
    items.push({
      type: 'reservation_awaiting_payment',
      eventId: String(event._id),
      title: `${awaitingPayment} reservation${awaitingPayment > 1 ? 's' : ''} awaiting payment`,
      detail: 'Holds last 48 hours. Pay to request confirmation.',
    });
  }
  if (failedPayments > 0) {
    items.push({
      type: 'payment_failed',
      eventId: String(event._id),
      title: 'A payment failed',
      detail: 'You can try again while the hold is active.',
    });
  }
  if (draftQuotes > 0) {
    items.push({
      type: 'quote_awaiting_decision',
      eventId: String(event._id),
      title: 'Review your quote',
      detail: `A quote for ${event.title || 'your event'} is waiting for your decision`,
    });
  }
  if (event.status === 'draft') {
    items.push({
      type: 'draft_to_confirm',
      eventId: String(event._id),
      title: 'Confirm your event details',
      detail: `${event.title || 'Your event'} is still a draft`,
    });
  }
  return items;
}
