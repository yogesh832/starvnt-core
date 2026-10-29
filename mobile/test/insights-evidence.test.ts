import { test } from "node:test";
import assert from "node:assert/strict";
import { completionEvidence } from "../src/completionEvidence.ts";
import { formatVendorResponseTime, reviewText, vendorActionItems, vendorInsightTotals, vendorSalesMetrics } from "../src/vendorInsights.ts";
test("payment metrics preserve a recorded zero vendor payable rather than replacing it with gross value", () => {
  const totals = vendorInsightTotals([
    {
      totalAmount: 1000,
      paymentSummary: { paidAmount: 300 },
      paymentStatus: "PAYMENT_VERIFIED",
      bookingStatus: "CONFIRMED",
      settlementStatus: "SETTLED",
      vendorPayable: 0,
    },
  ]);
  assert.equal(totals.released, 0);
  assert.equal(totals.verifiedAdvances, 300);
  assert.equal(totals.recordedBookingValue, 1000);
});
test("Google and STARVNT review formats become readable text", () => {
  assert.equal(
    reviewText({ text: { text: "Google review" } }),
    "Google review",
  );
  assert.equal(reviewText({ reviewText: "Booking review" }), "Booking review");
});
test("mobile dashboard action center only includes actionable saved records and prioritizes bookings", () => {
  const actions = vendorActionItems({
    bookings: [{ id: "b1", bookingStatus: "CONFIRMED", executionStatus: "SERVICE_STARTED", eventDate: "2099-01-01" }],
    enquiries: [{ id: "e1", status: "NEW", serviceName: "Photography" }],
    quotes: [{ id: "q1", status: "DRAFT", serviceName: "Catering" }],
    reviews: [{ id: "r1", status: "PUBLISHED", rating: 5 }],
  });
  assert.equal(actions[0].module, "bookings");
  assert.deepEqual(actions.map((item) => item.module), ["bookings", "enquiries", "quotes", "reviews"]);
});
test("mobile sales cohort excludes newer leads and counts only linked submitted quotes and confirmed bookings", () => {
  const now = new Date("2026-10-29T12:00:00.000Z");
  const metrics = vendorSalesMetrics({
    enquiries: [
      { id: "old", createdAt: "2026-09-01T12:00:00.000Z", status: "DECLINED", declineReason: "Budget" },
      { id: "new", createdAt: "2026-10-20T12:00:00.000Z" },
    ],
    quotes: [{ opportunity: "old", history: [{ toStatus: "SUBMITTED", timestamp: "2026-09-02T12:00:00.000Z" }] }],
    bookings: [{ opportunityId: "old", bookingStatus: "CONFIRMED", createdAt: "2026-09-03T12:00:00.000Z" }],
  }, 30, now);
  assert.equal(metrics.eligible, 1);
  assert.equal(metrics.quoteRate, 1);
  assert.equal(metrics.bookingRate, 1);
  assert.equal(metrics.declineReasons.Budget, 1);
  assert.equal(formatVendorResponseTime(3600000), "1 hr");
  assert.equal(formatVendorResponseTime(null), "Insufficient data");
});
test("completion evidence preserves all revisions, deduplicates files and keeps unchecked deliverables unchecked", () => {
  const result = completionEvidence([
    {
      notes: "First delivery",
      photos: ["https://example.test/photo.jpg"],
      files: [{ url: "https://example.test/photo.jpg" }],
      checklist: [{ item: "Album", checked: false }],
    },
    {
      notes: "Revision",
      deliverablesUrl: "https://example.test/folder",
      files: [{ url: "javascript:alert(1)" }],
    },
  ]);
  assert.deepEqual(result.notes, ["First delivery", "Revision"]);
  assert.equal(result.files.length, 2);
  assert.equal(result.checklist[0].checked, false);
});
