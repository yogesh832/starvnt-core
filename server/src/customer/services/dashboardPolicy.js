const DAY = 86400000;
import { templateFor } from './planCatalog.js';
export function dashboardExperience(event, requirements, bookings, payments, history = []) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const daysUntilEvent = event.eventDate ? Math.round((Date.parse(`${event.eventDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY) : null;
  const confirmed = bookings.filter(b => b.status === 'confirmed');
  const essentials = new Set(templateFor(event.eventType).essential);
  const decisions = requirements.filter(r => r.source === 'aura_inferred' || r.status === 'pending' || (r.status === 'missing' && essentials.has(r.category)));
  let lifecycle = 'Planning';
  if (event.status === 'cancelled') lifecycle = 'Cancelled';
  else if (event.status === 'completed') lifecycle = 'Memories';
  else if (event.status === 'in_progress' || (daysUntilEvent === 0 && event.status !== 'draft')) lifecycle = 'Event Day';
  else if (confirmed.length) lifecycle = decisions.length ? 'Booking' : 'Preparing';
  else if (requirements.some(r => r.selectedOptionId)) lifecycle = 'Comparing';
  const risks = history.filter(h => ['event_details_updated', 'requirement_updated', 'service_location_updated', 'preferences_updated'].includes(h.action)).slice(0, 3).map(h => ({
    type: 'plan_change', eventId: String(event._id), title: h.details?.fields?.includes('guestCount') ? 'Guest count changed' : 'Planning details changed', detail: 'Review existing quotes and arrangements against your updated requirements.', actionUrl: `/customer/events/${event._id}/history`, changedAt: h.createdAt,
  }));
  return { lifecycle, daysUntilEvent, decisionsPending: decisions.length, proposedRequirements: requirements.filter(r => r.source === 'aura_inferred').map(r => ({ category: r.category, status: r.status, value: r.providedValue })), confirmedBookings: confirmed.length, verifiedPaidAmount: payments.filter(p => p.status === 'verified').reduce((sum, p) => sum + Number(p.amount || 0), 0), risks };
}
