import type { Client, Data } from "./api/client";

export const vendorCollections = {
  enquiries: { path: "/vendor/opportunities", collection: "opportunities" },
  quotes: { path: "/quotes", collection: "quotes" },
  bookings: { path: "/vendor/bookings", collection: "bookings" },
  services: { path: "/vendor/services", collection: "services" },
  availability: {
    path: "/vendor/availability/blockouts",
    collection: "blockouts",
  },
  documents: { path: "/vendor/documents", collection: "documents" },
} as const;

export async function dashboardSources(
  api: Pick<Client, "call">,
  sources: Record<string, string>,
) {
  const entries = Object.entries(sources);
  const results = await Promise.allSettled(
    entries.map(([, path]) => api.call(path)),
  );
  const data: Data = {};
  const failed: string[] = [];
  results.forEach((result, index) => {
    const key = entries[index][0];
    if (result.status === "fulfilled") data[key] = result.value;
    else failed.push(key);
  });
  return { ...data, failed };
}

export function adminDashboardSources(
  can: (permission: string) => boolean,
): Record<string, string> {
  return {
    ...(can("customers.read")
      ? { customers: "/external-users/customers?limit=1" }
      : {}),
    ...(can("vendors.read")
      ? {
          vendors: "/external-users/organizations?limit=1",
          pendingVendors: "/external-users/organizations?limit=1&tab=Pending",
        }
      : {}),
    ...(can("events.read") ? { events: "/events?limit=5" } : {}),
    ...(can("bookings.read") || can("operations.read")
      ? { bookings: "/operations/bookings?limit=5" }
      : {}),
    ...(can("audit.read") ? { audit: "/audit?limit=5" } : {}),
    ...(can("reports.read") || can("analytics.read")
      ? { report: "/reports/summary" }
      : {}),
  };
}

export function vendorPipeline(
  rows: Data[],
  status: string,
  search: string,
): Data[] {
  const query = search.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (status === "All" || String(row.status).toUpperCase() === status) &&
      [
        row.serviceName,
        row.name,
        row.title,
        row.clientName,
        row.customer?.fullName,
        row.customer?.email,
        row.status,
        row.bookingReference,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
  );
}

export function adminAttention(data: Data) {
  const stats = data.bookings?.stats;
  return [
    ...(data.pendingVendors?.total > 0
      ? [
          {
            title: `${data.pendingVendors.total} vendors await verification`,
            module: "vendors",
          },
        ]
      : []),
    ...(stats?.pendingPaymentCount > 0
      ? [
          {
            title: `${stats.pendingPaymentCount} payments await verification`,
            module: "bookings",
          },
        ]
      : []),
    ...(stats?.inProgressCount > 0
      ? [
          {
            title: `${stats.inProgressCount} bookings in execution`,
            module: "bookings",
          },
        ]
      : []),
  ];
}
