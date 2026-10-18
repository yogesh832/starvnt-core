import assert from "node:assert/strict";
import { test } from "node:test";
import { CoreBooking } from "../src/admin/models/CoreBooking.js";
import {
  startService,
  submitCompletionEvidence,
} from "../src/admin/services/executionSettlement.service.js";

test("unpaid or cancelled bookings cannot start service or submit completion", async (t) => {
  for (const state of [
    { paymentStatus: "PENDING", bookingStatus: "CONFIRMED" },
    { paymentStatus: "PAYMENT_VERIFIED", bookingStatus: "CANCELLED" },
  ]) {
    let writes = 0;
    t.mock.method(CoreBooking, "findById", async () => ({
      vendorId: "vendor1",
      executionStatus: "SERVICE_SCHEDULED",
      ...state,
      save: async () => {
        writes++;
      },
    }));
    await assert.rejects(
      () => startService("booking1", "vendor1"),
      (error) => error.code === "BOOKING_NOT_EXECUTABLE",
    );
    await assert.rejects(
      () =>
        submitCompletionEvidence("booking1", "vendor1", {
          notes: "Premature evidence",
        }),
      (error) => error.code === "BOOKING_NOT_EXECUTABLE",
    );
    assert.equal(writes, 0);
    t.mock.restoreAll();
  }
});

test("completed bookings cannot be restarted or have their evidence replaced by vendors", async (t) => {
  t.mock.method(CoreBooking, "findById", async () => ({
    vendorId: "vendor1",
    bookingStatus: "CONFIRMED",
    paymentStatus: "PAYMENT_VERIFIED",
    executionStatus: "COMPLETION_VERIFIED",
  }));
  await assert.rejects(
    () => startService("booking1", "vendor1"),
    (error) => error.code === "INVALID_EXECUTION_STATE",
  );
  await assert.rejects(
    () =>
      submitCompletionEvidence("booking1", "vendor1", {
        notes: "Overwriting evidence",
      }),
    (error) => error.code === "INVALID_EXECUTION_STATE",
  );
});
