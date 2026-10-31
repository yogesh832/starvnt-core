export function vendorDestination(
  path: string,
): { screen: string; params?: Record<string, unknown> } | null {
  if (!path.startsWith("/vendor/") || path.startsWith("//")) return null;
  const url = new URL(path, "https://app.starvnt.com");
  const page = url.pathname.replace(/\/$/, "").slice("/vendor/".length);
  const record = url.searchParams.get('record');
  if (record !== null && !/^[a-f\d]{24}$/i.test(record)) return null;
  if (record && page === 'quotes') return { screen: 'VendorQuote', params: { quoteId: record } };
  if (record && page === 'bookings') return { screen: 'VendorBooking', params: { booking: { _id: record } } };
  if (
    page === "services" &&
    ["gear", "coverage"].includes(url.searchParams.get("action") || "")
  )
    return {
      screen: "VendorSetup",
      params: {
        kind:
          url.searchParams.get("action") === "gear" ? "capacity" : "coverage",
      },
    };
  if (
    [
      "enquiries",
      "quotes",
      "bookings",
      "services",
      "portfolio",
      "payments",
      "reviews",
      "analytics",
      "documents",
    ].includes(page)
  )
    return { screen: "VendorModule", params: { module: page, ...(record ? { recordId: record } : {}) } };
  if (["calendar", "availability"].includes(page))
    return { screen: "VendorCalendar" };
  if (["profile", "settings"].includes(page)) return { screen: "Profile" };
  if (page === "dashboard")
    return { screen: "Main", params: { screen: "Overview" } };
  if (["updates", "notifications", "messages"].includes(page)) {
    const threadId = url.searchParams.get("thread");
    return threadId && /^[a-zA-Z0-9_-]+$/.test(threadId)
      ? { screen: "Chat", params: { kind: "thread", threadId, vendor: true } }
      : { screen: "Main", params: { screen: "Updates" } };
  }
  return null;
}
