import { test } from "node:test";
import assert from "node:assert/strict";
import {
  comparisonChoice,
  selectionReason,
  sortOptions,
} from "../src/discoveryModel.ts";
test("vendor sorting keeps unpriced options last in both price directions and preserves recommended order", () => {
  const rows = [
    { id: "unknown", price: null },
    { id: "a", price: 300 },
    { id: "b", price: 100 },
  ];
  assert.deepEqual(
    sortOptions(rows, "budget").map((o) => o.id),
    ["b", "a", "unknown"],
  );
  assert.deepEqual(
    sortOptions(rows, "premium").map((o) => o.id),
    ["a", "b", "unknown"],
  );
  assert.deepEqual(sortOptions(rows, "recommended"), rows);
  assert.equal(rows[0].id, "unknown");
});
test("selection distinguishes unconfirmed coverage from unavailable or unpriced options", () => {
  assert.equal(
    selectionReason("planning", {
      price: null,
      requiresVendorConfirmation: true,
    }),
    null,
  );
  assert.ok(selectionReason("planning", { price: null }));
  assert.ok(
    selectionReason("planning", { price: 100, availability: "booked" }),
  );
  assert.ok(selectionReason("draft", { price: 100 }));
  assert.ok(selectionReason("completed", { price: 100 }));
});
test("comparison is capped at three, and selected options remain removable", () => {
  assert.deepEqual(comparisonChoice(["a", "b", "c"], "d"), ["a", "b", "c"]);
  assert.deepEqual(comparisonChoice(["a", "b", "c"], "b"), ["a", "c"]);
});
