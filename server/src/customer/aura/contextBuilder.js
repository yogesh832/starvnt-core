import * as core from './coreClient.js';
import { todayISO } from '../services/dates.js';
import { categoryLabel, tierOf, EVENT_TYPE_LABELS, budgetRangeLabel } from '../services/planCatalog.js';
import { buildContextStates, nextQuestion, progressOf, eventTypeLabelOf, locationLabel, serviceLocationText } from '../services/understanding.js';
import { computeEventSummary } from '../services/summary.js';

/**
 * CURRENT DATA for Aura+'s prompt. Kept small on purpose: with a full vendor
 * list Gemini took 15–17 s and hit the 12 s timeout. Public vendor rows remain
 * compact, but draft status and requirement categories must not hide records.
 */
export async function buildContext({ customer, event, catalogScope = event }) {
  const confirmed = event && event.status !== 'draft';
  const [requirements, contextRows, allEvents, stats, bookingRows, paymentRows, reservationRows, financialTruth] = await Promise.all([
    event ? core.listRequirements(event._id) : [],
    event ? core.listContext(event._id) : [],
    core.listEvents(customer._id),
    confirmed ? core.optionStats(event) : null,
    confirmed ? core.readBookings(event._id) : [],
    confirmed ? core.readPayments(event._id) : [],
    confirmed ? core.readReservations(event._id) : [],
    confirmed ? core.readFinancialTruth(customer._id, event._id) : null,
  ]);
  const budgetSummary = financialTruth ? core.financialBudgetSummary(financialTruth) : null;
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
  const vendors = await core.vendorCatalog(catalogScope);

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
      activity: await core.readActivity(customer._id, event?._id),
      customerFirstName: (customer.fullName || '').split(' ')[0] || null,
      event: event
        ? {
            title: event.title,
            eventType: eventTypeLabelOf(event),
            status: event.status,
            date: event.eventDate,
            city: event.city,
            location: locationLabel(event),
            venueName: event.location?.venueName || null,
            area: event.location?.locality || null,
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
            serviceLocation: serviceLocationText(r.serviceLocation, locationLabel(event)) || undefined,
          }))
        : [],
      // Shared Core budget contract; estimates, commitments and verified payments remain separate.
      budgetSummary,
      contextStates: buildContextStates(event, requirements, contextRows),
      inferredNotes,
      clarification: clarification ? { topic: clarification.topic, question: clarification.question } : null,
      vendors,
      vendorSearch: { source: 'customer_catalog_api', city: catalogScope?.city || null, date: catalogScope?.eventDate || null, guestCount: catalogScope?.guestCount || null, serviceCount: vendors.length, vendorCount: new Set(vendors.map(v => v.vendorId || v.vendor)).size, locationRequired: !catalogScope?.city && !catalogScope?.location?.coordinates },
      bookings,
      paymentStatus, // STATUS only; never settlement

      pastEvents,
    },
  };
}
