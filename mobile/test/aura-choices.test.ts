import { test } from "node:test";
import assert from "node:assert/strict";
import { auraChoice, conversationContext } from "../src/auraChoices.ts";
test("Aura chips preserve structured intent and do not send prefill as a completed answer", () => {
  assert.deepEqual(
    auraChoice({ label: "Budget range", budgetRange: "range1" }),
    { message: "Budget range", body: { budgetRange: "range1" } },
  );
  assert.deepEqual(
    auraChoice({ label: "Skip", skipTopic: "event.guest_count" }).body,
    { skipTopic: "event.guest_count" },
  );
  assert.deepEqual(
    auraChoice({
      label: "At venue",
      serviceLocation: { category: "makeup", mode: "event" },
    }).body,
    { serviceLocation: { category: "makeup", mode: "event" } },
  );
  assert.deepEqual(
    auraChoice({ label: "Arranged by me", prefill: "My photographer is " }),
    { prefill: "My photographer is ", body: {} },
  );
});
test("service conversations retain their context and booking context takes precedence", () => {
  assert.deepEqual(conversationContext(undefined, "requirement1"), {
    requirementId: "requirement1",
  });
  assert.deepEqual(conversationContext("booking1", "requirement1"), {
    bookingId: "booking1",
  });
  assert.deepEqual(conversationContext(), {});
});
