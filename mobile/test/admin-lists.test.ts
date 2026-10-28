import assert from "node:assert/strict";
import { test } from "node:test";
import { adminListQuery } from "../src/adminListQuery.ts";

test("payment approval tab uses the approvals API and preserves its action context", () => {
  const result = adminListQuery(
    {
      key: "payments",
      path: "/operations/finance-summary",
      collection: "rows",
      paged: true,
    },
    2,
    "customer",
    "Pending Approvals",
    {},
  );
  assert.equal(result.path, "/operations/approvals?limit=20&status=PENDING");
  assert.equal(result.collection, "approvals");
  assert.equal(result.recordModule, "approvals");
});

test("booking filters and search use encoded API query fields without introducing unsupported fields", () => {
  const result = adminListQuery(
    {
      key: "bookings",
      path: "/operations/bookings",
      collection: "bookings",
      paged: true,
    },
    1,
    "A & B",
    "In Progress",
    { city: "Pune", paymentStatus: "PAYMENT_VERIFIED", unknown: "ignored" },
  );
  const params = new URLSearchParams(result.path.split("?")[1]);
  assert.equal(params.get("search"), "A & B");
  assert.equal(params.get("skip"), "20");
  assert.equal(params.get("tab"), "In Progress");
  assert.equal(params.get("paymentStatus"), "PAYMENT_VERIFIED");
  assert.equal(params.has("unknown"), false);
});

test("audit pagination and automation status follow their backend contracts", () => {
  const audit = adminListQuery(
    { key: "audit", path: "/audit", collection: "logs" },
    1,
    "",
    "All",
    { targetType: "Coupon" },
    "2026-10-17T10:00:00Z",
  );
  assert.equal(
    new URLSearchParams(audit.path.split("?")[1]).get("before"),
    "2026-10-17T10:00:00Z",
  );
  const queue = adminListQuery(
    { key: "automation", path: "/automation/outbox", collection: "events" },
    0,
    "",
    "Dead Letter",
    {},
  );
  assert.equal(
    new URLSearchParams(queue.path.split("?")[1]).get("status"),
    "DEAD_LETTER",
  );
});
