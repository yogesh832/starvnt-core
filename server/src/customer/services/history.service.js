import { listHistory } from '../repositories/events.repo.js';
import { categoryLabel, EVENT_TYPE_LABELS } from './planCatalog.js';

/**
 * Customer-safe timeline: plain-language text, whitelisted details only.
 * No internal ids, no operator names.
 */
const ACTOR = { customer: 'You', aura: 'Aura+', system: 'STARVNT', ops: 'STARVNT team', webhook: 'STARVNT' };
const STATUS_WORDS = {
  missing: 'not arranged yet',
  pending: 'needs help finding',
  customer_provided: 'arranged by you',
  confirmed: 'confirmed',
  booked: 'booked',
  completed: 'completed',
};
const EXECUTION_WORDS = { checked_in: 'checked in', started: 'started', completed: 'completed' };
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const FIELD_WORDS = { eventType: 'event type', eventDate: 'date', city: 'location', guestCount: 'guest count', budget: 'budget', budgetRange: 'budget', title: 'name' };

function describe(row) {
  const d = row.details || {};
  switch (row.action) {
    case 'event_draft_created':
      return { group: 'planning', text: `${EVENT_TYPE_LABELS[d.eventType] || 'Event'} draft started` };
    case 'event_confirmed':
      return { group: 'planning', text: 'Event plan created' };
    case 'event_details_updated': {
      const fields = [...new Set((d.fields || []).map((f) => FIELD_WORDS[f]).filter(Boolean))];
      return { group: 'planning', text: fields.length ? `Updated ${fields.join(', ')}` : 'Updated event details' };
    }
    case 'requirement_updated':
      return { group: 'planning', text: `${categoryLabel(d.category)}: ${STATUS_WORDS[d.status] || 'updated'}` };
    case 'preferences_updated':
      return { group: 'planning', text: `${categoryLabel(d.category)} preferences noted` };
    case 'option_selected':
      return { group: 'booking', text: `${categoryLabel(d.category)}: chose ${d.vendorName}${d.isDemo ? ' (demo listing)' : ''}` };
    case 'option_cleared':
      return { group: 'booking', text: `${categoryLabel(d.category)}: choice removed` };
    case 'quote_created':
      return { group: 'booking', text: `Quote created for ₹${Number(d.total).toLocaleString('en-IN')} (${d.itemCount} service${d.itemCount === 1 ? '' : 's'})` };
    case 'event_created_manually':
      return { group: 'planning', text: `${EVENT_TYPE_LABELS[d.eventType] || 'Event'} plan created from your details` };
    case 'quote_accepted':
      return { group: 'booking', text: `Quote accepted — ${d.itemCount} service${d.itemCount === 1 ? '' : 's'} on hold for 48 hours` };
    case 'payment_verified':
      return { group: 'booking', text: `Payment of ${inr(d.amount)} verified` };
    case 'payment_failed':
      return { group: 'booking', text: `Payment of ${inr(d.amount)} failed` };
    case 'booking_confirmed':
      return { group: 'booking', text: `${categoryLabel(d.category)} booked with ${d.vendorName}` };
    case 'booking_under_review':
      return { group: 'booking', text: `${categoryLabel(d.category)} booking under review` };
    case 'event_booked':
      return { group: 'booking', text: 'All essentials booked' };
    case 'booking_cancelled_by_vendor':
      return { group: 'booking', text: `${d.vendorName} cancelled ${categoryLabel(d.category)}` };
    case 'execution_updated':
      return { group: 'execution', text: `${categoryLabel(d.category)}: ${EXECUTION_WORDS[d.status] || 'updated'}` };
    case 'event_completed':
      return { group: 'execution', text: 'Event completed' };
    default:
      return null; // Unknown actions (e.g. internal ops notes) are never shown raw.
  }
}

export async function customerHistory(eventId, { limit = 200 } = {}) {
  const rows = await listHistory(eventId, limit);
  return rows
    .map((row) => {
      const text = describe(row);
      if (!text) return null;
      return { at: row.createdAt, actor: ACTOR[row.actorType] || 'STARVNT', group: text.group, text: text.text };
    })
    .filter(Boolean);
}
