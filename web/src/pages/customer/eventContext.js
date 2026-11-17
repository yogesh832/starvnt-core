/** Browser preferences never establish ownership. Only the owned API list does. */
export const eventStorageKey = (customerId) => customerId ? `starvnt_current_event:${customerId}` : null;

export function routeEventId(pathname, search = '') {
  if (pathname === '/customer/aura') return new URLSearchParams(search).get('event') || null;
  const match = /^\/customer\/events\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!match) return null;
  if (match[1] === 'new') return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

export function resolveCurrentEvent(events, selectedId, pathname, search = '') {
  const routedId = routeEventId(pathname, search);
  // An inaccessible/deleted URL must never show a different event in the shell.
  if (routedId) return events.find(event => event.id === routedId) || null;
  return events.find(event => event.id === selectedId)
    || events.find(event => !['completed', 'cancelled'].includes(event.status))
    || events[0] || null;
}

/** Ignore late responses after refresh, unmount or an account change. */
export function latestRequestGate() {
  let revision = 0;
  return { next: () => ++revision, current: (value) => value === revision, invalidate: () => { revision++; } };
}
