import { EventRequirement, CustomerEvent, Booking } from '../../customer/models/index.js';
import { Opportunity } from '../../external/models/Opportunity.js';
import { Quote } from '../../external/models/Quote.js';
import { CoreBooking } from '../models/CoreBooking.js';
import { FollowUp } from '../../external/models/FollowUp.js';
import { VendorActivity } from '../../external/models/VendorActivity.js';
import { AdminUser } from '../models/AdminUser.js';
import { FinanceLedgerEntry } from '../models/FinanceLedgerEntry.js';
import { workflowError, commandKey, requestHash } from './bookingWorkflow.service.js';
import * as catalog from '../../customer/services/catalog.service.js';
import { normalizeCategory, categoryLabel } from '../../customer/services/planCatalog.js';
import { IdempotencyKey } from '../models/IdempotencyKey.js';
import { notifyVendor } from '../../notifications/notification.service.js';

const can = (actor, permission) => actor.role === 'SUPER_ADMIN' || actor.permissions?.includes(permission);
const stages = { NEW: ['QUALIFIED', 'LOST'], QUALIFIED: ['SOURCING', 'LOST'], SOURCING: ['QUOTED', 'LOST'], QUOTED: ['CONVERTED', 'LOST'], CONVERTED: [], LOST: [] };
export async function crmLead(id, actor, write = false) {
  if (!can(actor, write ? 'leads.update' : 'leads.read')) throw workflowError('FORBIDDEN', 'Lead permission is required.', 403);
  const lead = await EventRequirement.findById(id);
  if (!lead || (!can(actor, 'leads.assign') && lead.crm?.owner !== actor.id)) throw workflowError('LEAD_NOT_FOUND', 'Assigned lead not found.', 404);
  return lead;
}
export async function linkedLeadRecords(lead) {
  const opportunities = await Opportunity.find({ customerRequirement: lead._id }).lean();
  const quotes = await Quote.find({ opportunity: { $in: opportunities.map(op => op._id) } }).lean();
  const projections = await Booking.find({ requirement: lead._id }).select('_id coreBooking').lean();
  const bookings = await CoreBooking.find({ $or: [{ quoteId: { $in: quotes.map(quote => String(quote._id)) } },
    { _id: { $in: projections.map(item => item.coreBooking).filter(Boolean) } }, { customerBookingId: { $in: projections.map(item => item._id) } }] }).lean();
  return { opportunities, quotes, bookings };
}

export async function crmSourcingOptions(id, actor) {
  const lead = await crmLead(id, actor);
  const event = await CustomerEvent.findById(lead.event).lean();
  if (!event || !event.eventDate || !event.guestCount || !event.city) throw workflowError('SOURCE_REQUIREMENTS_MISSING', 'Confirm the event date, guest count and city before sourcing.', 409);
  if (['cancelled', 'completed', 'draft'].includes(event.status)) throw workflowError('SOURCE_EVENT_CLOSED', 'Sourcing requires a confirmed, open event.', 409);
  const location = lead.serviceLocation?.mode === 'custom' ? lead.serviceLocation.toObject() : { ...event.location, city: event.city };
  if (!location.city) throw workflowError('SOURCE_LOCATION_REQUIRED', 'Confirm the service city before sourcing.', 409);
  const options = await catalog.optionsForCategory({ ...event, city: location.city, location }, lead.category);
  return { ...options, options: options.options.filter(option => !option.isDemo && catalog.canSelectForEnquiry(option)) };
}

export async function sourceCrmVendor(id, input, actor) {
  const lead = await crmLead(id, actor, true);
  commandKey(input.idempotencyKey);
  if (!lead.crm?.owner || !['QUALIFIED', 'SOURCING', 'QUOTED'].includes(lead.crm.stage)) throw workflowError('LEAD_NOT_QUALIFIED', 'Qualify and assign this lead before requesting a vendor quote.', 409);
  const options = await crmSourcingOptions(id, actor);
  const option = options.options.find(row => row.id === input.optionId);
  if (!option || normalizeCategory(option.category) !== normalizeCategory(lead.category)) throw workflowError('SOURCE_VENDOR_UNAVAILABLE', 'Choose a currently eligible service for this requirement.', 409);
  const event = await CustomerEvent.findById(lead.event).lean();
  const location = lead.serviceLocation?.mode === 'custom' ? lead.serviceLocation.toObject() : { ...event.location, city: event.city };
  if (!location.city) throw workflowError('SOURCE_LOCATION_REQUIRED', 'Confirm the service location before requesting a quote.', 409);
  const crmSourceKey = requestHash({ requirement: String(lead._id), optionId: option.id, date: event.eventDate, guestCount: event.guestCount, location, preferences: lead.preferences });
  const requestKey = `crm-source:${id}:${input.idempotencyKey}`;
  let admission;
  try { admission = await IdempotencyKey.findOneAndUpdate({ key: requestKey }, { $setOnInsert: { scope: 'CRM_SOURCING', status: 'COMPLETED', result: { crmSourceKey } } }, { upsert: true, new: true }); }
  catch (error) { if (error.code !== 11000) throw error; admission = await IdempotencyKey.findOne({ key: requestKey }); }
  if (admission?.result?.crmSourceKey !== crmSourceKey) throw workflowError('IDEMPOTENCY_CONFLICT', 'This sourcing request identity was already used.', 409);
  let opportunity;
  try { opportunity = await Opportunity.findOneAndUpdate({ crmSourceKey }, { $setOnInsert: {
    crmSourceKey, vendor: option.vendorId, vendorService: option.id.slice(3), customer: event.customer,
    customerEvent: event._id, customerRequirement: lead._id, serviceName: option.packageName || categoryLabel(lead.category),
    eventDate: event.eventDate, serviceLocation: location, guestCount: event.guestCount,
    requiredCapability: JSON.stringify({ preferences: lead.preferences, specialRequirements: lead.specialRequirements }),
    status: 'NEW', action: 'Respond / Quote',
  } }, { upsert: true, new: true, runValidators: true }); }
  catch (error) { if (error.code !== 11000) throw error; opportunity = await Opportunity.findOne({ crmSourceKey }); }
  await notifyVendor({ vendorId: option.vendorId, type: 'ENQUIRY', title: 'Staff-sourced service enquiry',
    message: `${opportunity.serviceName} · ${event.eventDate} · ${event.guestCount} guests`,
    link: '/vendor/enquiries', idempotencyKey: `crm-source:${opportunity._id}`, metadata: { opportunityId: opportunity._id } });
  await VendorActivity.updateOne({ requestKey: `crm-sourced:${opportunity._id}` }, { $setOnInsert: { adminOwner: lead.crm.owner, type: 'ENQUIRY', title: 'Vendor quote requested', description: `${option.vendorName} · ${option.packageName}`, relatedEntity: { entityType: 'Opportunity', entityId: String(opportunity._id) } } }, { upsert: true });
  return opportunity;
}
export async function updateCrmLead(id, input, actor) {
  const lead = await crmLead(id, actor, true);
  commandKey(input.idempotencyKey);
  const hash = requestHash(input);
  const prior = lead.crm?.history?.find(item => item.key === input.idempotencyKey);
  if (prior) {
    if (prior.hash !== hash) throw workflowError('IDEMPOTENCY_CONFLICT', 'Request identity was reused.', 409);
    return lead;
  }
  if (Number(input.expectedVersion) !== lead.__v) throw workflowError('LEAD_VERSION_CONFLICT', 'Refresh this lead before editing.', 409);
  const crm = lead.crm?.toObject?.() || lead.crm || {};
  const owner = input.owner ?? crm.owner;
  if (input.owner != null && input.owner !== crm.owner) {
    if (!can(actor, 'leads.assign')) throw workflowError('FORBIDDEN', 'Lead assignment permission is required.', 403);
    const staff = await AdminUser.findOne({ _id: input.owner, status: 'ACTIVE' }).lean();
    if (!staff || (staff.role !== 'SUPER_ADMIN' && !staff.permissions?.includes('leads.update'))) throw workflowError('INVALID_LEAD_OWNER', 'Choose an active sales owner.');
  }
  const current = crm.stage || 'NEW', next = input.stage || current;
  if (next !== current && !stages[current]?.includes(next)) throw workflowError('INVALID_PIPELINE_TRANSITION', 'This pipeline transition is not available.', 409);
  if (next !== 'NEW' && !owner) throw workflowError('LEAD_OWNER_REQUIRED', 'Assign an owner before qualification.');
  const records = await linkedLeadRecords(lead);
  if (next === 'SOURCING' && !records.opportunities.length) throw workflowError('VENDOR_SOURCING_REQUIRED', 'Create a linked vendor enquiry before moving to sourcing.', 409);
  if (next === 'QUOTED' && !records.quotes.some(quote => ['SUBMITTED', 'APPROVED'].includes(quote.status))) throw workflowError('LINKED_QUOTE_REQUIRED', 'A linked submitted quote is required.', 409);
  if (next === 'CONVERTED' && !records.bookings.some(booking => booking.bookingStatus === 'CONFIRMED' && booking.paymentStatus === 'PAYMENT_VERIFIED')) throw workflowError('VERIFIED_BOOKING_REQUIRED', 'Conversion requires a linked confirmed booking with verified payment.', 409);
  if (!String(input.notes || '').trim() || (next === 'LOST' && !String(input.lostReason || '').trim())) throw workflowError('PIPELINE_REASON_REQUIRED', 'Record activity notes and a lost reason when applicable.');
  const reportedValue = input.reportedValue == null ? crm.reportedValue : Number(input.reportedValue);
  if (reportedValue != null && (!Number.isFinite(reportedValue) || reportedValue < 0)) throw workflowError('INVALID_LEAD_VALUE', 'Reported lead value must be nonnegative.');
  const changed = await EventRequirement.findOneAndUpdate({ _id: id, __v: lead.__v }, { $set: { 'crm.owner': owner, 'crm.stage': next,
    'crm.reportedValue': reportedValue, 'crm.lostReason': next === 'LOST' ? input.lostReason : crm.lostReason },
    $push: { 'crm.history': { key: input.idempotencyKey, hash, actor: actor.id, at: new Date(), from: current, to: next, notes: input.notes } }, $inc: { __v: 1 } }, { new: true });
  if (!changed) throw workflowError('LEAD_VERSION_CONFLICT', 'The lead changed. Refresh and retry.', 409);
  return changed;
}
export async function createStaffFollowUp(id, input, actor) {
  const lead = await crmLead(id, actor, true);
  commandKey(input.idempotencyKey);
  const dueDate = new Date(input.dueDate);
  if (!lead.crm?.owner || !Number.isFinite(dueDate.getTime()) || !String(input.title || '').trim()) throw workflowError('FOLLOW_UP_DETAILS_REQUIRED', 'Assign the lead owner, action and due date.');
  const hash = requestHash(input), filter = { scope: 'STAFF', requirement: lead._id, requestKey: input.idempotencyKey };
  const followUp = await FollowUp.findOneAndUpdate(filter, { $setOnInsert: { ...filter, requestHash: hash, owner: lead.crm.owner,
    title: String(input.title).slice(0, 200), description: String(input.notes || '').slice(0, 2000), dueDate,
    history: [{ actor: actor.id, at: new Date(), action: 'SCHEDULED', notes: input.notes }] } }, { upsert: true, new: true });
  if (followUp.requestHash !== hash) throw workflowError('IDEMPOTENCY_CONFLICT', 'Follow-up request identity was reused.', 409);
  return followUp;
}
export async function completeStaffFollowUp(id, input, actor) {
  const followUp = await FollowUp.findOne({ _id: id, scope: 'STAFF' });
  if (!followUp) throw workflowError('FOLLOW_UP_NOT_FOUND', 'Follow-up not found.', 404);
  await crmLead(followUp.requirement, actor, true);
  if (!String(input.notes || '').trim()) throw workflowError('FOLLOW_UP_NOTES_REQUIRED', 'Record the outcome.');
  return FollowUp.findOneAndUpdate({ _id: id, status: { $in: ['PENDING', 'OVERDUE'] } }, { $set: { status: 'COMPLETED' },
    $push: { history: { actor: actor.id, at: new Date(), action: 'COMPLETED', notes: input.notes } } }, { new: true });
}
export async function remindStaffFollowUps() {
  const rows = await FollowUp.find({ scope: 'STAFF', status: { $in: ['PENDING', 'OVERDUE'] }, dueDate: { $lt: new Date() } }).limit(100).lean();
  for (const row of rows) {
    await FollowUp.updateOne({ _id: row._id, status: 'PENDING' }, { $set: { status: 'OVERDUE' } });
    await VendorActivity.updateOne({ requestKey: `staff-followup:${row._id}` }, { $setOnInsert: { adminOwner: row.owner, type: 'REMINDER', title: `Overdue: ${row.title}`,
      description: row.description, priority: 'HIGH', relatedEntity: { entityType: 'FollowUp', entityId: String(row._id) } } }, { upsert: true });
  }
}
export async function revenueCrmReport(actor, periodDays = 30) {
  if (!can(actor, 'leads.read')) throw workflowError('FORBIDDEN', 'Lead permission is required.', 403);
  const days = Number(periodDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw workflowError('INVALID_REPORT_PERIOD', 'Use a reporting period between 1 and 365 days.');
  const end = new Date(), start = new Date(end.getTime() - days * 86400000);
  const requirements = await EventRequirement.find({ createdAt: { $gte: start, $lt: end }, ...(!can(actor, 'leads.assign') ? { 'crm.owner': actor.id } : {}) }).limit(1001).lean();
  if (requirements.length > 1000) return { available: false, reason: 'REPORT_LIMIT_EXCEEDED', start, end };
  const result = { available: true, start, end, denominator: requirements.length, convertedLeads: 0, reportedLeadValue: 0, contractedValue: 0,
    verifiedCollections: 0, refunds: 0, settlementReleases: 0, contractedPlatformFees: 0, recognizedPlatformRevenue: null,
    recognitionUnavailableReason: 'APPROVED_ACCOUNTING_RECOGNITION_POLICY_REQUIRED' };
  const counted = new Set();
  for (const lead of requirements) {
    result.reportedLeadValue += Number(lead.crm?.reportedValue || 0);
    const { bookings } = await linkedLeadRecords(lead);
    if (bookings.some(booking => booking.bookingStatus === 'CONFIRMED' && booking.paymentStatus === 'PAYMENT_VERIFIED')) result.convertedLeads++;
    for (const booking of bookings) {
      if (counted.has(String(booking._id))) continue;
      counted.add(String(booking._id));
      if (booking.bookingStatus === 'CONFIRMED') result.contractedValue += booking.totalAmount;
      if (['PAYMENT_VERIFIED', 'REFUNDED'].includes(booking.paymentStatus)) result.verifiedCollections += Number(booking.paymentSummary?.paidAmount || 0);
      const ledger = await FinanceLedgerEntry.find({ booking: booking._id, type: { $in: ['REFUND', 'SETTLEMENT_RELEASE'] } }).lean();
      result.refunds += ledger.filter(row => row.type === 'REFUND').reduce((sum, row) => sum + row.amount, 0);
      result.settlementReleases += ledger.filter(row => row.type === 'SETTLEMENT_RELEASE').reduce((sum, row) => sum + row.amount, 0);
      result.contractedPlatformFees += Number(booking.taxSummary?.platformFee || 0);
    }
  }
  return { ...result, conversionRate: result.denominator ? result.convertedLeads / result.denominator : null,
    definitions: 'Lead cohort uses requirement creation in [start,end). Linked contract and cash totals are lifetime-to-report-time for that cohort. Reported lead value is staff-entered. Contracted platform fees are not recognized revenue. Revenue recognition is unavailable until an approved accounting policy is connected.' };
}
