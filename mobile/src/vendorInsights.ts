import type { Data } from "./api/client";
const amount = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
export function vendorInsightTotals(bookings: Data[]) {
  return bookings.reduce(
    (total, booking) => {
      total.advanceReceived += amount(booking.paymentSummary?.paidAmount);
      total.recordedBookingValue += amount(booking.totalAmount);
      if (
        booking.paymentStatus === "PAYMENT_VERIFIED" &&
        booking.bookingStatus === "CONFIRMED"
      )
        total.verifiedAdvances += amount(booking.paymentSummary?.paidAmount);
      if (booking.settlementStatus === "SETTLED")
        total.released += amount(
          booking.settlementDetails?.vendorPayable ??
            booking.settlementMath?.vendorPayable ??
            booking.vendorPayable ??
            booking.totalAmount,
        );
      return total;
    },
    { advanceReceived: 0, recordedBookingValue: 0, verifiedAdvances: 0, released: 0 },
  );
}
export function reviewText(review: Data): string {
  const text =
    review.reviewText ??
    review.text ??
    review.originalText ??
    review.comment ??
    "";
  return typeof text === "string"
    ? text
    : typeof text?.text === "string"
      ? text.text
      : "";
}
export function reviewerName(review: Data): string {
  return (
    review.customerName ||
    review.authorAttribution?.displayName ||
    review.author_name ||
    review.authorName ||
    review.author ||
    "Reviewer"
  );
}

const validTime = (value: unknown) => {
  const parsed = value ? new Date(String(value)) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
};
const recordId = (value: unknown) =>
  value && typeof value === "object"
    ? String((value as Data)._id || (value as Data).id || "")
    : String(value || "");

/** Cohort conversion uses only matured enquiries and authoritative booking/quote links. */
export function vendorSalesMetrics(
  { enquiries = [], quotes = [], bookings = [] }: { enquiries?: Data[]; quotes?: Data[]; bookings?: Data[] },
  periodDays = 30,
  now = new Date(),
) {
  const day = 86400000;
  const end = new Date(now.getTime() - 30 * day);
  const start = new Date(end.getTime() - periodDays * day);
  const cohort = enquiries.filter((item) => {
    const created = validTime(item.createdAt);
    return created && created >= start && created < end;
  });
  const byId = new Map<string, Data>();
  cohort.forEach((item) => { const key = recordId(item.id || item._id); if (key) byId.set(key, item); });
  const quoted = new Set<string>();
  const firstQuote = new Map<string, Date>();
  for (const quote of quotes) {
    const opportunityId = recordId(quote.opportunityId || quote.opportunity);
    const enquiry = byId.get(opportunityId);
    if (!enquiry) continue;
    const submitted = (Array.isArray(quote.history) ? quote.history : [])
      .filter((entry: Data) => String(entry.toStatus).toUpperCase() === "SUBMITTED")
      .map((entry: Data) => validTime(entry.timestamp)).filter((value): value is Date => value instanceof Date)
      .sort((a: Date, b: Date) => a.getTime() - b.getTime())[0] as Date | undefined;
    const created = validTime(enquiry.createdAt);
    if (!submitted || !created || submitted < created || submitted > new Date(created.getTime() + 30 * day)) continue;
    quoted.add(opportunityId);
    const prior = firstQuote.get(opportunityId);
    if (!prior || submitted < prior) firstQuote.set(opportunityId, submitted);
  }
  const booked = new Set<string>();
  for (const booking of bookings) {
    const opportunityId = recordId(booking.opportunityId);
    const enquiry = byId.get(opportunityId);
    const created = validTime(enquiry?.createdAt);
    const confirmed = validTime(booking.createdAt);
    if (created && confirmed && String(booking.bookingStatus).toUpperCase() === "CONFIRMED" && confirmed <= new Date(created.getTime() + 30 * day)) booked.add(opportunityId);
  }
  const turnaround = cohort.map((item) => {
    const created = validTime(item.createdAt);
    const submitted = firstQuote.get(recordId(item.id || item._id));
    return created && submitted ? submitted.getTime() - created.getTime() : null;
  }).filter((value): value is number => value !== null && value >= 0);
  return {
    periodDays,
    eligible: cohort.length,
    quoted: quoted.size,
    booked: booked.size,
    quoteRate: cohort.length ? quoted.size / cohort.length : null,
    bookingRate: cohort.length ? booked.size / cohort.length : null,
    avgQuoteMs: turnaround.length ? Math.round(turnaround.reduce((sum, value) => sum + value, 0) / turnaround.length) : null,
    quoteSamples: turnaround.length,
    cohortStart: start.toISOString().slice(0, 10),
    cohortEnd: end.toISOString().slice(0, 10),
    declineReasons: cohort.reduce((result: Record<string, number>, item) => {
      const reason = typeof item.declineReason === "string" ? item.declineReason.trim() : "";
      if (String(item.status).toUpperCase() === "DECLINED" && reason) result[reason] = (result[reason] || 0) + 1;
      return result;
    }, {}),
  };
}

export function formatVendorResponseTime(milliseconds: number | null) {
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds < 0) return "Insufficient data";
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
  const days = hours / 24;
  return `${Number.isInteger(days) ? days : days.toFixed(1)} days`;
}

export function vendorActionItems(data: Data) {
  const actions: Array<{ key: string; title: string; detail: string; module: string; priority: number }> = [];
  for (const booking of data.bookings || []) {
    const status = String(booking.bookingStatus || "").toUpperCase();
    const execution = String(booking.executionStatus || "").toUpperCase();
    if (status === "CONFIRMED" && ["NOT_STARTED", "SERVICE_SCHEDULED"].includes(execution) && String(booking.eventDate || "").slice(0, 10) >= new Date().toISOString().slice(0, 10)) actions.push({ key: `prep-${recordId(booking)}`, title: "Review upcoming event brief", detail: `${booking.serviceName || "Confirmed booking"} · ${String(booking.eventDate).slice(0, 10)}`, module: "bookings", priority: 1 });
    if (status === "CONFIRMED" && execution === "SERVICE_STARTED") actions.push({ key: `active-${recordId(booking)}`, title: "Review active booking", detail: `${booking.serviceName || "Booking"} · service started`, module: "bookings", priority: 1 });
  }
  for (const item of data.enquiries || []) if (["NEW"].includes(String(item.status).toUpperCase())) actions.push({ key: `enquiry-${recordId(item)}`, title: "Respond to a new enquiry", detail: item.serviceName || item.eventName || "New customer enquiry", module: "enquiries", priority: 2 });
  for (const item of data.quotes || []) if (String(item.status).toUpperCase() === "DRAFT") actions.push({ key: `quote-${recordId(item)}`, title: "Finish and submit a draft quote", detail: `${item.serviceName || "Quote"} · ${item.clientName || "Customer"}`, module: "quotes", priority: 3 });
  for (const item of data.reviews || []) if (String(item.status).toUpperCase() === "PUBLISHED" && !item.vendorReply?.text?.trim()) actions.push({ key: `review-${recordId(item)}`, title: "Reply to a published review", detail: `${item.rating || "—"} / 5 · ${item.serviceName || "Customer review"}`, module: "reviews", priority: 4 });
  if (Number(data.counts?.messagesCount || data.counts?.unreadNotificationsCount) > 0) actions.push({ key: "unread-messages", title: "Read customer messages", detail: `${data.counts.messagesCount || data.counts.unreadNotificationsCount} unread conversation or notification(s)`, module: "messages", priority: 2 });
  if (data.activation?.status && Number(data.activation.status.completionPercentage) < 100) actions.push({ key: "profile-completion", title: "Complete your business profile", detail: `Profile ${data.activation.status.completionPercentage}% complete`, module: "profile", priority: 5 });
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 6);
}

export function vendorWeeklySummary({ enquiries = [], quotes = [], bookings = [], reviews = [] }: { enquiries?: Data[]; quotes?: Data[]; bookings?: Data[]; reviews?: Data[] }, now = new Date()) {
  const day = 86400000;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = today.getUTCDay() || 7;
  const start = new Date(today.getTime() - (weekday - 1) * day);
  const priorStart = new Date(start.getTime() - 7 * day);
  const priorEnd = new Date(now.getTime() - 7 * day);
  const inRange = (rows: Data[], value: (row: Data) => unknown, from: Date, to: Date) => rows.filter((row) => {
    const at = validTime(value(row));
    return at && at >= from && at < to;
  }).length;
  const submissions = (from: Date, to: Date) => quotes.filter((quote) => (Array.isArray(quote.history) ? quote.history : []).some((entry: Data) => String(entry.toStatus).toUpperCase() === "SUBMITTED" && validTime(entry.timestamp) && validTime(entry.timestamp)! >= from && validTime(entry.timestamp)! < to)).length;
  const current = {
    enquiries: inRange(enquiries, (row) => row.createdAt, start, now),
    submittedQuotes: submissions(start, now),
    confirmedBookings: inRange(bookings.filter((row) => String(row.bookingStatus).toUpperCase() === "CONFIRMED"), (row) => row.createdAt, start, now),
    publishedReviews: inRange(reviews.filter((row) => String(row.status).toUpperCase() === "PUBLISHED"), (row) => row.createdAt, start, now),
  };
  const previous = {
    enquiries: inRange(enquiries, (row) => row.createdAt, priorStart, priorEnd),
    submittedQuotes: submissions(priorStart, priorEnd),
    confirmedBookings: inRange(bookings.filter((row) => String(row.bookingStatus).toUpperCase() === "CONFIRMED"), (row) => row.createdAt, priorStart, priorEnd),
    publishedReviews: inRange(reviews.filter((row) => String(row.status).toUpperCase() === "PUBLISHED"), (row) => row.createdAt, priorStart, priorEnd),
  };
  return { current, previous };
}
