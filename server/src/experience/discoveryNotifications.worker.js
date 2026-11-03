import { DiscoveryPreference, DiscoveryProject, DiscoveryNotice } from './discoveryRewards.models.js';
import { PortfolioItem } from '../external/models/PortfolioItem.js';
import { NotificationPreference } from '../notifications/preferences.models.js';
import { notificationDelivery } from '../notifications/policy.js';
import { notifyCustomer } from '../notifications/notification.service.js';
import { communicationAllowed } from '../foundation/consent.service.js';

// Bounded batches reuse the customer notification service, respect current
// personalization permission and quiet hours, and deduplicate each project.
export async function runDiscoveryNotificationBatch({ now = new Date(), limit = 100 } = {}) {
  const cutoff = new Date(now.getTime() - 7 * 86400000);
  const prefs = await DiscoveryPreference.find({ notificationsEnabled: true, radiusKm: { $in: [25, 50, 75, 100] }, $or: [{ lastSentAt: { $exists: false } }, { lastSentAt: null }, { lastSentAt: { $lte: cutoff } }] }).sort({ lastCheckedAt: 1 }).limit(limit).lean();
  let sent = 0;
  for (const candidate of prefs) {
    await DiscoveryPreference.updateOne({ _id: candidate._id }, { $set: { lastCheckedAt: now } }, { timestamps: false });
    if (!candidate.point?.coordinates?.length || !await communicationAllowed(candidate.customer, { purpose: 'PERSONALIZATION', channel: 'IN_APP' })) continue;
    const notificationPolicy = await NotificationPreference.findById(`CUSTOMER:${candidate.customer}`).lean();
    if (!notificationDelivery({ ...(notificationPolicy || {}), channels: { PUSH: true } }, 'personalization', now).allowed) continue;
    const seen = await DiscoveryNotice.distinct('project', { customer: candidate.customer });
    const query = { status: 'APPROVED', _id: { $nin: seen } };
    if (candidate.notificationCategories?.length) query.category = { $in: candidate.notificationCategories };
    const projects = await DiscoveryProject.aggregate([{ $geoNear: { near: candidate.point, distanceField: 'distance', maxDistance: candidate.radiusKm * 1000, spherical: true, query } }, { $project: { image: 0 } }, { $lookup: { from: PortfolioItem.collection.name, localField: 'portfolio', foreignField: '_id', as: 'source' } }, { $match: { 'source.visibility': 'PUBLIC', 'source.status': { $in: ['PUBLISHED', 'VERIFIED', 'BOOKING_PROVEN'] } } }, { $limit: 1 }]);
    if (!projects.length) continue;
    // Compare the configuration so a concurrent location/opt-out change wins.
    const reserved = await DiscoveryPreference.findOneAndUpdate({ _id: candidate._id, notificationsEnabled: true, updatedAt: candidate.updatedAt, $or: [{ lastSentAt: { $exists: false } }, { lastSentAt: null }, { lastSentAt: { $lte: cutoff } }] }, { $set: { lastSentAt: now } }, { new: true, timestamps: false });
    if (!reserved) continue;
    const current = await DiscoveryPreference.findOne({ _id: candidate._id, notificationsEnabled: true, updatedAt: candidate.updatedAt }).lean();
    const currentPolicy = await NotificationPreference.findById(`CUSTOMER:${candidate.customer}`).lean();
    if (!current || !notificationDelivery({ ...(currentPolicy || {}), channels: { PUSH: true } }, 'personalization', now).allowed || !await communicationAllowed(candidate.customer, { purpose: 'PERSONALIZATION', channel: 'IN_APP' }) || !await DiscoveryProject.exists({ _id: projects[0]._id, status: 'APPROVED' }) || !await PortfolioItem.exists({ _id: projects[0].portfolio, vendor: projects[0].vendor, visibility: 'PUBLIC', status: { $in: ['PUBLISHED', 'VERIFIED', 'BOOKING_PROVEN'] } })) continue;
    const result = await notifyCustomer({ customerId: candidate.customer, type: 'personalization', purpose: 'PERSONALIZATION', channel: 'IN_APP', title: 'New inspiration nearby', body: 'An approved event idea is available near your selected location.', actionUrl: '/customer/discovery', idempotencyKey: `discovery:${candidate.customer}:${projects[0]._id}` });
    if (!result.skipped) { await DiscoveryNotice.findOneAndUpdate({ customer: candidate.customer, project: projects[0]._id }, { $setOnInsert: { sentAt: now } }, { upsert: true }); if (result.created) sent++; }
  }
  return { checked: prefs.length, sent };
}
