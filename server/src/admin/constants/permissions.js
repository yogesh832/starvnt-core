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
  operations: ['read', 'manage'],
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

export const ADMIN_ROLE_PRESETS = {
  SALES_EXECUTIVE: {
    label: 'Sales Executive',
    description: 'Creates and follows up customer enquiries and events, and views vendors, quotes and bookings.',
    permissions: [
      'customers.read',
      'customers.create',
      'customers.update',
      'vendors.read',
      'events.read',
      'events.create',
      'events.update',
      'requirements.read',
      'quotes.read',
      'bookings.read',
      'leads.read',
      'leads.update',
    ],
  },
  SALES_MANAGER: {
    label: 'Sales Manager',
    description: 'Manages customer and event follow-up, assigns leads and views sales analytics and reports.',
    permissions: [
      'customers.read',
      'customers.create',
      'customers.update',
      'vendors.read',
      'events.read',
      'events.create',
      'events.update',
      'requirements.read',
      'quotes.read',
      'bookings.read',
      'leads.read',
      'leads.update',
      'leads.assign',
      'analytics.read',
      'reports.read',
      'reports.create',
      'reports.export',
    ],
  },
  OPERATIONS_ADMIN: {
    label: 'Operations Admin',
    description: 'Runs event, booking, vendor, customer and automation operations without finance release power.',
    permissions: [
      'customers.read',
      'customers.update',
      'vendors.read',
      'vendors.update',
      'events.read',
      'events.update',
      'bookings.read',
      'bookings.update',
      'execution.read',
      'execution.update',
      'execution.manage',
      'operations.read',
      'operations.manage',
      'automation.read',
      'automation.manage',
      'audit.read',
    ],
  },
  VENDOR_VERIFICATION_ADMIN: {
    label: 'Vendor Verification Admin',
    description: 'Reviews vendor onboarding, KYC documents, status restrictions and vendor quality flags.',
    permissions: [
      'vendors.read',
      'vendors.update',
      'vendors.approve',
      'vendors.disable',
      'customers.read',
      'operations.read',
      'audit.read',
    ],
  },
  FINANCE_ADMIN: {
    label: 'Finance Admin',
    description: 'Handles payment verification, refunds, settlement holds and settlement release workflows.',
    permissions: [
      'bookings.read',
      'payments.read',
      'payments.approve',
      'payments.refund',
      'settlements.read',
      'settlements.create',
      'settlements.approve',
      'settlements.hold',
      'settlements.release',
      'revenue.read',
      'audit.read',
    ],
  },
  SUPPORT_ADMIN: {
    label: 'Support Admin',
    description: 'Reads and assists customers, vendors, bookings and protection issues without financial release authority.',
    permissions: [
      'customers.read',
      'customers.update',
      'vendors.read',
      'events.read',
      'bookings.read',
      'issues.read',
      'issues.update',
      'protection.read',
      'audit.read',
    ],
  },
  ANALYTICS_AUDIT_ADMIN: {
    label: 'Analytics & Audit Admin',
    description: 'Read-only analytics, reports, audit logs and platform metrics.',
    permissions: [
      'customers.read',
      'vendors.read',
      'events.read',
      'bookings.read',
      'payments.read',
      'settlements.read',
      'analytics.read',
      'reports.read',
      'reports.export',
      'audit.read',
      'settings.read',
    ],
  },
};

const VALID_ROLE_PRESETS = new Set(Object.keys(ADMIN_ROLE_PRESETS));

export function isValidPermission(permission) {
  return VALID.has(permission);
}

/** Returns the subset of `permissions` that are NOT in the catalog. */
export function invalidPermissions(permissions = []) {
  return permissions.filter((p) => !VALID.has(p));
}

export function rolePresetPermissions(roleKey) {
  return ADMIN_ROLE_PRESETS[roleKey]?.permissions || [];
}

export function isValidRolePreset(roleKey) {
  return VALID_ROLE_PRESETS.has(roleKey);
}

export const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];
