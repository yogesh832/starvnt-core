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
  requestVendorQuotes: (id) => externalApi.call(`/customer/events/${id}/vendor-quote-requests`, { method: 'POST' }),
  createQuote: (id) => externalApi.call(`/customer/events/${id}/quotes`, { method: 'POST' }),
  quote: (quoteId) => externalApi.call(`/customer/quotes/${quoteId}`),
  acceptQuote: (quoteId) => externalApi.call(`/customer/quotes/${quoteId}/accept`, { method: 'POST' }),
  generateVoice: (text) => externalApi.raw('/ai/voice', { method: 'POST', body: { text } }).then(r => r.blob()),
  bookings: (id) => externalApi.call(`/customer/events/${id}/bookings`),
  previewCoupon: (id, reservationId, couponCode) =>
    externalApi.call(`/customer/events/${id}/reservations/${reservationId}/coupon-preview`, { method: 'POST', body: { couponCode } }),
  pay: (id, reservationId, couponCode = '') =>
    externalApi.call(`/customer/events/${id}/reservations/${reservationId}/pay`, { method: 'POST', body: { couponCode } }),
  checkoutComplete: (id, paymentId, body) =>
    externalApi.call(`/customer/events/${id}/payments/${paymentId}/checkout-complete`, { method: 'POST', body }),
  eventDay: (id) => externalApi.call(`/customer/events/${id}/event-day`),
  circle: (id) => externalApi.call(`/customer/events/${id}/circle`),
  messages: (id, ctx = {}) => {
    const params = new URLSearchParams();
    if (ctx.bookingId) params.set('bookingId', ctx.bookingId);
    if (ctx.requirementId) params.set('requirementId', ctx.requirementId);
    if (ctx.threadId) params.set('threadId', ctx.threadId);
    const qs = params.toString();
    return externalApi.call(`/customer/events/${id}/messages${qs ? `?${qs}` : ''}`);
  },
  postMessage: (id, body) => externalApi.call(`/customer/events/${id}/messages`, { method: 'POST', body }),
  updates: () => externalApi.call('/customer/updates'),
  readAll: () => externalApi.call('/customer/notifications/read-all', { method: 'POST' }),
  readNotification: (id) => externalApi.call(`/customer/notifications/${id}/read`, { method: 'POST' }),
  createEvent: (body) => externalApi.call('/customer/events', { method: 'POST', body }),
  createMahimanDemoEnquiry: (body = {}) => externalApi.call('/customer/demo/mahiman-enquiry', { method: 'POST', body }),
  vendorQuotes: () => externalApi.call('/customer/vendor-quotes'),
  acceptVendorQuote: (quoteId, eventId) =>
    externalApi.call(`/customer/vendor-quotes/${quoteId}/accept`, { method: 'POST', body: { eventId } }),
  negotiateVendorQuote: (quoteId, message, counterBudget) =>
    externalApi.call(`/customer/vendor-quotes/${quoteId}/negotiate`, { method: 'POST', body: { message, counterBudget } }),
  payVendorQuoteAdvance: (quoteId, couponCode = '') =>
    externalApi.call(`/customer/vendor-quotes/${quoteId}/pay-advance`, { method: 'POST', body: { couponCode } }),
  completeVendorQuoteCheckout: (quoteId, body) =>
    externalApi.call(`/customer/vendor-quotes/${quoteId}/checkout-complete`, { method: 'POST', body }),
  reconcileVendorQuotePayment: (quoteId) => externalApi.call(`/customer/vendor-quotes/${quoteId}/reconcile-payment`, { method: 'POST' }),
  verifyVendorBookingCompletion: (bookingId, notes = '') =>
    externalApi.call(`/customer/bookings/${bookingId}/verify-completion`, { method: 'POST', body: { notes } }),
  cancelBooking: (bookingId) => externalApi.call(`/customer/bookings/${bookingId}`, { method: 'DELETE' }),
  patchProfile: (body) => externalApi.call('/customer/profile', { method: 'PATCH', body }),
  auraSession: (sid, eventId) =>
    externalApi.call(`/aura/sessions/${encodeURIComponent(sid)}${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`),
  auraChat: (body) => externalApi.call('/aura/chat', { method: 'POST', body }),
  auraChatStream: (body, onEvent, signal) => externalApi.stream('/aura/chat', { method: 'POST', body, signal }, onEvent),
  uploadMedia: (file, filename, mediaType = 'IMAGE') =>
    externalApi.call('/media/upload', {
      body: { file, filename, mediaType },
    }),
};

/** Human message for an API error. */
export function errorText(err, fallback = 'Something went wrong. Please try again.') {
  return err?.data?.message || err?.message || fallback;
}
