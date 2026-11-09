const customerOrigin = 'https://customer.invalid';

function eventDestination(value, eventPath) {
  if (typeof value !== 'string' || value.includes('\\')) return null;
  if (value !== eventPath && !['/', '?', '#'].some(separator => value.startsWith(`${eventPath}${separator}`))) return null;
  const url = new URL(value, customerOrigin);
  if (url.origin !== customerOrigin || /%2f|%5c/i.test(url.pathname)) return null;
  if (url.pathname !== eventPath && !url.pathname.startsWith(`${eventPath}/`)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function nextHomeAction(event, attention = []) {
  const eventPath = `/customer/events/${encodeURIComponent(event.id)}`;
  const item = attention[0];
  if (item) {
    const fallback = item.type === 'quote_awaiting_decision' ? `${eventPath}/quotes`
      : ['reservation_awaiting_payment', 'payment_failed'].includes(item.type) ? `${eventPath}/bookings` : eventPath;
    return { title: item.title, detail: item.detail, to: eventDestination(item.actionUrl, eventPath) || fallback, label: 'Review next step' };
  }
  if (event.status === 'draft') {
    return { title: 'Continue your event plan.', detail: 'Review the details you have saved and fill in what is still missing.', to: eventPath, label: 'Continue planning' };
  }
  return { title: 'Review your event.', detail: 'Check your requirements, bookings and important records before making your next decision.', to: eventPath, label: 'Review event' };
}
