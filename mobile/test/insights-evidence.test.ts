import { test } from "node:test";
import assert from "node:assert/strict";
import { completionEvidence } from "../src/completionEvidence.ts";
import { reviewText, vendorInsightTotals } from "../src/vendorInsights.ts";
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
  assert.equal(totals.escrow, 300);
  assert.equal(totals.recordedBookingValue, 1000);
});
test("Google and STARVNT review formats become readable text", () => {
  assert.equal(
    reviewText({ text: { text: "Google review" } }),
    "Google review",
  );
  assert.equal(reviewText({ reviewText: "Booking review" }), "Booking review");
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
