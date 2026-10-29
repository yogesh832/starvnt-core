const DAY_MS = 24 * 60 * 60 * 1000;
const ATTRIBUTION_WINDOW_DAYS = 30;

const idOf = (value) => {
  if (value == null) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
};

const validDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
};

/** Keeps a failed/malformed activation response distinct from a real 0% profile. */
export function getVendorActivationPresentation(activation, sourceFailed = false) {
  const completionValue = activation?.completionPercentage;
  const completionPercentage = Number(completionValue);
  if (sourceFailed || !activation || completionValue == null || String(completionValue).trim() === '' || !Number.isFinite(completionPercentage) || completionPercentage < 0 || completionPercentage > 100) {
    return { available: false, completionPercentage: null, matchingEligible: false, activationState: null };
  }
  return {
    available: true,
    completionPercentage,
    matchingEligible: Boolean(activation.matchingEligible || activation.isCommerciallyActive),
    activationState: activation.activationState || null,
  };
}

export function getDashboardFreshness(lastCompleteRefreshAt, now = new Date(), staleAfterMs = 90_000) {
  if (!lastCompleteRefreshAt) return { state: 'unavailable', label: 'No complete dashboard refresh yet' };
  const refreshedAt = validDate(lastCompleteRefreshAt);
  const nowAt = validDate(now);
  if (!refreshedAt || !nowAt) return { state: 'unavailable', label: 'No complete dashboard refresh yet' };
  const stale = nowAt.getTime() - refreshedAt.getTime() > staleAfterMs;
  const time = refreshedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return {
    state: stale ? 'stale' : 'current',
    label: `Last complete refresh ${time}${stale ? ' · data may be stale' : ''}`,
  };
}

/** Build the exact vendor quote request without substituting customer budget for vendor pricing. */
export function buildDashboardQuotePayload(quote, enquiry) {
  if (!enquiry?.opportunityId) throw new Error('An opportunity ID is required to submit a dashboard quote.');
  return {
    opportunityId: enquiry.opportunityId,
    customerId: enquiry.customerId,
    vendorServiceId: enquiry.serviceId,
    serviceName: enquiry.serviceName || 'Requested Package',
    eventDate: enquiry.date,
    serviceLocation: { address: enquiry.location },
    pricingBreakdown: {
      basePrice: Number(quote.base),
      travelFee: Number(quote.travel),
      totalAmount: Number(quote.total),
    },
    status: quote.status || 'SUBMITTED',
    notes: quote.notes?.trim() || '',
  };
}

/** Builds prioritized, deduplicated dashboard actions from existing records only. */
export function buildVendorActionItems({
  enquiries = [],
  quotes = [],
  bookings = [],
  reviews = [],
  messagesCount = 0,
  messageThreads = null,
  today = new Date().toISOString().slice(0, 10),
  profileNeedsCompletion = false,
}) {
  const actions = [
    ...bookings
      .filter((booking) => String(booking.bookingStatus || '').toUpperCase() === 'CONFIRMED'
        && ['NOT_STARTED', 'SERVICE_SCHEDULED'].includes(String(booking.executionStatus || '').toUpperCase())
        && typeof booking.eventDate === 'string'
        && booking.eventDate.slice(0, 10) >= today)
      .map((booking) => ({
        key: `booking-prep-${booking._id || booking.id}`,
        priority: 2,
        title: 'Review upcoming event brief',
        detail: `${booking.serviceName || booking.title || 'Confirmed booking'} · ${booking.eventDate.slice(0, 10)} · ${booking.executionStatus}`,
        href: '/vendor/bookings',
        label: 'Open booking',
        state: `Core status: CONFIRMED / ${booking.executionStatus}`,
        reason: 'This confirmed event is upcoming and its current execution status is not started or scheduled.',
      })),
    ...bookings
      .filter((booking) => String(booking.bookingStatus || '').toUpperCase() === 'CONFIRMED'
        && String(booking.executionStatus || '').toUpperCase() === 'SERVICE_STARTED')
      .map((booking) => ({
        key: `booking-active-${booking._id || booking.id}`,
        priority: 2,
        title: 'Review active booking',
        detail: `${booking.serviceName || booking.title || 'Confirmed booking'} · ${booking.eventDate ? String(booking.eventDate).slice(0, 10) : 'Date not recorded'} · SERVICE_STARTED`,
        href: '/vendor/bookings',
        label: 'Open booking',
        state: 'Core status: CONFIRMED / SERVICE_STARTED',
        reason: 'Core records this service as started. Review the booking and submit completion evidence only after the service is complete.',
      })),
    ...enquiries
      .filter((item) => ['New', 'NEW'].includes(item.status))
      .map((item) => ({ key: `enquiry-${item.id}`, priority: 3, title: 'Respond to a new enquiry', detail: item.title, href: '/vendor/enquiries', label: 'Open enquiries', state: 'New enquiry', reason: 'This enquiry is in the new state.' })),
    ...quotes
      .filter((item) => ['Draft', 'DRAFT'].includes(item.status))
      .map((item) => ({ key: `quote-${item._id}`, priority: 4, title: 'Finish and submit a draft quote', detail: `${item.type} · ${item.client}`, href: '/vendor/quotes', label: 'Open quotes', state: 'Draft quote', reason: 'This quote has not been submitted.' })),
    ...reviews
      .filter((item) => String(item.status || '').toUpperCase() === 'PUBLISHED' && !item.vendorReply?.text?.trim())
      .map((item) => ({ key: `review-${item._id}`, priority: 5, title: 'Reply to a published customer review', detail: `${item.rating || '—'} / 5 · ${item.serviceName || item.eventType || 'Event review'}`, href: '/vendor/reviews', label: 'Open reviews', state: 'PUBLISHED · no vendor reply recorded', reason: 'This eligible STARVNT review has no saved vendor response.' })),
    ...(Array.isArray(messageThreads)
      ? messageThreads.filter((thread) => Number(thread.unreadCount) > 0).map((thread) => ({
        key: `message-${thread.threadId}`,
        priority: 3,
        title: 'Reply to a customer conversation',
        detail: `${thread.eventName || 'Customer conversation'}${thread.eventDate ? ` · ${thread.eventDate}` : ''} · ${thread.unreadCount} unread`,
        href: `/vendor/updates?tab=messages&thread=${encodeURIComponent(thread.threadId)}`,
        label: 'Open conversation',
        state: 'Unread customer response',
        reason: 'This vendor-owned conversation contains unread customer messages.',
      }))
      : Number(messagesCount) > 0 ? [{ key: 'unread-customer-messages', priority: 3, title: 'Read customer messages', detail: `${Number(messagesCount)} conversation${Number(messagesCount) === 1 ? '' : 's'} with unread messages`, href: '/vendor/messages', label: 'Open messages', state: 'Unread customer messages', reason: 'Customer conversations contain unread messages.' }] : []),
    ...(profileNeedsCompletion ? [{ key: 'profile-completion', priority: 6, title: 'Complete your business profile', detail: 'Some vendor profile setup remains incomplete.', href: '/vendor/profile', label: 'Open profile', state: 'Profile setup incomplete', reason: 'The activation service reports profile completion below 100%.' }] : []),
  ];

  const seen = new Set();
  return actions
    .filter((action) => action.key && !seen.has(action.key) && seen.add(action.key))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 6);
}

/**
 * Measures a fully matured enquiry cohort. Newer enquiries are excluded because
 * their 30-day opportunity-to-booking window has not elapsed yet. A conversion
 * must join through the authoritative Opportunity reference, and bookings must
 * still be Core-confirmed.
 */
export function buildVendorSalesMetrics({ enquiries = [], quotes = [], bookings = [], now = new Date(), periodDays = 30 }) {
  const nowDate = validDate(now) || new Date();
  const cohortEnd = new Date(nowDate.getTime() - ATTRIBUTION_WINDOW_DAYS * DAY_MS);
  const cohortStart = new Date(cohortEnd.getTime() - periodDays * DAY_MS);
  const cohort = enquiries.filter((item) => {
    const createdAt = validDate(item.createdAt);
    return createdAt && createdAt >= cohortStart && createdAt < cohortEnd;
  });

  const cohortById = new Map(cohort.map((item) => [idOf(item.id || item._id), item]).filter(([id]) => id));
  const declineReasons = new Map();
  const declinedWithRecordedReason = new Set();
  for (const item of cohort) {
    const id = idOf(item.id || item._id);
    const reason = typeof item.declineReason === 'string' ? item.declineReason.trim() : '';
    if (String(item.status || '').toUpperCase() !== 'DECLINED' || !id || !reason) continue;
    declinedWithRecordedReason.add(id);
    declineReasons.set(reason, (declineReasons.get(reason) || 0) + 1);
  }
  const quoteOpportunities = new Set();
  const firstSubmittedQuoteAt = new Map();
  for (const quote of quotes) {
    const opportunityId = idOf(quote.opportunityId || quote.opportunity);
    const enquiry = cohortById.get(opportunityId);
    if (!enquiry) continue;
    const submittedAt = (Array.isArray(quote.history) ? quote.history : [])
      .filter((change) => String(change.toStatus || '').toUpperCase() === 'SUBMITTED')
      .map((change) => validDate(change.timestamp))
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    if (!submittedAt) continue;
    const enquiryCreated = validDate(enquiry.createdAt);
    if (submittedAt >= enquiryCreated && submittedAt <= new Date(enquiryCreated.getTime() + ATTRIBUTION_WINDOW_DAYS * DAY_MS)) {
      quoteOpportunities.add(opportunityId);
      const priorSubmission = firstSubmittedQuoteAt.get(opportunityId);
      if (!priorSubmission || submittedAt < priorSubmission) firstSubmittedQuoteAt.set(opportunityId, submittedAt);
    }
  }

  const bookedOpportunities = new Set();
  for (const booking of bookings) {
    const opportunityId = idOf(booking.opportunityId);
    const enquiry = cohortById.get(opportunityId);
    const confirmedAt = validDate(booking.createdAt);
    if (!enquiry || !confirmedAt || String(booking.bookingStatus || '').toUpperCase() !== 'CONFIRMED') continue;
    const enquiryCreated = validDate(enquiry.createdAt);
    if (confirmedAt <= new Date(enquiryCreated.getTime() + ATTRIBUTION_WINDOW_DAYS * DAY_MS)) bookedOpportunities.add(opportunityId);
  }

  const quoteTurnaroundSamples = cohort
    .map((item) => {
      const id = idOf(item.id || item._id);
      const createdAt = validDate(item.createdAt);
      const submittedAt = firstSubmittedQuoteAt.get(id);
      return createdAt && submittedAt ? submittedAt.getTime() - createdAt.getTime() : null;
    })
    .filter((value) => Number.isFinite(value) && value >= 0);
  const averageQuoteTurnaroundMs = quoteTurnaroundSamples.length
    ? Math.round(quoteTurnaroundSamples.reduce((sum, value) => sum + value, 0) / quoteTurnaroundSamples.length)
    : null;

  return {
    periodDays,
    attributionWindowDays: ATTRIBUTION_WINDOW_DAYS,
    cohortStart: cohortStart.toISOString(),
    cohortEnd: cohortEnd.toISOString(),
    eligibleEnquiries: cohort.length,
    declinedWithRecordedReasonCount: declinedWithRecordedReason.size,
    declineReasonBreakdown: [...declineReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 3),
    enquiriesWithSubmittedQuote: quoteOpportunities.size,
    confirmedBookings: bookedOpportunities.size,
    enquiryToQuoteRate: cohort.length ? quoteOpportunities.size / cohort.length : null,
    enquiryToBookingRate: cohort.length ? bookedOpportunities.size / cohort.length : null,
    averageQuoteTurnaroundMs,
    quoteTurnaroundSampleSize: quoteTurnaroundSamples.length,
  };
}

export function formatResponseTime(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'Insufficient data';
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
  const days = hours / 24;
  return `${Number.isInteger(days) ? days : days.toFixed(1)} days`;
}

export function formatRate(rate) {
  return Number.isFinite(rate) ? `${Math.round(rate * 100)}%` : 'Insufficient data';
}

function countInRange(rows, getTimestamp, start, end) {
  return rows.filter((row) => {
    const timestamp = validDate(getTimestamp(row));
    return timestamp && timestamp >= start && timestamp < end;
  }).length;
}

function firstSubmissionTimestamp(quote) {
  return (Array.isArray(quote.history) ? quote.history : [])
    .filter((change) => String(change.toStatus || '').toUpperCase() === 'SUBMITTED')
    .map((change) => validDate(change.timestamp))
    .filter(Boolean)
    .sort((a, b) => a - b)[0] || null;
}

/** Same elapsed portion of the current UTC calendar week and prior UTC week. */
export function buildVendorWeeklySummary({ enquiries = [], quotes = [], bookings = [], reviews = [], now = new Date() }) {
  const nowDate = validDate(now) || new Date();
  const todayUtc = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate()));
  const dayOfWeek = todayUtc.getUTCDay() || 7;
  const currentStart = new Date(todayUtc.getTime() - (dayOfWeek - 1) * DAY_MS);
  const previousStart = new Date(currentStart.getTime() - 7 * DAY_MS);
  const previousEnd = new Date(nowDate.getTime() - 7 * DAY_MS);
  const current = {
    enquiries: countInRange(enquiries, (row) => row.createdAt, currentStart, nowDate),
    submittedQuotes: quotes.filter((quote) => { const submittedAt = firstSubmissionTimestamp(quote); return submittedAt && submittedAt >= currentStart && submittedAt < nowDate; }).length,
    confirmedBookings: countInRange(bookings.filter((row) => String(row.bookingStatus || '').toUpperCase() === 'CONFIRMED'), (row) => row.createdAt, currentStart, nowDate),
    publishedReviews: countInRange(reviews.filter((row) => String(row.status || '').toUpperCase() === 'PUBLISHED'), (row) => row.createdAt, currentStart, nowDate),
  };
  const previous = {
    enquiries: countInRange(enquiries, (row) => row.createdAt, previousStart, previousEnd),
    submittedQuotes: quotes.filter((quote) => { const submittedAt = firstSubmissionTimestamp(quote); return submittedAt && submittedAt >= previousStart && submittedAt < previousEnd; }).length,
    confirmedBookings: countInRange(bookings.filter((row) => String(row.bookingStatus || '').toUpperCase() === 'CONFIRMED'), (row) => row.createdAt, previousStart, previousEnd),
    publishedReviews: countInRange(reviews.filter((row) => String(row.status || '').toUpperCase() === 'PUBLISHED'), (row) => row.createdAt, previousStart, previousEnd),
  };
  return { current, previous, currentStart: currentStart.toISOString(), currentEnd: nowDate.toISOString(), previousStart: previousStart.toISOString(), previousEnd: previousEnd.toISOString() };
}
