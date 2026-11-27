import { CustomerEvent, EventRequirement } from '../customer/models/index.js';
import { Quote } from '../external/models/Quote.js';
import { Opportunity } from '../external/models/Opportunity.js';
import { VendorAgreement } from './models.js';
import { isQuoteExpired } from '../external/services/quoteStateMachine.service.js';
import { normalizeCategory } from '../customer/services/planCatalog.js';
import { proposalError } from './utils.js';

/** A customer budget/catalogue estimate is not a vendor-supplied event price. */
export async function requireVendorPriceForPdf(eventId, { now = new Date() } = {}) {
  const event = await CustomerEvent.findById(eventId).select('_id customer').lean();
  if (!event) throw proposalError('EVENT_NOT_FOUND', 'Event not found.', 404);
  const [requirements, agreements, opportunities] = await Promise.all([
    EventRequirement.find({ event: event._id, status: { $nin: ['missing', 'customer_provided'] } }).select('category').lean(),
    VendorAgreement.find({ event: event._id, customer: event.customer, status: { $nin: ['REJECTED','EXPIRED','SUPERSEDED'] } }).select('quote vendor').lean(),
    Opportunity.find({ customerEvent: event._id, customer: event.customer }).select('_id vendor').lean(),
  ]);
  const chosen = new Set(requirements.map(r => normalizeCategory(r.category)).filter(Boolean));
  const candidates = await Quote.find({ customer: event.customer, status: { $in: ['SUBMITTED','APPROVED'] }, $or: [
    { _id: { $in: agreements.map(a => a.quote) } }, { opportunity: { $in: opportunities.map(o => o._id) } },
  ] }).select('_id vendor opportunity category serviceName status validUntil pricingBreakdown.totalAmount').lean();
  const priced = candidates.some(q => {
    const linked = agreements.some(a => String(a.quote) === String(q._id) && String(a.vendor) === String(q.vendor))
      || opportunities.some(o => String(o._id) === String(q.opportunity) && String(o.vendor) === String(q.vendor));
    return linked && chosen.has(normalizeCategory(q.category || q.serviceName)) && !isQuoteExpired(q, now)
      && typeof q.pricingBreakdown?.totalAmount === 'number' && Number.isFinite(q.pricingBreakdown.totalAmount) && q.pricingBreakdown.totalAmount > 0;
  });
  if (!priced) throw proposalError('VENDOR_PRICE_REQUIRED', 'Your PDF will be available once a vendor submits a price for this event.', 409);
}
