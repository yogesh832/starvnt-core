import { Opportunity } from '../models/Opportunity.js';
import { Quote } from '../models/Quote.js';
import { VendorMessageThread } from '../models/VendorMessageThread.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RECORDS = 2000;

const idOf = (value) => {
  if (value == null) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
};

const dateOf = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
};

export function firstVendorResponse({ opportunities, quotes, threads, now, attributionWindowDays = null }) {
  const opportunityById = new Map(opportunities.map((item) => [idOf(item._id || item.id), item]));
  const firstAtByOpportunity = new Map();
  const quoteOpportunity = new Map();

  const recordResponse = (opportunityId, at) => {
    const opportunity = opportunityById.get(opportunityId);
    const createdAt = dateOf(opportunity?.createdAt);
    const responseAt = dateOf(at);
    if (!createdAt || !responseAt || responseAt < createdAt || responseAt > now) return;
    if (attributionWindowDays != null && responseAt >= new Date(createdAt.getTime() + attributionWindowDays * DAY_MS)) return;
    const previous = firstAtByOpportunity.get(opportunityId);
    if (!previous || responseAt < previous) firstAtByOpportunity.set(opportunityId, responseAt);
  };

  for (const opportunity of opportunities) {
    const opportunityId = idOf(opportunity._id || opportunity.id);
    const createdAt = dateOf(opportunity.createdAt);
    const elapsedMs = opportunity.slaResponseTimeMs == null ? NaN : Number(opportunity.slaResponseTimeMs);
    if (createdAt && Number.isFinite(elapsedMs) && elapsedMs >= 0) recordResponse(opportunityId, new Date(createdAt.getTime() + elapsedMs));
  }

  for (const quote of quotes) {
    const opportunityId = idOf(quote.opportunity);
    if (!opportunityById.has(opportunityId)) continue;
    quoteOpportunity.set(idOf(quote._id || quote.id), opportunityId);
    const firstSubmission = (Array.isArray(quote.history) ? quote.history : [])
      .filter((change) => String(change.toStatus || '').toUpperCase() === 'SUBMITTED')
      .map((change) => dateOf(change.timestamp))
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    if (firstSubmission) recordResponse(opportunityId, firstSubmission);
  }

  for (const thread of threads) {
    const opportunityId = idOf(thread.opportunity) || quoteOpportunity.get(idOf(thread.quote));
    if (!opportunityById.has(opportunityId)) continue;
    for (const message of Array.isArray(thread.messages) ? thread.messages : []) {
      if (String(message.sender || '').toUpperCase() === 'VENDOR') recordResponse(opportunityId, message.createdAt);
    }
  }

  return [...firstAtByOpportunity.entries()].map(([opportunityId, responseAt]) => {
    const createdAt = dateOf(opportunityById.get(opportunityId)?.createdAt);
    return responseAt.getTime() - createdAt.getTime();
  });
}

export function summarizeVendorFirstResponses({ opportunities = [], quotes = [], threads = [], periodDays = 30, now = new Date(), complete = true, eligibleCount }) {
  const nowDate = dateOf(now) || new Date();
  const periodEnd = new Date(nowDate.getTime() - 30 * DAY_MS);
  const periodStart = new Date(periodEnd.getTime() - Number(periodDays) * DAY_MS);
  const cohort = opportunities.filter((item) => {
    const createdAt = dateOf(item.createdAt);
    return createdAt && createdAt >= periodStart && createdAt < periodEnd;
  });
  const samples = firstVendorResponse({ opportunities: cohort, quotes, threads, now: nowDate, attributionWindowDays: 30 });
  const averageFirstResponseMs = complete && samples.length
    ? Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length)
    : null;
  return {
    periodDays: Number(periodDays),
    attributionWindowDays: 30,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    eligibleEnquiries: Number.isFinite(eligibleCount) ? eligibleCount : cohort.length,
    respondedEnquiries: complete ? samples.length : null,
    averageFirstResponseMs,
    complete,
  };
}

export async function getVendorFirstResponseMetrics(vendorId, { periodDays = 30, now = new Date() } = {}) {
  const periodEnd = new Date(now.getTime() - 30 * DAY_MS);
  const periodStart = new Date(periodEnd.getTime() - periodDays * DAY_MS);
  const opportunityFilter = { vendor: vendorId, createdAt: { $gte: periodStart, $lt: periodEnd } };
  const totalEnquiries = await Opportunity.countDocuments(opportunityFilter);
  const opportunities = await Opportunity.find(opportunityFilter)
    .select('_id createdAt slaResponseTimeMs')
    .sort({ createdAt: -1 })
    .limit(MAX_RECORDS)
    .lean();

  if (totalEnquiries > MAX_RECORDS) {
    return summarizeVendorFirstResponses({ opportunities, periodDays, now, complete: false, eligibleCount: totalEnquiries });
  }

  const opportunityIds = opportunities.map((item) => item._id);
  if (!opportunityIds.length) return summarizeVendorFirstResponses({ opportunities, periodDays, now });

  const quotes = await Quote.find({ vendor: vendorId, opportunity: { $in: opportunityIds } })
    .select('_id opportunity history')
    .limit(MAX_RECORDS)
    .lean();
  const quoteIds = quotes.map((item) => item._id);
  const threadFilter = {
    vendor: vendorId,
    status: { $ne: 'BLOCKED' },
    $or: [
      { opportunity: { $in: opportunityIds } },
      ...(quoteIds.length ? [{ quote: { $in: quoteIds } }] : []),
    ],
  };
  const threads = await VendorMessageThread.find(threadFilter)
    .select({ opportunity: 1, quote: 1, 'messages.sender': 1, 'messages.createdAt': 1 })
    .limit(MAX_RECORDS)
    .lean();

  const complete = quotes.length < MAX_RECORDS && threads.length < MAX_RECORDS;
  return summarizeVendorFirstResponses({ opportunities, quotes, threads, periodDays, now, complete });
}
