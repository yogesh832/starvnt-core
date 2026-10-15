/** Includes older quote messages that predate structured notification types. */
export function isQuoteMessage(item) {
  const type = String(item?.type || item?.metadata?.type || '').toLowerCase();
  const text = String(item?.body || item?.text || item?.lastMessageText || '');
  return type === 'quote' || /quote received:|sent a quote offer|revised (?:quote|offer)/i.test(text);
}

export function quoteReviewLink(item) {
  const eventId = String(item?.eventId || '');
  return eventId && /^[a-zA-Z0-9_-]+$/.test(eventId) && !['null', 'undefined'].includes(eventId)
    ? `/customer/events/${encodeURIComponent(eventId)}/quotes`
    : '/customer/go/quotes';
}
