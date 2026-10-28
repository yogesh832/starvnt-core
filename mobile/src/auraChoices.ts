import type { Data } from "./api/client";
export function auraChoice(option: Data | string): {
  prefill?: string;
  message?: string;
  body: Data;
} {
  if (typeof option === "string") return { message: option, body: {} };
  if (option.prefill) return { prefill: String(option.prefill), body: {} };
  const body: Data = {};
  if (option.skipTopic) body.skipTopic = option.skipTopic;
  else if (option.budgetRange) body.budgetRange = option.budgetRange;
  else if (option.serviceLocation)
    body.serviceLocation = option.serviceLocation;
  return { message: String(option.message || option.label || ""), body };
}
export function conversationContext(
  bookingId?: string,
  requirementId?: string,
): Data {
  return bookingId ? { bookingId } : requirementId ? { requirementId } : {};
}
