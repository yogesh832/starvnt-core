import assert from "node:assert/strict";
import { test } from "node:test";
import {
  approvedFinanceExecution,
  couponFormPayload,
} from "../src/adminOperations.ts";

test("finance execution uses the approved amount and reference and cannot be run by the maker", () => {
  const approval = {
    id: "approval-a",
    targetType: "CoreBooking",
    targetId: "booking-a",
    type: "REFUND",
    status: "APPROVED",
    requestedByEmail: "maker@example.test",
    payload: { amount: 1500, reference: "provider-ref" },
  };
  assert.deepEqual(
    approvedFinanceExecution(
      approval,
      "checker@example.test",
      "Evidence reviewed",
    ),
    {
      action: "refund",
      path: "/operations/bookings/booking-a/refund",
      body: {
        approvalId: "approval-a",
        amount: 1500,
        reference: "provider-ref",
        reason: "Evidence reviewed",
        notes: "Evidence reviewed",
      },
    },
  );
  assert.throws(
    () => approvedFinanceExecution(approval, "MAKER@example.test", "Reviewed"),
    /requesting admin/,
  );
  assert.throws(
    () =>
      approvedFinanceExecution(
        { ...approval, status: "USED" },
        "checker@example.test",
        "",
      ),
    /approved/,
  );
});

test("settlement execution requires its approved transfer reference", () => {
  const approval = {
    id: "approval-a",
    targetType: "CoreBooking",
    targetId: "booking-a",
    type: "SETTLEMENT_RELEASE",
    status: "APPROVED",
    requestedByEmail: "maker@example.test",
    payload: { transactionReference: "bank-ref" },
  };
  assert.equal(
    approvedFinanceExecution(approval, "checker@example.test", "").body
      .transactionReference,
    "bank-ref",
  );
  assert.throws(
    () =>
      approvedFinanceExecution(
        { ...approval, payload: {} },
        "checker@example.test",
        "",
      ),
    /reference/,
  );
});

test("editing an unlimited inactive fixed-amount coupon preserves optional fields and active state", () => {
  const payload = couponFormPayload({
    code: " save500 ",
    discountType: "AMOUNT",
    discountValue: "500",
    minOrderAmount: "1000",
    maxDiscountAmount: null,
    usageLimit: null,
    isActive: false,
  });
  assert.equal(payload.code, "SAVE500");
  assert.equal(payload.maxDiscountAmount, "");
  assert.equal(payload.usageLimit, "");
  assert.equal(payload.isActive, false);
  assert.throws(
    () =>
      couponFormPayload({
        code: "BAD",
        discountType: "PERCENTAGE",
        discountValue: "101",
      }),
    /100%/,
  );
});
