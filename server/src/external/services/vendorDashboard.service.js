import { Opportunity } from '../models/Opportunity.js';
import { Quote } from '../models/Quote.js';
import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { VendorReview } from '../models/VendorReview.js';
import { VendorMessageThread } from '../models/VendorMessageThread.js';
import { FinanceLedgerEntry } from '../../admin/models/FinanceLedgerEntry.js';
import { evaluateVendorActivation } from './vendorActivation.service.js';
import { firstVendorResponse } from './vendorFirstResponseMetrics.service.js';

const DAY = 86400000;
const LIMIT = 5000;
const OFFSET = 330 * 60000;
const id = value => String(value?._id ?? value ?? '');
const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value) : null;
const within = (value, start, end) => date(value) >= start && date(value) < end && date(value) !== null;
const mean = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
const money = value => Math.round(value * 100) / 100;

export function dashboardPeriods(now = new Date(), periodDays = 30) {
  const local = new Date(now.getTime() + OFFSET);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET;
  const weekEnd = new Date(today - ((local.getUTCDay() + 6) % 7) * DAY);
  return {
    selected: { start: new Date(today - periodDays * DAY), end: new Date(today) },
    cohort: { start: new Date(today - (periodDays + 30) * DAY), end: new Date(today - 30 * DAY) },
    week: { start: new Date(weekEnd.getTime() - 7 * DAY), end: weekEnd },
    previousWeek: { start: new Date(weekEnd.getTime() - 14 * DAY), end: new Date(weekEnd.getTime() - 7 * DAY) },
  };
}

function firstTransition(quote, status) {
  return (quote.history || []).filter(change => change.toStatus === status)
    .map(change => date(change.timestamp)).filter(Boolean).sort((a, b) => a - b)[0] || null;
}

export function salesMetrics({ opportunities, quotes, bookings, threads = [], start, end, now, complete = true }) {
  if (!complete) return { available: false, reason: 'A source failed or exceeded the safe record limit.' };
  const cohort = opportunities.filter(row => within(row.createdAt, start, end));
  const cohortIds = new Set(cohort.map(row => id(row._id)));
  const quoteById = new Map(quotes.map(row => [id(row._id), row]));
  const converted = new Set();
  const submitted = new Set();
  const accepted = new Set();
  const turnaround = [];
  const quotesByOpportunity = new Map();
  const opportunityById = new Map(cohort.map(row => [id(row._id), row]));
  for (const quote of quotes) {
    const key = id(quote.opportunity);
    if (!quotesByOpportunity.has(key)) quotesByOpportunity.set(key, []);
    quotesByOpportunity.get(key).push(quote);
  }
  for (const opportunity of cohort) {
    const created = date(opportunity.createdAt);
    const deadline = new Date(created.getTime() + 30 * DAY);
    const submissions = [];
    for (const quote of quotesByOpportunity.get(id(opportunity._id)) || []) {
      const at = firstTransition(quote, 'SUBMITTED');
      if (at && at >= created && at < deadline && at <= now) { submitted.add(id(opportunity._id)); submissions.push(at); }
      const approvedAt = firstTransition(quote, 'APPROVED');
      if (approvedAt && approvedAt >= created && approvedAt < deadline && approvedAt <= now) accepted.add(id(opportunity._id));
    }
    if (submissions.length) turnaround.push(Math.min(...submissions.map(at => at.getTime())) - created.getTime());
  }
  for (const booking of bookings) {
    if (booking.bookingStatus !== 'CONFIRMED') continue;
    const opportunityId = id(quoteById.get(id(booking.quoteId))?.opportunity) || id(booking.opportunityId);
    if (!cohortIds.has(opportunityId)) continue;
    const opportunity = opportunityById.get(opportunityId);
    const at = date(booking.createdAt);
    if (at && at >= date(opportunity.createdAt) && at < new Date(date(opportunity.createdAt).getTime() + 30 * DAY) && at <= now) converted.add(opportunityId);
  }
  const responses = firstVendorResponse({ opportunities: cohort, quotes, threads, now, attributionWindowDays: 30 });
  const mature = end.getTime() + 30 * DAY <= now.getTime();
  return {
    available: true, periodStart: start, periodEnd: end, attributionWindowDays: 30, mature,
    enquiries: cohort.length, quotedEnquiries: submitted.size, acceptedEnquiries: accepted.size,
    convertedEnquiries: converted.size,
    conversionPercent: mature && cohort.length ? money(converted.size / cohort.length * 100) : null,
    averageFirstResponseMs: mean(responses), responseSamples: responses.length,
    averageQuoteTurnaroundMs: mean(turnaround), turnaroundSamples: turnaround.length,
    declinedWithReason: cohort.filter(row => row.status === 'DECLINED' && row.declineReason?.trim()).length,
  };
}

// Duplicate quote contracts are unsafe to sum when their financial snapshots disagree.
export function distinctContracts(bookings) {
  const rows = new Map();
  let consistent = true;
  for (const booking of bookings.filter(row => row.bookingStatus === 'CONFIRMED')) {
    const key = booking.quoteId ? `quote:${id(booking.quoteId)}` : `booking:${id(booking._id)}`;
    const prior = rows.get(key);
    const fingerprint = row => JSON.stringify([row.totalAmount, row.paymentStatus, row.paymentSummary, row.taxSummary, row.settlementStatus, row.settlementDetails]);
    if (prior && fingerprint(prior) !== fingerprint(booking)) consistent = false;
    if (!prior || (date(booking.createdAt) && date(prior.createdAt) && date(booking.createdAt) < date(prior.createdAt))) rows.set(key, booking);
  }
  return { bookings: [...rows.values()], consistent };
}

export function financeMetrics(bookings, ledger, { start, end, complete = true, ledgerComplete = true } = {}) {
  const distinct = distinctContracts(bookings);
  const selected = distinct.bookings.filter(row => within(row.createdAt, start, end));
  const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const valid = complete && distinct.consistent && selected.every(row => amount(row.totalAmount));
  const payable = row => row.taxSummary?.invoiceNumber && amount(row.taxSummary.vendorPayable) ? row.taxSummary.vendorPayable : null;
  const paid = row => row.paymentStatus === 'PAYMENT_VERIFIED' && amount(row.paymentSummary?.paidAmount) ? row.paymentSummary.paidAmount : null;
  const knownPayments = selected.every(row => row.paymentStatus === 'PENDING' || paid(row) !== null);
  const selectedIds = new Set(selected.map(row => id(row._id)));
  const hasAdjustments = ledger.some(row => selectedIds.has(id(row.booking)) && ['REFUND', 'ADJUSTMENT'].includes(row.type));
  const sum = get => money(selected.reduce((total, row) => total + get(row), 0));
  const paymentIds = selected.filter(row => row.paymentStatus === 'PAYMENT_VERIFIED').map(row => row.paymentSummary?.providerPaymentId).filter(Boolean);
  const uniquePayments = paymentIds.length === new Set(paymentIds).size;
  const entries = ledger.filter(row => within(row.postedAt, start, end));
  const ledgerValid = ledgerComplete && entries.every(row => row.currency === 'INR' && amount(row.amount));
  const ledgerTotal = type => ledgerValid ? money(entries.filter(row => row.type === type).reduce((sum, row) => sum + row.amount, 0)) : null;
  return {
    available: valid, currency: 'INR', periodStart: start, periodEnd: end,
    reason: valid ? null : 'Source unavailable, incomplete, or conflicting duplicate contracts require reconciliation.',
    bookingValue: valid ? sum(row => row.totalAmount) : null,
    contractedAmount: valid && selected.every(row => payable(row) !== null) ? sum(payable) : null,
    verifiedPayments: valid && knownPayments && uniquePayments ? sum(row => paid(row) ?? 0) : null,
    outstanding: valid && ledgerComplete && !hasAdjustments && knownPayments && uniquePayments && selected.every(row => (paid(row) ?? 0) <= row.totalAmount) ? sum(row => row.totalAmount - (paid(row) ?? 0)) : null,
    settlementEligible: valid && selected.filter(row => row.settlementStatus === 'SETTLEMENT_ELIGIBLE').every(row => payable(row) !== null)
      ? sum(row => row.settlementStatus === 'SETTLEMENT_ELIGIBLE' ? payable(row) : 0) : null,
    settlementReleased: ledgerTotal('SETTLEMENT_RELEASE'), refunds: ledgerTotal('REFUND'),
    adjustments: ledgerTotal('ADJUSTMENT'), settlementInitiated: null, profit: null,
  };
}

function operationalWeek(data, period, complete) {
  if (!complete) return { available: false, ...period };
  return {
    available: true, ...period,
    enquiries: data.opportunities.filter(row => within(row.createdAt, period.start, period.end)).length,
    submittedQuotes: data.quotes.filter(row => within(firstTransition(row, 'SUBMITTED'), period.start, period.end)).length,
    confirmedBookings: distinctContracts(data.bookings).bookings.filter(row => within(row.createdAt, period.start, period.end)).length,
    completedBookings: distinctContracts(data.bookings).bookings.filter(row => row.executionStatus === 'COMPLETION_VERIFIED' && within(row.validationAudit?.verifiedAt, period.start, period.end)).length,
    verifiedReviews: data.reviews.filter(row => within(row.createdAt, period.start, period.end)).length,
  };
}

export function buildDashboard(data, { now = new Date(), periodDays = 30 } = {}) {
  const periods = dashboardPeriods(now, periodDays);
  const complete = key => data.states[key] === 'AVAILABLE';
  const salesComplete = ['opportunities', 'quotes', 'bookings', 'threads'].every(complete);
  const actions = [];
  const quoteById = new Map(data.quotes.map(row => [id(row._id), row]));
  const canonical = (module, row) => module === 'enquiries' ? `enquiry:${id(row._id)}`
    : row.opportunity ? `enquiry:${id(row.opportunity)}`
    : row.quote && quoteById.get(id(row.quote))?.opportunity ? `enquiry:${id(quoteById.get(id(row.quote)).opportunity)}`
    : `${module}:${id(row._id)}`;
  const add = (module, row, title, reason, priority, status) => actions.push({
    id: `${module}:${id(row._id)}`, sourceId: id(row._id), module, title, reason, priority, status,
    dedupeKey: canonical(module, row), eventDate: row.eventDate || null, dueAt: null,
    href: `/vendor/${module}?record=${encodeURIComponent(id(row._id))}`,
  });
  const today = new Date(now.getTime() + OFFSET).toISOString().slice(0, 10);
  if (complete('bookings')) for (const row of distinctContracts(data.bookings).bookings) {
    if (['ISSUE_REPORTED', 'UNDER_REVIEW', 'RESOLUTION_PROPOSED'].includes(row.protectionStatus)) add('bookings', row, 'Review unresolved booking issue', 'The Core protection workflow records an unresolved issue. Review the authorized booking workflow.', 2, row.protectionStatus);
    else if (row.eventDate >= today && ['NOT_STARTED', 'SERVICE_SCHEDULED'].includes(row.executionStatus)) add('bookings', row, 'Review upcoming event brief', `Confirmed event on ${row.eventDate}; preparation should be reviewed.`, 2, row.executionStatus);
    else if (row.eventDate < today && ['NOT_STARTED', 'SERVICE_SCHEDULED', 'SERVICE_STARTED'].includes(row.executionStatus)) add('bookings', row, 'Review post-event documentation', 'The event date has passed; completion has not been submitted.', 4, row.executionStatus);
  }
  if (complete('opportunities')) for (const row of data.opportunities.filter(row => ['NEW', 'VIEWED'].includes(row.status))) {
    const due = date(row.slaExpiresAt);
    const overdue = due && due < now;
    add('enquiries', row, 'Respond to enquiry', overdue ? 'The saved response SLA deadline has passed.' : 'This enquiry is awaiting a vendor response.', overdue ? 1 : 3, row.status);
    actions[actions.length - 1].dueAt = due;
  }
  if (complete('quotes')) for (const row of data.quotes.filter(row => row.status === 'DRAFT')) add('quotes', row, 'Prepare quotation', 'A saved draft has not been submitted.', 4, row.status);
  if (complete('threads')) for (const row of data.threads.filter(row => row.status !== 'BLOCKED' && row.unreadVendorCount > 0)) {
    add('updates', row, 'Review customer response', 'An authorized conversation has unread messages.', 3, 'UNREAD');
    actions[actions.length - 1].href = `/vendor/updates?tab=messages&thread=${encodeURIComponent(id(row._id))}`;
  }
  const recommendations = [];
  const readiness = data.readiness;
  if (readiness) {
    const destinations = { PROFILE_INCOMPLETE: 'profile', KYC_PENDING: 'documents', BANK_VERIFICATION_PENDING: 'documents', SERVICE_INCOMPLETE: 'services', CAPACITY_NOT_CONFIGURED: 'services', OPERATIONAL_RESOURCES_MISSING: 'services', AVAILABILITY_NOT_CONFIGURED: 'availability', COVERAGE_MISSING: 'profile', OPERATING_LOCATION_MISSING: 'profile', PORTFOLIO_MISSING: 'portfolio' };
    (readiness.reasonCodes || []).forEach((code, index) => recommendations.push({ id: code, title: readiness.missingRequirements[index], source: 'Activation evaluator', href: `/vendor/${destinations[code] || 'profile'}`, action: 'Review requirement' }));
  }
  const reviewsAvailable = complete('reviews');
  const distinct = distinctContracts(data.bookings);
  const weeklyComplete = ['opportunities', 'quotes', 'bookings', 'reviews'].every(complete) && distinct.consistent;
  const seenActions = new Set();
  const deduplicatedActions = actions.sort((a, b) => a.priority - b.priority || (a.eventDate || '9999').localeCompare(b.eventDate || '9999') || a.id.localeCompare(b.id))
    .filter(action => { if (seenActions.has(action.dedupeKey)) return false; seenActions.add(action.dedupeKey); return true; });
  return {
    generatedAt: now, timezone: 'Asia/Kolkata', periodDays, periods, sourceStates: data.states,
    snapshot: {
      actionableEnquiries: complete('opportunities') ? data.opportunities.filter(row => ['NEW', 'VIEWED'].includes(row.status)).length : null,
      pendingQuotes: complete('quotes') ? data.quotes.filter(row => row.status === 'DRAFT').length : null,
      upcomingBookings: complete('bookings') && distinct.consistent ? distinct.bookings.filter(row => row.eventDate >= today && row.executionStatus !== 'COMPLETION_VERIFIED').length : null,
    },
    upcomingBookings: complete('bookings') && distinct.consistent ? distinct.bookings.filter(row => row.eventDate >= today && row.executionStatus !== 'COMPLETION_VERIFIED')
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate)).slice(0, 5).map(row => ({ id: id(row._id), eventDate: row.eventDate, status: row.executionStatus, href: `/vendor/bookings?record=${encodeURIComponent(id(row._id))}` })) : null,
    sales: salesMetrics({ ...data, ...periods.cohort, now, complete: salesComplete }),
    financial: financeMetrics(data.bookings, data.ledger, { ...periods.selected, complete: complete('bookings'), ledgerComplete: complete('ledger') }),
    quality: {
      reviewCount: reviewsAvailable ? data.reviews.length : null,
      rating: reviewsAvailable && data.reviews.length ? money(data.reviews.reduce((sum, row) => sum + row.rating, 0) / data.reviews.length) : null,
      recent: reviewsAvailable ? data.reviews.slice(0, 3).map(row => ({ id: id(row._id), rating: row.rating, createdAt: row.createdAt, replied: Boolean(row.vendorReply?.text) })) : [],
      completedBookings: complete('bookings') && distinct.consistent ? distinct.bookings.filter(row => row.executionStatus === 'COMPLETION_VERIFIED').length : null,
      onTimeRate: null,
      unresolvedIssues: complete('bookings') && distinct.consistent ? distinct.bookings.filter(row => ['ISSUE_REPORTED', 'UNDER_REVIEW', 'RESOLUTION_PROPOSED'].includes(row.protectionStatus)).length : null,
    },
    readiness, actions: deduplicatedActions.slice(0, 20),
    recommendations, weekly: { current: operationalWeek(data, periods.week, weeklyComplete), previous: operationalWeek(data, periods.previousWeek, weeklyComplete) },
  };
}

export async function getVendorDashboard(vendorId, options = {}) {
  // Bounded projections deliberately omit customer identities, message bodies and bank details.
  const sources = {
    opportunities: Opportunity.find({ vendor: vendorId }).select('_id createdAt status slaResponseTimeMs slaExpiresAt declineReason').sort({ createdAt: -1 }).limit(LIMIT + 1).lean(),
    quotes: Quote.find({ vendor: vendorId }).select('_id opportunity status history').sort({ createdAt: -1 }).limit(LIMIT + 1).lean(),
    bookings: CoreBooking.find({ vendorId }).select('_id quoteId opportunityId createdAt eventDate bookingStatus executionStatus protectionStatus totalAmount paymentStatus paymentSummary taxSummary settlementStatus settlementDetails validationAudit.verifiedAt').sort({ createdAt: -1 }).limit(LIMIT + 1).lean(),
    reviews: VendorReview.find({ vendor: vendorId, status: 'PUBLISHED', isVerified: true }).select('_id rating createdAt vendorReply.text').sort({ createdAt: -1 }).limit(LIMIT + 1).lean(),
    threads: VendorMessageThread.find({ vendor: vendorId, status: { $ne: 'BLOCKED' } }).select('_id opportunity quote status unreadVendorCount messages.sender messages.createdAt').sort({ createdAt: -1 }).limit(LIMIT + 1).lean(),
    ledger: FinanceLedgerEntry.find({ vendorId }).select('booking type amount currency postedAt').sort({ postedAt: -1 }).limit(LIMIT + 1).lean(),
    readiness: evaluateVendorActivation(vendorId),
  };
  const names = Object.keys(sources);
  const results = await Promise.allSettled(Object.values(sources));
  const data = { states: {} };
  results.forEach((result, index) => {
    const name = names[index];
    const truncated = result.status === 'fulfilled' && Array.isArray(result.value) && result.value.length > LIMIT;
    data.states[name] = result.status === 'rejected' ? 'UNAVAILABLE' : truncated ? 'INSUFFICIENT_DATA' : 'AVAILABLE';
    data[name] = result.status === 'fulfilled' ? (truncated ? result.value.slice(0, LIMIT) : result.value) : name === 'readiness' ? null : [];
  });
  return buildDashboard(data, options);
}
