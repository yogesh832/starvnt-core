import { test } from "node:test";
import assert from "node:assert/strict";
import { pushDestination } from "../src/pushDestination.ts";
const customer = { id: "customer", accountType: "CUSTOMER" };
const base = {
  version: 1,
  domain: "external",
  ownerId: "customer",
  surface: "CUSTOMER",
};
test("notification taps restore event conversation scope on cold start", () => {
  assert.deepEqual(
    pushDestination(
      { ...base, actionUrl: "/customer/events/event1/circle?booking=booking1" },
      customer,
      "external",
      () => false,
    ),
    {
      screen: "Chat",
      params: { eventId: "event1", kind: "circle", bookingId: "booking1" },
    },
  );
  assert.deepEqual(
    pushDestination(
      { ...base, threadId: "thread1" },
      customer,
      "external",
      () => false,
    ),
    {
      screen: "Chat",
      params: { kind: "thread", threadId: "thread1", vendor: false },
    },
  );
});
test("old accounts, wrong roles and external destinations cannot cross notification scopes", () => {
  assert.equal(
    pushDestination(
      { ...base, ownerId: "other" },
      customer,
      "external",
      () => false,
    ),
    null,
  );
  assert.equal(
    pushDestination(
      { ...base, surface: "VENDOR" },
      customer,
      "external",
      () => false,
    ),
    null,
  );
  assert.deepEqual(
    pushDestination(
      { ...base, actionUrl: "https://attacker.test/customer/events/private" },
      customer,
      "external",
      () => false,
    ),
    { screen: "Main", params: { screen: "Updates" } },
  );
});
test("Core notification destinations recheck current permissions", () => {
  const data = {
    version: 1,
    domain: "admin",
    ownerId: "staff",
    actionUrl: "/admin/audit",
  };
  assert.deepEqual(
    pushDestination(data, { id: "staff" }, "admin", () => false),
    { screen: "Main", params: { screen: "CoreUpdates" } },
  );
  assert.deepEqual(
    pushDestination(data, { id: "staff" }, "admin", (p) => p === "audit.read"),
    { screen: "AdminModule", params: { module: "audit" } },
  );
});
