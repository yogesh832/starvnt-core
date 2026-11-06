const amount = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
export function offerTerms(quote) {
  const total = amount(quote.totalAmount ?? quote.pricingBreakdown?.totalAmount);
  const advance = amount(quote.advanceAmount);
  const percent = amount(quote.advancePercentage);
  return { total, advance, percent, balance: total != null && advance != null ? Math.max(0, total - advance) : null };
}
export function offersForEvent(data, eventId) {
  const quotes = (data?.quotes || []).filter(row => String(row.eventId) === String(eventId));
  const quoted = new Set(quotes.map(row => String(row.opportunityId)));
  return { quotes, requests: (data?.opportunities || []).filter(row => String(row.customerEvent) === String(eventId) && !quoted.has(String(row._id || row.id))) };
}
export function offerBlockReason(quote, event, now = Date.now()) {
  if (String(quote.eventId) !== String(event.id)) return 'This offer is not linked to this event.';
  if (event.status !== 'planning') return 'Open a confirmed event plan before accepting an offer.';
  if (quote.eventDate !== event.eventDate) return 'The event date has changed. Ask for an updated offer.';
  if (quote.validUntil && new Date(quote.validUntil).getTime() <= now) return 'This offer has expired. Ask for an updated offer.';
  return null;
}
export function reservationPayment(payments, reservationId) {
  const rows = payments.filter(row => row.reservationId === reservationId);
  // A newer failed attempt must never hide an earlier verified or in-flight payment.
  return rows.find(row => row.status === 'verified') || rows.find(row => ['processing', 'paid'].includes(row.status)) || rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}
export function reservationCanPay(reservation, payment, configured, now = Date.now()) {
  return Boolean(configured && reservation.status === 'pending_payment' && new Date(reservation.expiresAt).getTime() > now && !['processing', 'paid', 'verified'].includes(payment?.status));
}
export function bookingLabel(booking) {
  if (booking.source && booking.source !== 'STARVNT') return ['Vendor-reported external arrangement', 'bg-gray-100 text-muted'];
  return ({ confirmed: ['Confirmed by STARVNT', 'bg-emerald-50 text-emerald-700'], pending: ['Under review', 'bg-amber-50 text-amber-700'], cancelled: ['Cancelled', 'bg-gray-100 text-muted'] })[booking.status] || ['Status unavailable', 'bg-gray-100 text-muted'];
}
export const proposalLink = (eventId, proposalId) => `/customer/proposals?event=${encodeURIComponent(eventId)}${proposalId ? `&proposal=${encodeURIComponent(proposalId)}` : ''}`;
