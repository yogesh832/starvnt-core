export const NOTIFICATION_TYPES = {
  ENQUIRY: { label: 'Enquiry', icon: 'message', action: 'View enquiry', to: '/vendor/enquiries' },
  QUOTE: { label: 'Quote', icon: 'quotes', action: 'Review quote', to: '/vendor/quotes' },
  BOOKING: { label: 'Booking', icon: 'bookings', action: 'View booking', to: '/vendor/bookings' },
  PAYMENT: { label: 'Payment', icon: 'wallet', action: 'View payment', to: '/vendor/payments' },
  MESSAGE: { label: 'Message', icon: 'message', action: 'Open conversation', to: '/vendor/messages' },
  SYSTEM: { label: 'Update', icon: 'bell', action: 'View details', to: '/vendor/dashboard' },
  AURA: { label: 'Aura+', icon: 'bolt', action: 'Resume conversation', to: '/vendor/updates?tab=aura' },
};

export const isImportantNotification = (n) => ['HIGH', 'CRITICAL'].includes(n.priority);
export const unreadBadgeLabel = (count) => count > 99 ? '99+' : String(Math.max(0, count));

export function notificationAction(n) {
  const type = NOTIFICATION_TYPES[n.type] || NOTIFICATION_TYPES.SYSTEM;
  // Only navigate within this vendor portal, including valid detail/query links.
  const validLink = typeof n.link === 'string' && /^\/vendor\/(dashboard|enquiries|quotes|bookings|calendar|portfolio|services|availability|payments|reviews|analytics|messages|updates|documents|profile|settings)(?:[/?#]|$)/.test(n.link);
  const to = validLink && (n.link !== '/vendor/dashboard' || n.type === 'SYSTEM') ? n.link : type.to;
  return { ...type, to };
}

export function notificationDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
