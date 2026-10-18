import type { Data } from "./api/client";

export function sortOptions(options: Data[], sort: string): Data[] {
  const rows = [...options];
  if (!["budget", "premium"].includes(sort)) return rows;
  const listedPrice = (row: Data) =>
    row.price != null && Number.isFinite(Number(row.price));
  return rows.sort((a, b) =>
    !listedPrice(a) || !listedPrice(b)
      ? Number(!listedPrice(a)) - Number(!listedPrice(b))
      : (Number(a.price) - Number(b.price)) * (sort === "premium" ? -1 : 1),
  );
}
export function optionAvailability(option: Data): string {
  return typeof option.availability === "string"
    ? option.availability
    : option.availability?.status || "unknown";
}
export function selectionReason(
  eventStatus: string,
  option: Data,
): string | null {
  if (["completed", "cancelled"].includes(eventStatus))
    return "This event is closed.";
  if (eventStatus === "draft") return "Confirm your event details first.";
  if (["blocked", "booked"].includes(optionAvailability(option)))
    return "Not available on your event date.";
  if (!option.requiresVendorConfirmation && option.price == null)
    return "A fixed total has not been quoted yet.";
  return null;
}
export function comparisonChoice(
  selected: string[],
  optionId: string,
): string[] {
  if (selected.includes(optionId))
    return selected.filter((value) => value !== optionId);
  return selected.length < 3 ? [...selected, optionId] : selected;
}
