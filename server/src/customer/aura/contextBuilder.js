import * as core from './coreClient.js';
import { todayISO } from '../services/dates.js';
import { categoryLabel, tierOf, EVENT_TYPE_LABELS, budgetRangeLabel } from '../services/planCatalog.js';
import { buildContextStates, nextQuestion, progressOf } from '../services/understanding.js';
import { computeEventSummary } from '../services/summary.js';

/**
 * CURRENT DATA for Aura+'s prompt. Kept small on purpose: with a full vendor
 * list Gemini took 15–17 s and hit the 12 s timeout. Vendors are empty when
 * there is no event or the event is still a draft.
 */
export async function buildContext({ customer, event }) {
  const confirmed = event && event.status !== 'draft';
  const [requirements, contextRows, allEvents, stats, bookingRows, paymentRows, reservationRows] = await Promise.all([
    event ? core.listRequirements(event._id) : [],
    event ? core.listContext(event._id) : [],
    core.listEvents(customer._id),
    confirmed ? core.optionStats(event) : null,
    confirmed ? core.readBookings(event._id) : [],
    confirmed ? core.readPayments(event._id) : [],
    confirmed ? core.readReservations(event._id) : [],
  ]);
  const budgetSummary = confirmed
    ? computeEventSummary(event, requirements, stats, bookingRows.filter((b) => b.status === 'confirmed')).budget
    : null;
  const bookings = bookingRows.map((b) => ({
    service: categoryLabel(b.category),
    vendor: b.isDemo ? `${b.vendorName} (demo listing)` : b.vendorName,
    status: b.status === 'pending' ? 'under_review' : b.status,
    eventDay: b.executionStatus,
    amount: b.amount,
  }));
  const count = (rows, s) => rows.filter((r) => r.status === s).length;
  const paymentStatus = confirmed
    ? {
        awaitingPayment: count(reservationRows, 'pending_payment'),
        processing: count(paymentRows, 'processing') + count(paymentRows, 'paid'),
        verified: count(paymentRows, 'verified'),
        failed: count(paymentRows, 'failed'),
      }
    : null;
  // Only categories still needed: customer-requested ones, then open essentials.
  const needed = confirmed
    ? requirements
        .filter((r) => r.status === 'pending' || (r.status === 'missing' && tierOf(event.eventType, r.category) === 'essential'))
        .map((r) => r.category)
        .slice(0, 6)
    : [];
  const vendors = needed.length ? await core.compactOptions(event, needed) : [];

  const pastEvents = allEvents
    .filter((e) => !event || String(e._id) !== String(event._id))
    .slice(0, 5)
    .map((e) => ({ title: e.title, eventType: e.eventType, date: e.eventDate, city: e.city, status: e.status }));

  const inferredNotes = contextRows
    .filter((r) => r.state === 'INFERRED')
    .map((r) => ({ field: r.field, value: r.value }));

  // Draft / no event: the app appends the next question itself (after this
  // turn's writes), so the model isn't shown a question that may be stale.
  const clarification = event && event.status !== 'draft' ? nextQuestion(event, requirements, contextRows) : null;

  return {
    raw: { requirements, contextRows },
    prompt: {
      today: todayISO(),
      customerFirstName: (customer.fullName || '').split(' ')[0] || null,
      event: event
        ? {
            title: event.title,
            eventType: event.eventType ? EVENT_TYPE_LABELS[event.eventType] : null,
            status: event.status,
            date: event.eventDate,
            city: event.city,
            guestCount: event.guestCount,
            budget: event.budget,
            budgetRange: event.budget == null ? budgetRangeLabel(event.budgetMin, event.budgetMax) : null,
            ...progressOf(event, requirements),
          }
        : null,
      eventPlan: event
        ? requirements.map((r) => ({
            service: categoryLabel(r.category),
            tier: tierOf(event.eventType, r.category),
            status: r.status,
            providedValue: r.providedValue || undefined,
            // The customer's own choice (not booked, not reserved).
            chosenOption: r.selectedOptionId
              ? `${r.selectedOption?.vendorName}${r.selectedOption?.isDemo ? ' (demo listing)' : ''} – ₹${r.selectedOption?.price}`
              : undefined,
            preferences: Object.keys(r.preferences || {}).length ? r.preferences : undefined,
          }))
        : [],
      // committedCost = booked amounts; estimatedCost = lowest listed options for what's still open.
      budgetSummary,
      contextStates: buildContextStates(event, requirements, contextRows),
      inferredNotes,
      clarification: clarification ? { topic: clarification.topic, question: clarification.question } : null,
      vendors, // [] when there is no event or it is a draft
      bookings,
      paymentStatus, // STATUS only; never settlement

      pastEvents,
    },
  };
}
