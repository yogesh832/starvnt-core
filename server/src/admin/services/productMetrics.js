import { ProductObservation, CustomerFeedback } from '../../common/productObservability.js';
import { CustomerEvent, EventRequirement, EventHistory, Booking } from '../../customer/models/index.js';
import { VendorOrganization } from '../../external/models/VendorOrganization.js';
import { Quote } from '../../external/models/Quote.js';
import { CoreBooking } from '../models/CoreBooking.js';
import { NotificationPreference } from '../../notifications/preferences.models.js';
import { progressOf } from '../../customer/services/understanding.js';

const rate = (numerator, denominator) => ({ numerator, denominator, percent: denominator ? Math.round(numerator / denominator * 10000) / 100 : null });
const average = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
export async function productMetrics() {
  const [events, requirements, history, bookings, vendors, quotes, core, observations, feedback, policies] = await Promise.all([
    CustomerEvent.find({ status: { $ne: 'cancelled' } }).lean(), EventRequirement.find().lean(), EventHistory.find({ action: { $in: ['event_confirmed', 'quote_accepted', 'option_selected', 'requirement_confirmed'] } }).lean(), Booking.find({ status: 'confirmed' }).lean(), VendorOrganization.find().lean(), Quote.find({ status: { $ne: 'DRAFT' } }).select('_id').lean(), CoreBooking.find({ bookingStatus: 'CONFIRMED' }).select('quoteId').lean(), ProductObservation.find().lean(), CustomerFeedback.find().lean(), NotificationPreference.find().lean(),
  ]);
  const requirementsByEvent = new Map();
  for (const row of requirements) { const key = String(row.event); if (!requirementsByEvent.has(key)) requirementsByEvent.set(key, []); requirementsByEvent.get(key).push(row); }
  const completedPlans = events.filter(e => progressOf(e, requirementsByEvent.get(String(e._id)) || []).progressPercent === 100).length;
  const eventMap = new Map(events.map(e => [String(e._id), e]));
  const planningTimes = history.filter(h => h.action === 'event_confirmed' && eventMap.has(String(h.event))).map(h => new Date(h.createdAt) - new Date(eventMap.get(String(h.event)).createdAt));
  const customerCounts = new Map();
  for (const event of events) customerCounts.set(String(event.customer), (customerCounts.get(String(event.customer)) || 0) + 1);
  const completedTasks = bookings.filter(b => b.completedAt && eventMap.get(String(b.event))?.eventDate);
  const onTime = completedTasks.filter(b => new Date(b.completedAt).getTime() < Date.parse(`${eventMap.get(String(b.event)).eventDate}T18:30:00Z`)).length;
  const schedule = observations.filter(o => /^schedule_(create|update)$/.test(o.action));
  const notificationEvents = observations.filter(o => o.action === 'notification');
  const reviews = vendors.flatMap(v => (v.activationHistory || []).filter(h => h.action === 'APPROVE' && v.activationReview?.requestedAt).map(h => new Date(h.at) - new Date(v.activationReview.requestedAt))).filter(n => n >= 0);
  const eventFeedback = feedback.filter(f => f.kind === 'EVENT');
  const usefulness = feedback.filter(f => f.kind === 'NOTIFICATION');
  const support = observations.filter(o => o.action === 'support_link');
  const supportResolved = support.filter(o => ['OPENED', 'FAILED'].includes(o.outcome));
  const sync = observations.filter(o => o.action === 'admin_availability_read');
  return {
    generatedAt: new Date(), observedSince: observations.length ? observations.reduce((earliest, o) => o.createdAt < earliest ? o.createdAt : earliest, observations[0].createdAt) : null,
    eventPlanCompletion: rate(completedPlans, events.length), meanPlanningTimeMs: average(planningTimes), pendingDecisionsResolved: history.filter(h => h.action !== 'event_confirmed').length,
    quoteToBookingConversion: rate(new Set(core.map(b => String(b.quoteId)).filter(id => quotes.some(q => String(q._id) === id))).size, quotes.length),
    onTimeTaskCompletion: rate(onTime, completedTasks.length), notificationUsefulness: { meanScore: average(usefulness.map(f => f.score)), responses: usefulness.length }, notificationOptOut: rate(policies.filter(p => p.channels?.PUSH === false || p.disabledTypes?.length).length, policies.length),
    customerSatisfaction: { meanScore: average(eventFeedback.map(f => f.score)), responses: eventFeedback.length }, repeatEventUsage: rate([...customerCounts.values()].filter(n => n > 1).length, customerCounts.size),
    availabilityConflictRate: rate(schedule.filter(o => o.outcome === 'SCHEDULE_CONFLICT').length, schedule.length), duplicateBlockRequestRate: rate(schedule.filter(o => o.outcome === 'DUPLICATE').length, schedule.length), duplicateNotificationRequestRate: rate(notificationEvents.filter(o => o.outcome === 'DUPLICATE').length, notificationEvents.length),
    vendorAdminReadReliability: rate(sync.filter(o => o.outcome === 'SUCCESS').length, sync.length), meanProfileReviewTurnaroundMs: average(reviews), profileActivationErrorRate: rate(observations.filter(o => o.action === 'activation_review' && o.outcome === 'FAILED').length, observations.filter(o => o.action === 'activation_review').length),
    supportLinkReportedOpenRate: rate(supportResolved.filter(o => o.outcome === 'OPENED').length, supportResolved.length), supportLinkOpenRequests: support.filter(o => o.outcome === 'OPEN_REQUESTED').length,
    definitions: { planCompletion: 'Confirmed/customer-provided essentials divided by template essentials; Aura suggestions excluded.', planningTime: 'Event creation to explicit event-plan confirmation.', decisionsResolved: 'Recorded quote acceptance, option selection and explicit inferred-requirement confirmations.', onTimeTasks: 'Verified completed booking tasks finished by the end of the event date in Asia/Kolkata.', support: 'Device-reported link opening only; not message delivery or a connected call. Browser requests alone do not establish success.', reliability: 'Observed Admin reads; same underlying records are used by Vendor and Admin.', coverage: 'Rates with no denominator are null. Observation-based rates begin when this release records observations; historical duplicates and provider delivery are not inferred.' },
  };
}
