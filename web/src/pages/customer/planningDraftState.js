/** UI values are transport data; Core still validates facts and service rules. */
export function serviceChanges(services, requirements = []) {
  const normalise = service => ({
    status: service.status,
    providedValue: service.status === 'customer_provided' ? String(service.providedValue || '').trim() : '',
    details: Object.fromEntries(Object.entries(service.details || service.preferences || {}).filter(([, value]) => value !== '' && value !== undefined && !(Array.isArray(value) && !value.length))),
    serviceLocation: Object.fromEntries(Object.entries(service.serviceLocation || { mode: 'unspecified' }).filter(([, value]) => value !== null && value !== '' && value !== false)),
    specialRequirements: String(service.specialRequirements || '').trim(),
  });
  const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  return Object.entries(services).flatMap(([category, service]) => {
    const previous = requirements.find(row => row.category === category);
    const next = normalise(service);
    const explicitlyConfirmed = previous?.source === 'aura_inferred' && service.source === 'customer';
    return previous && !explicitlyConfirmed && canonical(normalise(previous)) === canonical(next) ? [] : [{ category, ...next, confirmSuggestion: explicitlyConfirmed }];
  });
}

export function draftResumeUrl(eventId) {
  return `/customer/events/new?draft=${encodeURIComponent(eventId)}`;
}

export function eventDateChange(value, event) {
  const next = value || null;
  return next === (event.eventDate || null) ? {} : { eventDate: next };
}
