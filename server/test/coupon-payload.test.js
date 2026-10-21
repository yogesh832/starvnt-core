import assert from "node:assert/strict";
import { test } from "node:test";
import { couponPayload } from "../src/admin/routes/coupons.routes.js";

test("editing an unlimited coupon preserves persisted null limits", () => {
  const { payload, error } = couponPayload({
    code: "QA",
    discountType: "AMOUNT",
    discountValue: 150,
    isActive: true,
    maxDiscountAmount: null,
    usageLimit: null,
  });
  assert.equal(error, undefined);
  assert.equal(payload.maxDiscountAmount, null);
  assert.equal(payload.usageLimit, null);
});

test("explicit zero or negative coupon limits remain invalid", () => {
  const coupon = { code: "QA", discountType: "PERCENTAGE", discountValue: 5 };
  assert.equal(
    couponPayload({ ...coupon, maxDiscountAmount: 0 }).error,
    "INVALID_MAX_DISCOUNT",
  );
  assert.equal(
    couponPayload({ ...coupon, usageLimit: 0 }).error,
    "INVALID_USAGE_LIMIT",
  );
  assert.equal(
    couponPayload({ ...coupon, usageLimit: -1 }).error,
    "INVALID_USAGE_LIMIT",
  );
});
