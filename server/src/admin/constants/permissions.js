/**
 * STARVNT Admin RBAC permission catalog.
 *
 * Format: "resource.action". The backend is the single source of truth —
 * every admin API validates the admin's permissions against this catalog.
 * The frontend uses it ONLY to hide/show UI affordances (UX, not security).
 *
 * SUPER_ADMIN bypasses per-permission checks (ALL_PERMISSIONS) but the role
 * is still recorded explicitly on the AdminUser document and in audit logs.
 */
const CATALOG = {
  customers: ['read', 'create', 'update', 'delete', 'disable'],
  vendors: ['read', 'create', 'update', 'delete', 'disable', 'approve'],
  events: ['read', 'create', 'update', 'delete'],
  requirements: ['read', 'update', 'approve'],
  quotes: ['read', 'approve', 'update'],
  bookings: ['read', 'create', 'update', 'cancel'],
  payments: ['read', 'approve', 'refund'],
  settlements: ['read', 'create', 'approve', 'hold', 'release'],
  execution: ['read', 'update', 'manage'],
  issues: ['read', 'update', 'manage', 'assign'],
  protection: ['read', 'manage'],
  revenue: ['read', 'manage'],
  leads: ['read', 'assign', 'update'],
  automation: ['read', 'manage'],
  analytics: ['read'],
  reports: ['read', 'create', 'export'],
  users: ['read', 'create', 'update', 'disable'],
  roles: ['read', 'create', 'update', 'delete'],
  permissions: ['read', 'manage'],
  audit: ['read'],
  settings: ['read', 'update'],
};

/** Flat list of every valid "resource.action" permission string. */
export const ALL_PERMISSIONS = Object.entries(CATALOG).flatMap(([resource, actions]) =>
  actions.map((action) => `${resource}.${action}`)
);

export const PERMISSION_CATALOG = CATALOG;

const VALID = new Set(ALL_PERMISSIONS);

export function isValidPermission(permission) {
  return VALID.has(permission);
}

/** Returns the subset of `permissions` that are NOT in the catalog. */
export function invalidPermissions(permissions = []) {
  return permissions.filter((p) => !VALID.has(p));
}

export const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];
