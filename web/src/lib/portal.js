/**
 * Portal detection — production uses subdomains
 * (customers.starvnt.com / vendors.starvnt.com / admin.starvnt.com),
 * local dev falls back to path prefixes (/customer, /vendor, /admin).
 * The three experiences are separate UIs on one unified backend.
 */
export function detectPortal() {
  const host = window.location.hostname;
  const path = window.location.pathname;

  if (host.startsWith('admin.') || path.startsWith('/admin')) return 'admin';
  if (host.startsWith('vendors.') || path.startsWith('/vendor')) return 'vendor';
  if (host.startsWith('customers.') || path.startsWith('/customer')) return 'customer';
  return 'customer';
}
