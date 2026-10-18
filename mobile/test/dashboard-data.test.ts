import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminAttention,
  adminDashboardSources,
  dashboardSources,
  vendorPipeline,
} from "../src/dashboardData.ts";

test("limited Core home requests only authorized sources, including operations-only booking access", () => {
  assert.deepEqual(
    adminDashboardSources((permission) => permission === "operations.read"),
    { bookings: "/operations/bookings?limit=5" },
  );
  assert.deepEqual(
    adminDashboardSources(() => false),
    {},
  );
  const support = adminDashboardSources((permission) =>
    ["customers.read", "events.read", "audit.read"].includes(permission),
  );
  assert.equal(support.vendors, undefined);
  assert.equal(support.report, undefined);
  assert.ok(support.customers && support.events && support.audit);
});

test("dashboard source failures remain explicit without dropping successfully loaded data", async () => {
  const data = await dashboardSources(
    {
      call: async (path) => {
        if (path === "/failed") throw new Error("unavailable");
        return { total: 7 };
      },
    } as any,
    { customers: "/ok", bookings: "/failed" },
  );
  assert.equal(data.customers.total, 7);
  assert.equal(data.bookings, undefined);
  assert.deepEqual(data.failed, ["bookings"]);
  assert.deepEqual(adminAttention(data), []);
});

test("quote pipelines combine status and customer search without changing source order or rows", () => {
  const rows = [
    { status: "DRAFT", customer: { fullName: "Arjun Rao" } },
    { status: "SUBMITTED", customer: { fullName: "Arjun Rao" } },
    { status: "SUBMITTED", customer: { fullName: "Maya Sen" } },
  ];
  assert.deepEqual(vendorPipeline(rows, "SUBMITTED", " arjun "), [rows[1]]);
  assert.equal(vendorPipeline(rows, "All", "").length, 3);
  assert.equal(rows[0].status, "DRAFT");
});

test("Core attention cards follow backend queue counts and preserve destination roles", () => {
  const rows = adminAttention({
    pendingVendors: { total: 2 },
    bookings: { stats: { pendingPaymentCount: 3, inProgressCount: 0 } },
  });
  assert.deepEqual(
    rows.map((row) => row.module),
    ["vendors", "bookings"],
  );
  assert.equal(rows.length, 2);
});
