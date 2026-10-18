import type { Data } from "./api/client";

export const adminListTabs: Record<string, string[]> = {
  customers: ["All", "Active", "Flagged", "Suspended", "Inactive"],
  vendors: [
    "All",
    "Verified",
    "Pending",
    "Manual Review",
    "Flagged",
    "Suspended",
    "Rejected",
  ],
  events: [
    "All",
    "Draft",
    "Planning",
    "Confirmed",
    "In Progress",
    "Completed",
    "Cancelled",
  ],
  bookings: [
    "All",
    "Pending",
    "Confirmed",
    "In Progress",
    "Completed",
    "Disputed",
  ],
  payments: [
    "Customer Payments",
    "Vendor Settlements",
    "Refunds",
    "Pending Approvals",
  ],
  approvals: ["All", "PENDING", "APPROVED", "REJECTED", "USED"],
  automation: [
    "All",
    "Pending",
    "Processing",
    "Completed",
    "Failed",
    "Dead Letter",
  ],
  coupons: ["All", "Active", "Expired"],
};

export function adminListQuery(
  module: { key: string; path: string; paged?: boolean; collection: string },
  page: number,
  search: string,
  tab: string,
  filters: Data,
  before = "",
) {
  const params = new URLSearchParams({ limit: "20" });
  const approvalQueue =
    module.key === "payments" && tab === "Pending Approvals";
  if (module.paged && !approvalQueue) {
    params.set("skip", String(Math.max(0, page) * 20));
    if (search) params.set("search", search);
  }
  if (approvalQueue) params.set("status", "PENDING");
  else if (tab && tab !== "All") {
    params.set(
      module.key === "approvals" || module.key === "automation"
        ? "status"
        : "tab",
      module.key === "automation"
        ? tab.toUpperCase().replace(/\s+/g, "_")
        : tab,
    );
  }
  const allowed =
    module.key === "bookings"
      ? [
          "vendorId",
          "category",
          "city",
          "bookingStatus",
          "paymentStatus",
          "executionStatus",
          "settlementStatus",
        ]
      : module.key === "audit"
        ? ["action", "actor", "targetType", "targetId"]
        : module.key === "automation"
          ? ["eventType"]
          : [];
  for (const key of allowed)
    if (filters[key] && filters[key] !== "All")
      params.set(key, String(filters[key]).trim());
  if (module.key === "audit" && before) params.set("before", before);
  return {
    path: `${approvalQueue ? "/operations/approvals" : module.path}?${params}`,
    collection: approvalQueue ? "approvals" : module.collection,
    recordModule: approvalQueue ? "approvals" : module.key,
  };
}
