import { test } from "node:test";
import assert from "node:assert/strict";
import { vendorDestination } from "../src/vendorDestination.ts";

test("Aura setup actions open the corresponding native editor", () => {
  assert.deepEqual(vendorDestination("/vendor/services?action=gear"), {
    screen: "VendorSetup",
    params: { kind: "capacity" },
  });
  assert.deepEqual(vendorDestination("/vendor/services?action=coverage"), {
    screen: "VendorSetup",
    params: { kind: "coverage" },
  });
  assert.deepEqual(vendorDestination("/vendor/calendar"), {
    screen: "VendorCalendar",
  });
  assert.deepEqual(vendorDestination("/vendor/portfolio"), {
    screen: "VendorModule",
    params: { module: "portfolio" },
  });
});
test("vendor links cannot route to another role or arbitrary destinations", () => {
  for (const path of [
    "https://example.com/vendor/calendar",
    "//example.com/vendor/calendar",
    "/customer/events",
    "/vendor/../admin/users",
    "/vendor/unknown",
  ])
    assert.equal(vendorDestination(path), null);
});
