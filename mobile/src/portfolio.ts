import type { Data } from "./api/client";

export function portfolioProject(draft: Data, media: Data[], status: string) {
  for (const key of [
    "projectName",
    "eventType",
    "eventDate",
    "city",
    "venue",
    "style",
  ])
    if (!String(draft[key] || "").trim())
      throw new Error(
        "Add the project name, event type, event date, venue, city and style.",
      );
  const eventDate = String(draft.eventDate);
  const parsed = new Date(`${eventDate}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== eventDate
  )
    throw new Error("Choose a valid event date.");
  if (!["VENDOR_REVIEW", "PUBLISHED"].includes(status))
    throw new Error("Choose draft review or published visibility.");
  if (!media.length || media.some((m) => !/^https?:\/\//i.test(m.url || "")))
    throw new Error("Upload at least one photo or video before saving.");
  return {
    ...Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : value,
      ]),
    ),
    tags: String(draft.tags || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    status,
    coverUrl: media[0].thumbnailUrl || media[0].url,
    mediaItems: media.map((m) => ({
      url: m.url,
      thumbnailUrl: m.thumbnailUrl,
      mediaType: m.mediaType || m.resourceType,
      title: m.filename || draft.projectName,
    })),
  };
}
