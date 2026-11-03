import { PrivacyRequest, CustomerConsent, IdentityLink } from './models.js';
import { CustomerInterests, ReferralCode } from '../experience/models.js';
import { DiscoveryPreference, DiscoveryNotice, DiscoveryInteraction, DiscoveryConversion } from '../experience/discoveryRewards.models.js';
import { VendorReview } from '../external/models/VendorReview.js';
import { ExternalUser } from '../external/models/ExternalUser.js';
import { ExternalSession } from '../external/models/ExternalSession.js';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { Booking, Reservation, Payment, CustomerEvent, AuraSession, AuraMessage, AuraContext, CustomerFavorite, CustomerNotification } from '../customer/models/index.js';
import { NotificationPreference, CustomerReminder } from '../notifications/preferences.models.js';
import { PushSubscription, PushJob } from '../notifications/push.models.js';
import { foundationError } from './consent.service.js';

export async function requestDeletion(customer) {
  const user = await ExternalUser.findById(customer);
  if (!user || user.accountType !== 'CUSTOMER') throw foundationError('CUSTOMER_REQUIRED', 'Customer account required.', 403);
  const now = new Date();
  const row = await PrivacyRequest.findOneAndUpdate({ customer }, { $setOnInsert: { requestedAt: now, status: 'REQUESTED', history: [{ actor: String(customer), action: 'REQUESTED', at: now }] } }, { upsert: true, new: true });
  // Stop optional uses immediately, while allowing the customer to track the request.
  await ExternalUser.updateOne({ _id: customer }, { $set: { 'privacy.deletionRequestedAt': row.requestedAt } });
  return row;
}

export async function processDeletion(requestId, actor, input = {}) {
  let row = await PrivacyRequest.findById(requestId);
  if (!row) throw foundationError('REQUEST_NOT_FOUND', 'Privacy request not found.', 404);
  if (row.status === 'COMPLETED') return row;
  if (row.legalHold) throw foundationError('LEGAL_HOLD', 'Resolve the recorded retention hold before processing.', 409);
  const retainedUntil = new Date(input.retainedUntil);
  const reason = typeof input.retentionReason === 'string' ? input.retentionReason.trim() : '';
  if (!reason || reason.length > 500 || !Number.isFinite(retainedUntil.getTime()) || retainedUntil <= new Date()) throw foundationError('RETENTION_DECISION_REQUIRED', 'Record a reason and a future review/expiry date for retained business records.');
  const customer = row.customer;
  const activeCore = await CoreBooking.exists({ customerId: customer, bookingStatus: 'CONFIRMED', executionStatus: { $nin: ['COMPLETION_VERIFIED', 'COMPLETED'] } });
  const activeProjection = await Booking.exists({ customer, status: { $in: ['pending', 'confirmed'] }, executionStatus: { $ne: 'completed' } });
  const liveHold = await Reservation.exists({ customer, status: { $in: ['held', 'pending_payment'] }, expiresAt: { $gt: new Date() } });
  const pendingPayment = await Payment.exists({ customer, status: { $in: ['pending', 'processing', 'paid'] } });
  if (activeCore || activeProjection || liveHold || pendingPayment) throw foundationError('ACTIVE_BOOKING_REVIEW', 'Resolve active booking and payment obligations before anonymizing this account.', 409);
  // The recorded intent makes every following step safe to retry after an outage.
  row = await PrivacyRequest.findOneAndUpdate({ _id: row._id, legalHold: { $ne: true }, status: { $ne: 'COMPLETED' } }, { $set: { status: 'PROCESSING', approvedBy: String(actor), retentionReason: reason, retainedUntil, lastError: null }, $push: { history: { actor: String(actor), action: 'PROCESSING', at: new Date(), reason } } }, { new: true });
  if (!row) throw foundationError('REQUEST_CHANGED', 'Privacy request changed. Refresh.', 409);
  try {
    await ExternalUser.updateOne({ _id: customer }, { $set: { status: 'DISABLED', 'privacy.retentionReason': reason, 'privacy.retainedUntil': retainedUntil } });
    await ExternalSession.updateMany({ user: customer, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await CustomerReminder.updateMany({ customer, status: { $in: ['PENDING', 'PROCESSING'] } }, { $set: { status: 'CANCELLED' } });
    const subscriptions = await PushSubscription.find({ domain: 'external', ownerId: customer }).select('_id').lean();
    await PushJob.deleteMany({ subscription: { $in: subscriptions.map(s => s._id) } });
    await PushSubscription.deleteMany({ domain: 'external', ownerId: customer });
    const conversations = await AuraSession.find({ customer }).select('_id event').lean();
    await AuraMessage.deleteMany({ session: { $in: conversations.map(r => r._id) } });
    const events = await CustomerEvent.find({ customer }).select('_id').lean();
    await AuraContext.deleteMany({ event: { $in: events.map(r => r._id) } });
    await AuraSession.deleteMany({ customer });
    await CustomerFavorite.deleteMany({ customer });
    await CustomerInterests.deleteOne({ customer });
    await DiscoveryPreference.deleteOne({ customer });
    await DiscoveryNotice.deleteMany({ customer });
    await DiscoveryInteraction.deleteMany({ customer });
    await DiscoveryConversion.deleteMany({ customer });
    await ReferralCode.deleteOne({ owner: customer });
    await VendorReview.updateMany({ customer }, { $set: { 'feedbackPermissions.ecosystem': false, 'feedbackPermissions.marketing': false, 'feedbackPermissions.withdrawnAt': new Date(), customerName: 'Deleted customer', customerEmail: '', reviewText: 'Feedback removed at customer request.' } });
    await CustomerNotification.deleteMany({ customer });
    await NotificationPreference.deleteOne({ _id: `CUSTOMER:${customer}` });
    await IdentityLink.updateMany({ $or: [{ customer }, { otherCustomer: customer }], status: { $in: ['LINKED', 'REQUESTED'] } }, { $set: { status: 'REVOKED' }, $push: { history: { actor: String(actor), action: 'REVOKED', at: new Date(), reason: 'Privacy deletion' } } });
    await CustomerConsent.updateMany({ customer, status: 'GRANTED' }, { $set: { status: 'WITHDRAWN' }, $inc: { revision: 1 }, $push: { history: { actor: String(actor), action: 'WITHDRAWN', at: new Date(), reason: 'Privacy deletion' } } });
    await ExternalUser.updateOne({ _id: customer }, { $set: { fullName: 'Deleted customer', email: `deleted-${customer}@privacy.starvnt.invalid`, phone: '', googleId: null, avatarUrl: '', passwordHash: null, identityVerification: {}, 'privacy.anonymizedAt': new Date() }, $unset: { phoneIdentityKey: 1, googleIdentityKey: 1 } });
    return PrivacyRequest.findByIdAndUpdate(row._id, { $set: { status: 'COMPLETED', completedAt: new Date() }, $push: { history: { actor: String(actor), action: 'COMPLETED', at: new Date(), reason } } }, { new: true });
  } catch (err) {
    await PrivacyRequest.updateOne({ _id: row._id }, { $set: { lastError: err.message } });
    throw err;
  }
}
