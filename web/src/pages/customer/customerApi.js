import { externalApi } from '../../lib/api.js';

/** Customer App + Aura+ endpoints (server: /api/customer/*, /api/aura/*). */
export const customerApi = {
  profile: () => externalApi.call('/customer/profile'),
  planOptions: (eventType) => externalApi.call(`/customer/plan-options${eventType ? `?eventType=${encodeURIComponent(eventType)}` : ''}`),
  events: () => externalApi.call('/customer/events'),
  event: (id) => externalApi.call(`/customer/events/${id}`),
  patchEvent: (id, body) => externalApi.call(`/customer/events/${id}`, { method: 'PATCH', body }),
  confirmEvent: (id) => externalApi.call(`/customer/events/${id}/confirm`, { method: 'POST' }),
  home: () => externalApi.call('/customer/home'),
  dashboard: (id) => externalApi.call(`/customer/events/${id}/dashboard`),
  history: (id) => externalApi.call(`/customer/events/${id}/history`),
  requirements: (id) => externalApi.call(`/customer/events/${id}/requirements`),
  setRequirement: (id, category, body) =>
    externalApi.call(`/customer/events/${id}/requirements/${encodeURIComponent(category)}`, { method: 'PATCH', body }),
  services: (id, category) =>
    externalApi.call(`/customer/events/${id}/services${category ? `?category=${encodeURIComponent(category)}` : ''}`),
  serviceDetail: (id, optionId) => externalApi.call(`/customer/events/${id}/services/${encodeURIComponent(optionId)}`),
  compare: (id, ids) => externalApi.call(`/customer/events/${id}/services/compare?ids=${ids.map(encodeURIComponent).join(',')}`),
  selectOption: (id, category, optionId) =>
    externalApi.call(`/customer/events/${id}/requirements/${encodeURIComponent(category)}/select`, { method: 'POST', body: { optionId } }),
  quotes: (id) => externalApi.call(`/customer/events/${id}/quotes`),
  createQuote: (id) => externalApi.call(`/customer/events/${id}/quotes`, { method: 'POST' }),
  quote: (quoteId) => externalApi.call(`/customer/quotes/${quoteId}`),
  acceptQuote: (quoteId) => externalApi.call(`/customer/quotes/${quoteId}/accept`, { method: 'POST' }),
  bookings: (id) => externalApi.call(`/customer/events/${id}/bookings`),
  pay: (id, reservationId) => externalApi.call(`/customer/events/${id}/reservations/${reservationId}/pay`, { method: 'POST' }),
  checkoutComplete: (id, paymentId, body) =>
    externalApi.call(`/customer/events/${id}/payments/${paymentId}/checkout-complete`, { method: 'POST', body }),
  eventDay: (id) => externalApi.call(`/customer/events/${id}/event-day`),
  circle: (id) => externalApi.call(`/customer/events/${id}/circle`),
  messages: (id, ctx = {}) => {
    const q = ctx.bookingId ? `?bookingId=${ctx.bookingId}` : ctx.requirementId ? `?requirementId=${ctx.requirementId}` : '';
    return externalApi.call(`/customer/events/${id}/messages${q}`);
  },
  postMessage: (id, body) => externalApi.call(`/customer/events/${id}/messages`, { method: 'POST', body }),
  updates: () => externalApi.call('/customer/updates'),
  readAll: () => externalApi.call('/customer/notifications/read-all', { method: 'POST' }),
  createEvent: (body) => externalApi.call('/customer/events', { method: 'POST', body }),
  patchProfile: (body) => externalApi.call('/customer/profile', { method: 'PATCH', body }),
  auraSession: (sid, eventId) =>
    externalApi.call(`/aura/sessions/${encodeURIComponent(sid)}${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`),
  auraChat: (body) => externalApi.call('/aura/chat', { method: 'POST', body }),
};

/** Human message for an API error. */
export function errorText(err, fallback = 'Something went wrong. Please try again.') {
  return err?.data?.message || fallback;
}
