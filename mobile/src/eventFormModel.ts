import type { Data } from "./api/client";

export const emptyLocation = {
  country: "",
  state: "",
  city: "",
  area: "",
  venueName: "",
  address: "",
  pincode: "",
  landmark: "",
  notes: "",
};
export const emptyServiceLocation = {
  mode: "unspecified",
  place: "",
  pickup: "",
  drop: "",
  dropIsEventLocation: false,
};
export function locationFromEvent(event: Data): Data {
  const value = event.location || {};
  return {
    ...emptyLocation,
    ...value,
    city: event.city || value.city || "",
    area: value.locality || "",
  };
}
export function locationPayload(value: Data, original?: Data): Data {
  const result: Data = {};
  for (const key of [...Object.keys(emptyLocation), "coordinates"]) {
    if (value[key] === undefined) continue;
    const current =
      typeof value[key] === "string" ? value[key].trim() : value[key];
    if (
      original
        ? JSON.stringify(current) !== JSON.stringify(original[key])
        : current !== "" && current != null
    ) {
      result[key] = current === "" ? null : current;
    }
  }
  return result;
}
export function detailsPayload(value: Data = {}): Data {
  if (
    Object.values(value).some(
      (v) => typeof v === "number" && !Number.isFinite(v),
    )
  )
    throw new Error("Enter valid numbers in the service details.");
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, v]) =>
        v !== "" && v !== undefined && !(Array.isArray(v) && !v.length),
    ),
  );
}
export function serviceLocationPayload(
  value: Data = emptyServiceLocation,
): Data {
  if (value.mode !== "custom") return { mode: value.mode || "unspecified" };
  return {
    mode: "custom",
    place: value.place?.trim() || null,
    pickup: value.pickup?.trim() || null,
    drop: value.dropIsEventLocation ? null : value.drop?.trim() || null,
    dropIsEventLocation: !!value.dropIsEventLocation,
    ...(value.address ? { address: value.address.trim() } : {}),
    ...(value.locality ? { locality: value.locality.trim() } : {}),
    ...(value.city ? { city: value.city.trim() } : {}),
    ...(value.notes ? { notes: value.notes.trim() } : {}),
  };
}
export function serviceLocationText(value?: Data, eventLabel?: string): string {
  if (!value || value.mode === "unspecified") return "";
  if (value.mode === "event")
    return eventLabel ? `At ${eventLabel}` : "At the event location";
  if (value.pickup || value.drop || value.dropIsEventLocation) {
    return [
      value.pickup && `From ${value.pickup}`,
      (value.dropIsEventLocation || value.drop) &&
        `to ${value.dropIsEventLocation ? "the event location" : value.drop}`,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return (
    [value.place, value.locality, value.city].filter(Boolean).join(", ") ||
    value.address ||
    ""
  );
}

export function eventEditPayload(
  form: Data,
  location: Data,
  original: Data,
): Data {
  const result: Data = {};
  for (const key of [
    "title",
    "eventDate",
    "guestCount",
    "budget",
    "specialRequirements",
    "notes",
    "customType",
    "eventType",
  ]) {
    if (
      form[key] === undefined ||
      (key === "eventType" && original.status !== "draft")
    )
      continue;
    if (
      key === "customType" &&
      (form.eventType || original.eventType) !== "other"
    )
      continue;
    const value = String(form[key] ?? "").trim();
    if (value === String(original[key] ?? "").trim()) continue;
    if (
      ["budget", "guestCount"].includes(key) &&
      value &&
      (!Number.isFinite(Number(value)) ||
        Number(value) <= 0 ||
        (key === "guestCount" && !Number.isInteger(Number(value))))
    ) {
      throw new Error(
        key === "guestCount"
          ? "Guest count must be a positive whole number."
          : "Enter a valid positive budget.",
      );
    }
    result[key] =
      value === ""
        ? null
        : ["budget", "guestCount"].includes(key)
          ? Number(value)
          : value;
  }
  const patch = locationPayload(location, locationFromEvent(original));
  if (Object.keys(patch).length) result.location = patch;
  return result;
}
