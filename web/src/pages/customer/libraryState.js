export function libraryItems(items, { eventId = '', type = '', search = '', source = '' } = {}) {
  const query = search.trim().toLocaleLowerCase();
  return items.filter(item => (!eventId || (eventId === 'global' ? !item.event : item.event?.id === eventId)) && (!type || item.type === type) && (!source || (source === 'selected' ? item.source === 'selected_option' : item.source !== 'selected_option')) && (!query || [item.title, item.vendorName, item.packageName, item.category, item.event?.title].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));
}
export function safeContractLink(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function savedOptionLink(item, eventId) {
  return eventId && item.optionId ? `/customer/events/${encodeURIComponent(eventId)}/services/${encodeURIComponent(item.optionId)}` : null;
}
