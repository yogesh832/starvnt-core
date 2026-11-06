export const CLOSED_EVENTS = ['completed', 'cancelled'];
export const ACTIVE_EVENTS = ['draft', 'planning', 'booked', 'in_progress'];
export const archiveStorageKey = customerId => customerId ? `starvnt_event_archive:${customerId}` : null;
export function parseArchivedEvents(value) {
  try { const ids = JSON.parse(value); return Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(id)))].slice(0, 1000) : []; } catch { return []; }
}
export function eventCounts(events) {
  if (!Array.isArray(events)) return null;
  return { total: events.length, active: events.filter(event => ACTIVE_EVENTS.includes(event.status)).length, completed: events.filter(event => event.status === 'completed').length, cancelled: events.filter(event => event.status === 'cancelled').length };
}
export function isEventArchived(event, archivedIds) { return CLOSED_EVENTS.includes(event.status) && archivedIds.includes(event.id); }
export function accountHistory(events, { archivedIds = [], view = 'current', status = '', search = '' } = {}) {
  const query = search.trim().toLocaleLowerCase();
  return events.filter(event => (view === 'all' || isEventArchived(event, archivedIds) === (view === 'archived')) && (!status || event.status === status) && (!query || [event.title, event.eventTypeLabel, event.city, event.eventDate].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));
}
