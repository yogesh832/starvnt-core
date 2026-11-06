import { proposalLink } from './transactionState.js';
export function pendingEventProposals(proposals, eventId) {

  return proposals.filter(proposal => String(proposal.event?.id || proposal.event?._id || proposal.event) === String(eventId)

    && !proposal.response?.decision);

}



export function nextHomeAction(event, attention = [], proposals = []) {

  const base = `/customer/events/${encodeURIComponent(event.id)}`;

  if (attention.length) {

    const item = attention[0];

    if (event.status === 'draft' && item.type === 'draft_to_confirm') return { title: item.title, detail: item.detail, to: `/customer/events/new?draft=${encodeURIComponent(event.id)}`, label: 'Continue planning' };

    const fallback = item.type === 'quote_awaiting_decision' ? `${base}/quotes`

      : ['reservation_awaiting_payment', 'payment_failed'].includes(item.type) ? `${base}/bookings` : base;

    // Saved records may contain legacy destinations: keep actions inside this event.

    const destination = typeof item.actionUrl === 'string' && (item.actionUrl === base || item.actionUrl.startsWith(`${base}/`) || item.actionUrl.startsWith(`${base}?`)) ? item.actionUrl : fallback;

    return { title: item.title, detail: item.detail, to: destination, label: 'Review next step' };

  }

  if (proposals.length) return { title: 'Your proposal is ready to review.', detail: 'Review the exact version, scope and terms. Approval does not confirm a booking.', to: proposalLink(event.id, proposals[0]._id || proposals[0].id), label: 'Review proposal' };

  if (event.status === 'draft') return { title: 'Continue your event plan.', detail: 'Review the details you have saved and fill in what is still missing.', to: `/customer/events/new?draft=${encodeURIComponent(event.id)}`, label: 'Continue planning' };

  return { title: 'Review your event.', detail: 'Check your requirements, bookings and important records before making your next decision.', to: base, label: 'Review event' };

}
