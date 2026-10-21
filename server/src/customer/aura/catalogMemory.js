const key = event => String(event?.id || event?._id || '');
export const eventStamp = event => event?.updatedAt ? String(new Date(event.updatedAt).toISOString()) : JSON.stringify([event?.city, event?.eventDate, event?.guestCount, event?.location]);
export function rememberCatalog(query, scope, event) {
  return { query, eventId: key(event), eventStamp: eventStamp(event), scope: { city: scope?.city, eventDate: scope?.eventDate, guestCount: scope?.guestCount, location: scope?.location } };
}
/** A changed event must reprice/recheck results; explicit search overrides last until that change. */
export function catalogScopeFor(memory, event) {
  if (!memory?.query || (memory.eventId && memory.eventId !== key(event))) return null;
  if (event && memory.eventStamp !== eventStamp(event)) return { ...event, _id: event._id || event.id };
  return { ...(event || {}), ...memory.scope, _id: event?._id || event?.id };
}
