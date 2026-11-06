export function updateCategory(item) {
  const type = String(item.type || '').toLowerCase();
  if (['promotion', 'promotional', 'offer', 'marketing'].includes(type)) return 'Promotional';
  if (['aura', 'aura_response', 'aura_suggestion'].includes(type)) return 'Aura+';
  return ['payment', 'booking', 'quote', 'cancellation'].includes(type) ? 'Transactional' : 'Operational';
}
export function notificationTarget(item) {
  const eventId = /^[a-zA-Z0-9_-]+$/.test(item.eventId || '') && !['null', 'undefined'].includes(item.eventId) ? item.eventId : null;
  const fallback = eventId ? `/customer/events/${encodeURIComponent(eventId)}` : '/customer/updates';
  const candidate = item.to;
  if (typeof candidate !== 'string' || !candidate.startsWith('/customer') || /[\\\u0000-\u0020]|%2f|%5c/i.test(candidate)) return fallback;
  if (candidate.split(/[?#]/)[0].split('/').some(part => ['.', '..'].includes(part.replace(/%2e/gi, '.')))) return fallback;
  try {
    const url = new URL(candidate, 'https://starvnt.local');
    if (url.origin !== 'https://starvnt.local' || !/^\/customer(?:\/|$)/.test(url.pathname)) return fallback;
    const targetEvent = url.pathname.match(/^\/customer\/events\/([^/]+)/)?.[1];
    if (eventId && targetEvent && targetEvent !== eventId) return fallback;
    if (eventId && url.searchParams.get('event') && url.searchParams.get('event') !== eventId) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}
export function belongsToEvent(item, eventId) { return !eventId || String(item.eventId) === eventId; }
export function withoutDuplicateMessages(messages, notifications) {
  const ids = new Set(notifications.filter(row => row.sourceType === 'event_message').map(row => String(row.sourceId)));
  return messages.filter(row => !ids.has(String(row.id)));
}
