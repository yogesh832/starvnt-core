import crypto from 'node:crypto';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { CustomerEvent } from '../customer/models/index.js';
import { VendorBlockout } from '../external/models/VendorBlockout.js';
import { VendorReview } from '../external/models/VendorReview.js';
import { ExternalUser } from '../external/models/ExternalUser.js';
import { VendorOrganization } from '../external/models/VendorOrganization.js';
import { Opportunity } from '../external/models/Opportunity.js';
import { CustomerConsent, PrivacyRequest } from '../foundation/models.js';
import { hasPermission, communicationAllowed, foundationError as fail } from '../foundation/consent.service.js';
import { verifiedContact, identityDigest } from '../foundation/identity.service.js';
import { CustomerInterests, ReferralCode, ReferralAttribution, LoyaltyRule, LoyaltyAward, GrowthCampaign, CampaignDelivery, CampaignFrequency } from './models.js';
import { requestKey, text, digest } from './feedback.service.js';
import { notifyCustomer } from '../notifications/notification.service.js';
import { withVendorSchedule } from '../external/services/scheduleLock.js';

export async function vendorDirectory(vendor) {
  const [core, external, reviews] = await Promise.all([
    CoreBooking.find({ vendorId: vendor }).select('_id customerId customerName serviceName eventDate bookingStatus executionStatus').sort({ createdAt: -1 }).limit(501).lean(),
    VendorBlockout.find({ vendor, recordType: 'EXTERNAL_COMMITMENT' }).select('_id date external externalBooking.lifecycle externalBooking.acquisitionChannel').sort({ createdAt: -1 }).limit(501).lean(),
    VendorReview.find({ vendor }).select('_id customer booking rating status source feedbackPermissions').limit(1000).lean(),
  ]);
  // Only platform-owned identities or an explicitly claimed, permissioned review link records.
  const rows = new Map();
  const add = (key, item) => { const r = rows.get(key) || { key, customerId: item.customerId || null, name: item.name, nameVerification: 'SELF_REPORTED', sources: [], bookings: [], reviews: [] }; if (!r.sources.includes(item.source)) r.sources.push(item.source); r.bookings.push(item); rows.set(key, r); };
  for (const b of core.slice(0, 500)) add(`CUSTOMER:${b.customerId}`, { booking: b._id, customerId: b.customerId, name: b.customerName || 'Customer', source: 'STARVNT', service: b.serviceName, date: b.eventDate, status: b.executionStatus === 'COMPLETION_VERIFIED' ? 'COMPLETED' : b.bookingStatus });
  for (const b of external.slice(0, 500)) {
    const linked = reviews.find(r => String(r.booking) === String(b._id) && r.customer && r.feedbackPermissions?.ecosystem && !r.feedbackPermissions?.withdrawnAt && !r.feedbackPermissions?.deletionRequestedAt);
    const permitted = linked && await hasPermission(linked.customer, 'ECOSYSTEM');
    add(permitted ? `CUSTOMER:${linked.customer}` : `PRIVATE:${b._id}`, { booking: b._id, customerId: permitted ? linked.customer : null, name: b.external?.customerName || 'Private booking contact', source: 'VENDOR_PRIVATE', date: b.date, status: b.externalBooking?.lifecycle || 'CONFIRMED', acquisitionChannel: b.externalBooking?.acquisitionChannel || 'LEGACY_UNKNOWN' });
  }
  for (const r of rows.values()) {
    r.reviews = reviews.filter(review => r.bookings.some(b => String(b.booking) === String(review.booking))).map(review => ({ _id: review._id, rating: review.rating, status: review.status, source: review.source }));
    r.repeatCustomer = Boolean(r.customerId && r.bookings.length > 1);
    r.campaignEligible = Boolean(r.customerId && await communicationAllowed(r.customerId, { purpose: 'MARKETING', channel: 'IN_APP', vendorId: vendor }));
  }
  return { customers: [...rows.values()], truncated: core.length > 500 || external.length > 500, limitPerSource: 500, contactsExported: false };
}
export async function customerRelationship(customer) {
  const [reviews, consents, interests, referral] = await Promise.all([
    VendorReview.find({ customer }).select('_id vendor booking experience source rating reviewText feedbackPermissions createdAt updatedAt').lean(),
    CustomerConsent.find({ customer }).select('-history').lean(), CustomerInterests.findOne({ customer }).select('-history').lean(), ReferralAttribution.findOne({ customer }).select('code createdAt').lean(),
  ]);
  const external = await Promise.all(reviews.filter(r => r.source === 'VENDOR_PRIVATE' && r.feedbackPermissions?.ecosystem && !r.feedbackPermissions?.withdrawnAt && !r.feedbackPermissions?.deletionRequestedAt).map(async r => {
    if (!await hasPermission(customer, 'ECOSYSTEM')) return null;
    const row = await VendorBlockout.findOne({ _id: r.booking, vendor: r.vendor }).select('_id vendor date externalBooking.eventName externalBooking.lifecycle externalBooking.lineItems externalBooking.acquisitionChannel').lean();
    return row && { _id: row._id, vendor: row.vendor, date: row.date, eventName: row.externalBooking?.eventName, lifecycle: row.externalBooking?.lifecycle, services: row.externalBooking?.lineItems?.map(l => ({ name: l.name, quantity: l.quantity })), source: 'VENDOR_PRIVATE', acquisitionChannel: row.externalBooking?.acquisitionChannel };
  }));
  const coreVendors = await CoreBooking.distinct('vendorId', { customerId: customer });
  const vendors = await VendorOrganization.find({ _id: { $in: [...coreVendors, ...external.filter(Boolean).map(r => r.vendor)] } }).select('_id businessName').lean();
  return { externalBookings: external.filter(Boolean), vendors, reviews, consents, interests, referral, privacy: await PrivacyRequest.findOne({ customer }).select('status requestedAt retainedCategories retainedUntil').lean() };
}
export async function saveInterests(customer, input) {
  if (!await hasPermission(customer, 'PERSONALIZATION')) throw fail('PERSONALIZATION_REQUIRED', 'Enable personalized recommendations before saving optional interests.', 403);
  if (!Array.isArray(input.interests) || input.interests.length > 10 || !['NONE', 'IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'].includes(input.preferredChannel)) throw fail('INVALID_INTERESTS', 'Choose up to ten interests and a communication preference.');
  const interests = input.interests.map(i => ({ eventType: text(i.eventType, 80, true), city: text(i.city || '', 80), month: text(i.month || '', 7) }));
  if (interests.some(i => i.month && !/^20\d\d-(0[1-9]|1[0-2])$/.test(i.month))) throw fail('INVALID_MONTH', 'Use a valid event month.');
  const key = requestKey(input.idempotencyKey), hash = digest(JSON.stringify({ interests, preferredChannel: input.preferredChannel, revision: input.revision }));
  const old = await CustomerInterests.findOne({ customer });
  const prior = old?.history.find(h => h.key === key);
  if (prior) { if (prior.hash !== hash) throw fail('REQUEST_CHANGED', 'Request key reused.', 409); return old; }
  if (!Number.isInteger(input.revision) || input.revision !== (old?.revision || 0)) throw fail('STALE_REVISION', 'Refresh interests before saving.', 409);
  try {
    const result = await CustomerInterests.findOneAndUpdate({ customer, revision: input.revision }, { $set: { interests, preferredChannel: input.preferredChannel }, $inc: { revision: 1 }, $push: { history: { actor: String(customer), action: 'PREFERENCES_SAVED', key, hash } } }, { upsert: !old, new: true });
    if (!result) throw fail('STALE_REVISION', 'Refresh interests before saving.', 409); return result;
  } catch (e) { if (e.code === 11000) throw fail('STALE_REVISION', 'Refresh interests before saving.', 409); throw e; }
}
async function verifiedCustomer(customer) {
  const user = await ExternalUser.findById(customer);
  if (!user || user.accountType !== 'CUSTOMER' || !verifiedContact(user, 'PHONE') || !await hasPermission(customer, 'ECOSYSTEM')) throw fail('VERIFIED_PERMISSION_REQUIRED', 'A verified customer mobile and ecosystem permission are required.', 403);
  return user;
}
export async function referralCode(customer) {
  await verifiedCustomer(customer);
  try { return await ReferralCode.findOneAndUpdate({ owner: customer }, { $setOnInsert: { code: crypto.randomBytes(12).toString('base64url') } }, { upsert: true, new: true }); }
  catch (e) { if (e.code === 11000) return ReferralCode.findOne({ owner: customer }); throw e; }
}
export async function attributeReferral(customer, code) {
  const user = await verifiedCustomer(customer), referral = await ReferralCode.findOne({ code: text(code, 64, true) });
  if (!referral || String(referral.owner) === String(customer)) throw fail('INVALID_REFERRAL', 'This referral cannot be applied.');
  const owner = await verifiedCustomer(referral.owner);
  if (identityDigest('PHONE', user.phone) === identityDigest('PHONE', owner.phone)) throw fail('SELF_REFERRAL', 'Self-referrals cannot receive attribution.');
  if (await CoreBooking.exists({ customerId: customer, bookingStatus: 'CONFIRMED' })) throw fail('REFERRAL_TOO_LATE', 'Referral attribution must precede the first confirmed booking.', 409);
  const old = await ReferralAttribution.findOneAndUpdate({ customer }, { $setOnInsert: { referrer: referral.owner, code: referral.code, history: [{ actor: String(customer), action: 'ATTRIBUTED' }] } }, { upsert: true, new: true });
  if (old.code !== referral.code) throw fail('REFERRAL_ALREADY_SET', 'Referral attribution is already recorded.', 409);
  return { code: old.code, createdAt: old.createdAt };
}
export async function reconcileLoyalty(customer) {
  await verifiedCustomer(customer);
  const bookings = await CoreBooking.find({ customerId: customer }).select('_id bookingStatus executionStatus paymentStatus totalAmount').lean();
  const eligible = bookings.filter(b => b.bookingStatus === 'CONFIRMED' && b.executionStatus === 'COMPLETION_VERIFIED' && b.paymentStatus === 'PAYMENT_VERIFIED');
  const active = await LoyaltyRule.findOne({ active: true }).sort({ createdAt: -1 }).lean();
  for (const b of eligible) {
    if (active) await LoyaltyAward.findOneAndUpdate({ booking: b._id }, { $setOnInsert: { customer, ruleVersion: active.version, points: active.pointsPerCompletion, status: 'EARNED', history: [{ actor: 'CORE_RECONCILIATION', action: 'EARNED' }] } }, { upsert: true });
  }
  await LoyaltyAward.updateMany({ customer, booking: { $nin: eligible.map(b => b._id) }, status: 'EARNED' }, { $set: { status: 'REVERSED' }, $push: { history: { actor: 'CORE_RECONCILIATION', action: 'REVERSED', reason: 'Core booking no longer eligible' } } });
  const ledger = await LoyaltyAward.find({ customer }).select('-history').lean();
  return { activeRule: active && { version: active.version, pointsPerCompletion: active.pointsPerCompletion }, points: ledger.filter(a => a.status === 'EARNED').reduce((n, a) => n + a.points, 0), ledger, cashValue: false, externalBookingsEligible: false };
}
export async function growthOverview(customer) {
  const [bookings, referrals, profile] = await Promise.all([
    CoreBooking.find({ customerId: customer }).select('_id vendorId serviceName bookingStatus executionStatus eventDate').lean(),
    ReferralAttribution.find({ referrer: customer }).select('customer createdAt').lean(), CustomerInterests.findOne({ customer }).select('-history').lean(),
  ]);
  const personal = await hasPermission(customer, 'PERSONALIZATION');
  const completed = bookings.filter(b => b.bookingStatus === 'CONFIRMED' && b.executionStatus === 'COMPLETION_VERIFIED');
  const conversions = (await Promise.all(referrals.map(r => CoreBooking.exists({ customerId: r.customer, bookingStatus: 'CONFIRMED', paymentStatus: 'PAYMENT_VERIFIED', createdAt: { $gte: r.createdAt } })))).filter(Boolean);
  const delivered = await CampaignDelivery.find({ customer, state: 'DELIVERED' }).select('_id campaign helpful').sort({ createdAt: -1 }).limit(20).lean();
  const campaigns = await GrowthCampaign.find({ _id: { $in: delivered.map(d => d.campaign) } }).select('_id title body').lean();
  return { campaigns: delivered.map(d => ({ ...d, content: campaigns.find(c => String(c._id) === String(d.campaign)) })), completedBookings: completed.length, repeatBookings: Math.max(0, completed.length - 1), referrals: { attributed: referrals.length, convertedCustomers: conversions.length, rewardsAutomatic: false },
    suggestions: personal ? completed.map(b => ({ sourceBooking: b._id, service: b.serviceName, actionUrl: '/customer/events/new', reason: 'Plan a new event using a service you previously received.' })).slice(0, 5) : [],
    interests: personal ? profile : null, personalizationEnabled: personal, automatedMessages: false };
}
export async function createCampaign(vendor, actor, input) {
  const title = text(input.title, 140, true), body = text(input.body, 500, true), key = requestKey(input.idempotencyKey), hash = digest(JSON.stringify({ title, body }));
  const old = await GrowthCampaign.findOneAndUpdate({ vendor, requestKey: key }, { $setOnInsert: { title, body, requestHash: hash, history: [{ actor: String(actor), action: 'DRAFT_CREATED' }] } }, { upsert: true, new: true });
  if (old.requestHash !== hash) throw fail('REQUEST_CHANGED', 'Request key reused.', 409); return old;
}
export async function publishCampaign(vendor, actor, id, input) {
  return withVendorSchedule(vendor, async () => {
    const campaign = await GrowthCampaign.findOne({ _id: id, vendor });
    if (!campaign) throw fail('CAMPAIGN_NOT_FOUND', 'Campaign not found.', 404);
    const key = requestKey(input.idempotencyKey);
    if (campaign.state === 'STOPPED') throw fail('CAMPAIGN_STOPPED', 'This campaign was stopped.', 409);
    if (campaign.state === 'DRAFT') {
      if (input.revision !== campaign.revision) throw fail('STALE_REVISION', 'Refresh campaign before publishing.', 409);
      campaign.state = 'PUBLISHED'; campaign.revision++; campaign.history.push({ actor: String(actor), action: 'PUBLISHED', key }); await campaign.save();
    }
    const directory = await vendorDirectory(vendor);
    const candidates = directory.customers.filter(r => r.campaignEligible).map(r => r.customerId);
    for (const customer of candidates) {
      if (await CampaignDelivery.exists({ campaign: id, customer })) continue;
      if (!await communicationAllowed(customer, { purpose: 'MARKETING', channel: 'IN_APP', vendorId: vendor })) continue;
      const now = new Date(), cutoff = new Date(Date.now() - 7 * 86400000);
      let allowed;
      try { allowed = await CampaignFrequency.findOneAndUpdate({ customer, $or: [{ lastSentAt: { $lte: cutoff } }, { campaign: id }] }, { $set: { lastSentAt: now, campaign: id } }, { new: true, upsert: true }); }
      catch (e) { if (e.code !== 11000) throw e; }
      if (!allowed) { await CampaignDelivery.create({ campaign: id, customer, state: 'SKIPPED', reason: 'FREQUENCY_LIMIT' }); continue; }
      const outcome = await notifyCustomer({ customerId: customer, type: 'campaign', title: campaign.title, body: campaign.body, channel: 'IN_APP', purpose: 'MARKETING', vendorId: vendor, idempotencyKey: `growth:${id}:${customer}`, actionUrl: '/customer/events/new' });
      await CampaignDelivery.create({ campaign: id, customer, state: outcome.skipped ? 'SKIPPED' : 'DELIVERED', reason: outcome.reason || '' });
    }
    return { campaign, delivered: await CampaignDelivery.countDocuments({ campaign: id, state: 'DELIVERED' }), skipped: await CampaignDelivery.countDocuments({ campaign: id, state: 'SKIPPED' }), channel: 'IN_APP', truncatedAudience: directory.truncated, frequencyDays: 7 };
  });
}
export async function vendorGrowth(vendor) {
  const directory = await vendorDirectory(vendor), core = await CoreBooking.find({ vendorId: vendor }).select('_id customerId bookingStatus executionStatus').lean();
  const external = await VendorBlockout.find({ vendor, recordType: 'EXTERNAL_COMMITMENT' }).select('_id externalBooking.lifecycle externalBooking.acquisitionChannel').lean();
  const reviews = await VendorReview.find({ vendor, isVerified: true, status: 'PUBLISHED' }).select('rating vendorReply source').lean();
  const enquiries = await Opportunity.countDocuments({ vendor });
  const campaignIds = await GrowthCampaign.distinct('_id', { vendor });
  const usefulness = await CampaignDelivery.find({ campaign: { $in: campaignIds }, state: 'DELIVERED' }).select('helpful').lean();
  return { customers: directory.customers.length, directoryTruncated: directory.truncated, repeatCustomers: directory.customers.filter(c => c.repeatCustomer).length, optedInCustomers: directory.customers.filter(c => c.campaignEligible).length,
    starvntBookings: core.filter(b => b.bookingStatus === 'CONFIRMED').length, externalBookings: external.length, enquiries,
    campaignUsefulness: { responses: usefulness.filter(d => d.helpful != null).length, helpful: usefulness.filter(d => d.helpful === true).length }, qrReviews: reviews.length, satisfaction: reviews.length ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length : null, reviewResponseRate: reviews.length ? reviews.filter(r => r.vendorReply?.text).length / reviews.length : null,
    campaigns: await GrowthCampaign.find({ vendor }).select('-requestHash').sort({ createdAt: -1 }).limit(50).lean(), sourceCounts: external.reduce((a, b) => { const s = b.externalBooking?.acquisitionChannel || 'LEGACY_UNKNOWN'; a[s] = (a[s] || 0) + 1; return a; }, {}), revenueIncluded: false };
}
