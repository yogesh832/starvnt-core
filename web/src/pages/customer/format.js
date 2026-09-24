/** Formatting helpers. Dates are 'YYYY-MM-DD' strings: no timezone shift. */

export function formatDate(iso, { withYear = true } = {}) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

export function formatINR(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

export function budgetText(event) {
  if (!event) return null;
  if (event.budget != null) return formatINR(event.budget);
  return event.budgetRangeLabel || null;
}

export const EVENT_STATUS_LABEL = {
  draft: 'Draft – confirm details',
  planning: 'Planning',
  booked: 'Booked',
  in_progress: 'Event day',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Where an attention item takes the customer. */
export function attentionLink(a) {
  if (a.type === 'quote_awaiting_decision') return `/customer/events/${a.eventId}/quotes`;
  if (a.type === 'reservation_awaiting_payment' || a.type === 'payment_failed') return `/customer/events/${a.eventId}/bookings`;
  return `/customer/events/${a.eventId}`;
}

/** Customer-facing wording for a plan item's status. */
export function planStatus(req) {
  switch (req.status) {
    case 'pending':
      if (req.selectedOption?.vendorName) {
        return { text: `Selected · ${req.selectedOption.vendorName}${req.selectedOption.isDemo ? ' (demo)' : ''}`, tone: 'primary' };
      }
      return { text: 'Need help finding', tone: 'amber' };
    case 'customer_provided':
      return { text: req.providedValue ? `Arranged by you · ${req.providedValue}` : 'Arranged by you', tone: 'emerald' };
    case 'confirmed':
      return { text: 'Confirmed', tone: 'emerald' };
    case 'booked':
      return { text: 'Booked', tone: 'emerald' };
    case 'completed':
      return { text: 'Completed', tone: 'emerald' };
    default:
      return { text: 'Not arranged yet', tone: 'muted' };
  }
}
