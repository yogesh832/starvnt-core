export type AdminModule = {
  key: string;
  title: string;
  path: string;
  collection: string;
  permissions: string[];
  superOnly?: boolean;
  paged?: boolean;
};
export const adminModules: AdminModule[] = [
  { key: 'financeGovernance', title: 'Finance workspace', path: '/policy', collection: 'revisions', permissions: ['financePolicies.read', 'financePolicies.update', 'financePolicies.approve', 'revenue.read', 'payments.read', 'settlements.read'] },
  { key: 'productMetrics', title: 'Product outcomes', path: '/reports/product-metrics', collection: 'metrics', permissions: ['analytics.read', 'reports.read'] },
  { key: 'availability', title: 'Availability & External Commitments', path: '/availability', collection: 'records', permissions: ['vendors.read'] },
  {
    key: "customers",
    title: "Customers",
    path: "/external-users/customers",
    collection: "customers",
    permissions: ["customers.read"],
    paged: true,
  },
  {
    key: "vendors",
    title: "Vendors",
    path: "/external-users/organizations",
    collection: "organizations",
    permissions: ["vendors.read"],
    paged: true,
  },
  {
    key: "events",
    title: "Events",
    path: "/events",
    collection: "events",
    permissions: ["events.read"],
    paged: true,
  },
  {
    key: "bookings",
    title: "Bookings & execution",
    path: "/operations/bookings",
    collection: "bookings",
    permissions: ["bookings.read", "operations.read"],
    paged: true,
  },
  {
    key: "payments",
    title: "Payments",
    path: "/operations/finance-summary",
    collection: "rows",
    permissions: ["payments.read", "settlements.read"],
    paged: true,
  },
  {
    key: "approvals",
    title: "Finance approvals",
    path: "/operations/approvals",
    collection: "approvals",
    permissions: ["settlements.read", "settlements.approve"],
  },
  {
    key: "reports",
    title: "Reports",
    path: "/reports/summary",
    collection: "rows",
    permissions: ["reports.read", "analytics.read"],
  },
  {
    key: "automation",
    title: "Automation",
    path: "/automation/outbox",
    collection: "events",
    permissions: ["automation.read"],
  },
  {
    key: "coupons",
    title: "Coupons",
    path: "/coupons",
    collection: "coupons",
    permissions: ["settings.read"],
    paged: true,
  },
  {
    key: "users",
    title: "Users & access",
    path: "/users",
    collection: "admins",
    permissions: [],
    superOnly: true,
  },
  {
    key: "audit",
    title: "Audit logs",
    path: "/audit",
    collection: "logs",
    permissions: ["audit.read"],
  },
  {
    key: "settings",
    title: "Settings",
    path: "/settings",
    collection: "settings",
    permissions: ["settings.read"],
  },
];
export function visibleModules(
  admin: { role?: string; permissions?: string[] } | null,
) {
  return adminModules.filter(
    (m) =>
      !!admin &&
      (admin.role === "SUPER_ADMIN" ||
        (!m.superOnly &&
          m.permissions.some((p) => admin.permissions?.includes(p)))),
  );
}
