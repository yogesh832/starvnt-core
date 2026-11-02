import { vendorDestination } from "./vendorDestination.ts";
import { adminModules } from "./adminModules.ts";
import type { Data } from "./api/client";
const validId = (value: unknown) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
export function pushDestination(
  data: Data,
  identity: Data,
  domain: string,
  can: (p: string) => boolean,
) {
  if (
    data.version !== 1 ||
    data.domain !== domain ||
    String(data.ownerId) !== String(identity.id || identity._id)
  )
    return null;
  const fallback = {
    screen: "Main",
    params: { screen: domain === "admin" ? "CoreUpdates" : "Updates" },
  };
  const path = typeof data.actionUrl === "string" ? data.actionUrl : "";
  if (domain === "admin") {
    const match = path.match(/^\/admin\/([a-z-]+)(?:\?|$)/);
    const module = adminModules.find((m) => m.key === match?.[1]);
    return module &&
      (identity.role === "SUPER_ADMIN" || module.permissions.some(can))
      ? { screen: "AdminModule", params: { module: module.key } }
      : fallback;
  }
  if (data.surface !== identity.accountType) return null;
  if (identity.accountType === "VENDOR")
    return vendorDestination(path) || fallback;
  if (validId(data.threadId))
    return {
      screen: "Chat",
      params: { kind: "thread", threadId: data.threadId, vendor: false },
    };
  const match = path.match(
    /^\/customer\/events\/([a-zA-Z0-9_-]+)(?:\/([a-z-]+))?(?:\?|$)/,
  );
  const eventId = match?.[1] || (validId(data.eventId) ? data.eventId : null);
  if (!eventId) return fallback;
  const section = match?.[2];
  if (section === "circle") {
    const bookingId = new URL(path, "https://app.starvnt.com").searchParams.get(
      "booking",
    );
    return {
      screen: "Chat",
      params: {
        eventId,
        kind: "circle",
        ...(validId(bookingId) ? { bookingId } : {}),
      },
    };
  }
  const sectionMap: Record<string, string> = {
    plan: "requirements",
    services: "services",
    quotes: "quotes",
    bookings: "bookings",
    budget: "financial-truth",
    "event-day": "event-day",
    history: "history",
  };
  return section && sectionMap[section]
    ? {
        screen: "EventSection",
        params: { eventId, section: sectionMap[section], title: "Your event" },
      }
    : { screen: "Event", params: { eventId } };
}
