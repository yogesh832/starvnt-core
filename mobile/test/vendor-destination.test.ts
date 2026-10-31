import { test } from "node:test";
import assert from "node:assert/strict";
import { vendorDestination } from "../src/vendorDestination.ts";

test('dashboard record links open the exact existing native quote, booking or enquiry surface', () => {
  const record = '0123456789abcdef01234567';
  assert.deepEqual(vendorDestination(`/vendor/quotes?record=${record}`), { screen: 'VendorQuote', params: { quoteId: record } });
  assert.deepEqual(vendorDestination(`/vendor/bookings?record=${record}`), { screen: 'VendorBooking', params: { booking: { _id: record } } });
  assert.deepEqual(vendorDestination(`/vendor/enquiries?record=${record}`), { screen: 'VendorModule', params: { module: 'enquiries', recordId: record } });
  assert.equal(vendorDestination('/vendor/quotes?record=../../other'), null);
  assert.equal(vendorDestination('/vendor/bookings?record='), null);
  assert.deepEqual(vendorDestination(`/vendor/updates?tab=messages&thread=${record}`), { screen: 'Chat', params: { kind: 'thread', threadId: record, vendor: true } });
});

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
