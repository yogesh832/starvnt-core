import { externalApi } from '../../lib/api.js';

/** Customer App + Aura+ endpoints (server: /api/customer/*, /api/aura/*). */
export const customerApi = {
  privacyNotice: () => externalApi.call('/customer/privacy/notice'),
  consents: () => externalApi.call('/customer/privacy/consents'),
  saveConsent: body => externalApi.call('/customer/privacy/consents', { method: 'PUT', body }),
  deletionRequest: () => externalApi.call('/customer/privacy/deletion'),
  requestDeletion: () => externalApi.call('/customer/privacy/deletion', { method: 'POST' }),
  sendMobileVerification: phone => externalApi.call('/auth/otp/send', { method: 'POST', body: { phone } }),
  verifyMobile: body => externalApi.call('/customer/identity/mobile/verify', { method: 'POST', body }),
  identityLinks: () => externalApi.call('/customer/identity/link-requests'),
  requestIdentityLink: body => externalApi.call('/customer/identity/link-requests', { method: 'POST', body }),
  revokeIdentityLink: id => externalApi.call(`/customer/identity/link-requests/${id}/revoke`, { method: 'POST' }),
  profile: () => externalApi.call('/customer/profile'),
  uploadProfilePhoto: file => { const body = new FormData(); body.append('image', file); return externalApi.call('/customer/profile/picture', { method: 'PUT', body }); },
  removeProfilePhoto: () => externalApi.call('/customer/profile/picture', { method: 'DELETE' }),
  planOptions: (eventType) => externalApi.call(`/customer/plan-options${eventType ? `?eventType=${encodeURIComponent(eventType)}` : ''}`),
  events: () => externalApi.call('/customer/events'),
  createPlanningDraft: body => externalApi.call('/customer/event-drafts', { method: 'POST', body }),
  planningDraft: id => externalApi.call(`/customer/events/${encodeURIComponent(id)}/planning-draft`),
  savePlanningDraft: (id, body) => externalApi.call(`/customer/events/${encodeURIComponent(id)}/planning-draft`, { method: 'PUT', body }),
  deleteEvent: (id) => externalApi.call(`/customer/events/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  event: (id) => externalApi.call(`/customer/events/${id}`),
  patchEvent: (id, body) => externalApi.call(`/customer/events/${id}`, { method: 'PATCH', body }),
  confirmEvent: (id) => externalApi.call(`/customer/events/${id}/confirm`, { method: 'POST' }),
  home: () => externalApi.call('/customer/home'),
  dashboard: (id) => externalApi.call(`/customer/events/${id}/dashboard`),
  financialTruth: (id) => externalApi.call(`/customer/events/${id}/financial-truth`),
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
  reconcilePayment: (id, paymentId) => externalApi.call(`/customer/events/${id}/payments/${paymentId}/reconcile`, { method: 'POST' }),
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
  threadMessages: (id) => externalApi.call(`/customer/messages/threads/${encodeURIComponent(id)}`),
  postThreadMessage: (id, body) => externalApi.call(`/customer/messages/threads/${encodeURIComponent(id)}`, { method: 'POST', body: { body } }),
  readAll: () => externalApi.call('/customer/notifications/read-all', { method: 'POST' }),
  readNotification: (id) => externalApi.call(`/customer/notifications/${id}/read`, { method: 'POST' }),
  reminders: (filters = {}) => externalApi.call(`/customer/reminders?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value))}`),
  createReminder: (body) => externalApi.call('/customer/reminders', { method: 'POST', body }),
  cancelReminder: (id) => externalApi.call(`/customer/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  documents: (filters = {}) => externalApi.call(`/customer/documents?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value))}`),
  documentAccess: (id) => externalApi.raw(`/customer/documents/${encodeURIComponent(id)}/download?delivery=link`),
  createContractDocument: (body) => externalApi.call('/customer/documents/contracts', { method: 'POST', body }),
  downloadDocument: (id) => externalApi.raw(`/customer/documents/${encodeURIComponent(id)}/download`).then(r => r.blob()),
  proposals: () => externalApi.call('/customer/proposals'),
  proposalAsset: (id, version, assetId) => externalApi.raw(`/customer/proposals/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/assets/${encodeURIComponent(assetId)}`).then(r => r.blob()),
  eventReferences: (eventId) => externalApi.call(`/customer/events/${encodeURIComponent(eventId)}/references`),
  uploadReference: (eventId, form) => externalApi.call(`/customer/events/${encodeURIComponent(eventId)}/references`, { method: 'POST', body: form }),
  referenceFile: (assetId) => externalApi.raw(`/customer/references/${encodeURIComponent(assetId)}/file`).then(r => r.blob()),
  askProposal: (id, question) => externalApi.call(`/customer/proposals/${encodeURIComponent(id)}/ask`, { method: 'POST', body: { question } }),
  proposal: (id, version) => externalApi.call(`/customer/proposals/${encodeURIComponent(id)}${version ? `/versions/${encodeURIComponent(version)}` : ''}`),
  proposalPdf: (id, version) => externalApi.raw(`/customer/proposals/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/pdf`).then(r => r.blob()),
  decideProposal: (id, version, body) => externalApi.call(`/customer/proposals/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/decision`, { method: 'POST', body }),
  requestProposalChange: (id, version, body) => externalApi.call(`/customer/proposals/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/change-requests`, { method: 'POST', body }),
  favorites: () => externalApi.call('/customer/favorites'),
  saveFavorite: (body) => externalApi.call('/customer/favorites', { method: 'POST', body }),
  removeFavorite: (id) => externalApi.call(`/customer/favorites/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createEvent: (body) => externalApi.call('/customer/events', { method: 'POST', body }),
  createMahimanDemoEnquiry: (body = {}) => externalApi.call('/customer/demo/mahiman-enquiry', { method: 'POST', body }),
  vendorQuotes: (eventId) => externalApi.call(`/customer/vendor-quotes${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`),
  acceptVendorQuote: (quoteId, eventId, expectedCommercialVersion) =>
    externalApi.call(`/customer/vendor-quotes/${quoteId}/accept`, { method: 'POST', body: { eventId, expectedCommercialVersion } }),
  negotiateVendorQuote: (quoteId, message, counterBudget) =>
    externalApi.call(`/customer/vendor-quotes/${quoteId}/negotiate`, { method: 'POST', body: { message, counterBudget } }),
  payVendorQuoteAdvance: (quoteId, couponCode = '', expectedCommercialVersion) =>
    externalApi.call(`/customer/vendor-quotes/${quoteId}/pay-advance`, { method: 'POST', body: { couponCode, expectedCommercialVersion } }),
  completeVendorQuoteCheckout: (quoteId, body) =>
    externalApi.call(`/customer/vendor-quotes/${quoteId}/checkout-complete`, { method: 'POST', body }),
  reconcileVendorQuotePayment: (quoteId) => externalApi.call(`/customer/vendor-quotes/${quoteId}/reconcile-payment`, { method: 'POST' }),
  verifyVendorBookingCompletion: (bookingId, notes = '') =>
    externalApi.call(`/customer/bookings/${bookingId}/verify-completion`, { method: 'POST', body: { notes } }),
  cancelBooking: (bookingId) => externalApi.call(`/customer/bookings/${bookingId}`, { method: 'DELETE' }),
  patchProfile: (body) => externalApi.call('/customer/profile', { method: 'PATCH', body }),
  auraSession: (sid, eventId, options = {}) =>
    externalApi.call(`/aura/sessions/${encodeURIComponent(sid)}${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`, options),
  auraChat: (body) => externalApi.call('/aura/chat', { method: 'POST', body }),
  auraChatStream: (body, onEvent, signal) => externalApi.stream('/aura/chat', { method: 'POST', body, signal }, onEvent),
  uploadMedia: (file, filename, mediaType = 'IMAGE') => {
    if (file instanceof Blob) {
      const body = new FormData();
      body.append('file', file, filename || file.name || 'attachment');
      body.append('mediaType', mediaType === 'VIDEO' || file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE');
      return externalApi.call('/media/upload', { method: 'POST', body });
    }
    return externalApi.call('/media/upload', {
      method: 'POST',
      body: { file, filename, mediaType },
    });
  },
};

/** Human message for an API error. */
export function errorText(err, fallback = 'Something went wrong. Please try again.') {
  return err?.data?.message || err?.message || fallback;
}
