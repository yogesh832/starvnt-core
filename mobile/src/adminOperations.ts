import type { Data } from "./api/client";

export function approvedFinanceExecution(
  approval: Data,
  actorEmail: string,
  notes: string,
): { action: string; path: string; body: Data } {
  if (
    approval.status !== "APPROVED" ||
    !["REFUND", "SETTLEMENT_RELEASE"].includes(approval.type) ||
    approval.targetType !== "CoreBooking" ||
    !approval.targetId ||
    !(approval.id || approval._id)
  )
    throw new Error("Choose an approved booking finance request.");
  if (approval.requestedByEmail?.toLowerCase() === actorEmail.toLowerCase())
    throw new Error(
      "The requesting admin cannot execute the same finance request.",
    );
  const payload = approval.payload || {};
  const refund = approval.type === "REFUND";
  const reference = String(
    refund ? payload.reference || "" : payload.transactionReference || "",
  ).trim();
  if (!reference)
    throw new Error(
      "The approved request is missing its provider or transfer reference.",
    );
  if (
    refund &&
    (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0)
  )
    throw new Error("The approved request has no valid refund amount.");
  const action = refund ? "refund" : "settle";
  return {
    action,
    path: `/operations/bookings/${encodeURIComponent(approval.targetId)}/${action}`,
    body: {
      approvalId: String(approval.id || approval._id),
      reason: notes.trim() || approval.reason || "",
      notes: notes.trim() || payload.notes || "",
      ...(refund
        ? { amount: Number(payload.amount), reference }
        : { transactionReference: reference }),
    },
  };
}

export function couponFormPayload(form: Data): Data {
  const code = String(form.code || "")
    .trim()
    .toUpperCase();
  const discountValue = Number(form.discountValue);
  const minOrderAmount = Number(form.minOrderAmount || 0);
  if (!code || !["PERCENTAGE", "AMOUNT"].includes(form.discountType))
    throw new Error("Enter a coupon code and discount type.");
  if (
    !Number.isFinite(discountValue) ||
    discountValue <= 0 ||
    (form.discountType === "PERCENTAGE" && discountValue > 100)
  )
    throw new Error(
      "Enter a valid discount (percentage discounts cannot exceed 100%).",
    );
  if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0)
    throw new Error("Enter a valid minimum order amount.");
  const cap =
    form.maxDiscountAmount === "" || form.maxDiscountAmount == null
      ? ""
      : Number(form.maxDiscountAmount);
  const usage =
    form.usageLimit === "" || form.usageLimit == null
      ? ""
      : Number(form.usageLimit);
  if (cap !== "" && (!Number.isFinite(cap) || cap <= 0))
    throw new Error("The discount cap must be a positive amount.");
  if (usage !== "" && (!Number.isInteger(usage) || usage < 1))
    throw new Error("Usage limit must be a positive whole number.");
  return {
    code,
    discountType: form.discountType,
    discountValue,
    minOrderAmount,
    maxDiscountAmount: cap,
    usageLimit: usage,
    validUntil: form.validUntil || "",
    isActive: !!form.isActive,
    description: String(form.description || "").trim(),
    reason: String(form.reason || "").trim(),
  };
}
