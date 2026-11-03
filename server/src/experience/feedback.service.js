import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Experience, FeedbackAccess, ExperienceSupport } from './models.js';
import { VendorReview } from '../external/models/VendorReview.js';
import { VendorOrganization } from '../external/models/VendorOrganization.js';
import { VendorBlockout } from '../external/models/VendorBlockout.js';
import { ExternalUser } from '../external/models/ExternalUser.js';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { normalizePhone, sendMobileOtp, verifyMobileOtp } from '../external/services/otp.service.js';
import { identityDigest, verifiedContact, findPhoneIdentity } from '../foundation/identity.service.js';
import { CUSTOMER_NOTICE, foundationError as fail, hasPermission } from '../foundation/consent.service.js';
import { withVendorSchedule } from '../external/services/scheduleLock.js';
export const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
export function text(value, max, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw fail('INVALID_INPUT', 'Please provide valid text.');
  return value.trim();
}
export function requestKey(value) { const key = text(value, 160, true); return key; }
function seal(token) {
  const iv = crypto.randomBytes(12), key = crypto.createHash('sha256').update(config.jwtSecret).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  return [iv, cipher.update(token, 'utf8'), cipher.final(), cipher.getAuthTag()].map(b => b.toString('base64url')).join('.');
}
function unseal(value) {
  const [iv, data, end, tag] = value.split('.').map(x => Buffer.from(x, 'base64url'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(config.jwtSecret).digest(), iv);
  cipher.setAuthTag(tag); return Buffer.concat([cipher.update(data), cipher.update(end), cipher.final()]).toString('utf8');
}
export async function bookingFacts(source, booking, vendor = null) {
  if (!mongoose.isValidObjectId(booking) || !['STARVNT', 'VENDOR_PRIVATE'].includes(source)) throw fail('BOOKING_NOT_FOUND', 'Booking not found.', 404);
  if (source === 'STARVNT') {
    const b = await CoreBooking.findOne({ _id: booking, ...(vendor ? { vendorId: vendor } : {}) }).lean();
    if (!b) throw fail('BOOKING_NOT_FOUND', 'Booking not found.', 404);
    const customer = await ExternalUser.findById(b.customerId);
    return { vendor: b.vendorId, event: b.customerEvent, booking: b._id, customer: b.customerId, date: b.eventDate, service: b.serviceName,
      eligible: b.bookingStatus === 'CONFIRMED' && b.executionStatus === 'COMPLETION_VERIFIED',
      phone: customer && customer.accountType === 'CUSTOMER' && customer.status === 'ACTIVE' && verifiedContact(customer, 'PHONE') ? normalizePhone(customer.phone) : '' };
  }
  const b = await VendorBlockout.findOne({ _id: booking, recordType: 'EXTERNAL_COMMITMENT', ...(vendor ? { vendor } : {}) }).lean();
  if (!b) throw fail('BOOKING_NOT_FOUND', 'Booking not found.', 404);
  return { vendor: b.vendor, booking: b._id, date: b.date, service: b.externalBooking?.lineItems?.map(l => l.name).join(', ') || b.external?.eventType || 'External service', eligible: b.status === 'ACTIVE' && b.externalBooking?.lifecycle === 'COMPLETED', phone: normalizePhone(b.external?.customerPhone) };
}
export async function issueExperience(vendor, actor, input) {
  const key = requestKey(input.idempotencyKey);
  const hash = digest(JSON.stringify({ source: input.source, booking: input.booking }));
  return withVendorSchedule(vendor, async () => {
    const facts = await bookingFacts(input.source, input.booking, vendor);
    if (!facts.eligible || !/^\+\d{8,15}$/.test(facts.phone)) throw fail('FEEDBACK_NOT_ELIGIBLE', 'A completed booking and recipient mobile are required.', 409);
    const bookingKey = `${input.source}:${facts.booking}`;
    let row = await Experience.findOne({ bookingKey });
    const prior = row?.history.find(h => h.key === key);
    if (prior) {
      if (prior.hash !== hash || row.revokedAt || row.expiresAt <= new Date() || prior.action !== 'ISSUED' || row.history.at(-1).key !== key) throw fail('REQUEST_CHANGED', 'QR changed. Generate a new one.', 409);
      return { experience: safeExperience(row), token: unseal(row.sealedToken) };
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const fields = { tokenHash: digest(token), sealedToken: seal(token), recipientDigest: identityDigest('PHONE', facts.phone), expiresAt: new Date(Date.now() + 30 * 86400000), revokedAt: null };
    row = await Experience.findOneAndUpdate({ bookingKey }, { $set: fields, $setOnInsert: { bookingKey, booking: facts.booking, source: input.source, vendor, event: facts.event }, $inc: { revision: 1 }, $push: { history: { actor: String(actor), action: 'ISSUED', key, hash } } }, { new: true, upsert: true, runValidators: true });
    return { experience: safeExperience(row), token };
  });
}
export function safeExperience(row) { return { _id: row._id, booking: row.booking, source: row.source, expiresAt: row.expiresAt, revokedAt: row.revokedAt, revision: row.revision }; }
export async function resolveExperience(token) {
  if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) throw fail('EXPERIENCE_UNAVAILABLE', 'This experience link is unavailable.', 404);
  const row = await Experience.findOne({ tokenHash: digest(token), revokedAt: null, expiresAt: { $gt: new Date() } });
  if (!row) throw fail('EXPERIENCE_UNAVAILABLE', 'This experience link is unavailable.', 404);
  const facts = await bookingFacts(row.source, row.booking);
  if (!facts.eligible || identityDigest('PHONE', facts.phone) !== row.recipientDigest) throw fail('EXPERIENCE_UNAVAILABLE', 'This experience link is unavailable.', 404);
  return { row, facts };
}
export async function publicExperience(token) {
  const { row } = await resolveExperience(token), vendor = await VendorOrganization.findById(row.vendor).select('businessName').lean();
  return { vendorName: vendor?.businessName || 'Event service partner', expiresAt: row.expiresAt, source: row.source, notice: CUSTOMER_NOTICE, accountRequired: false };
}
export async function requestFeedbackOtp(token, phone) {
  const { row } = await resolveExperience(token);
  if (identityDigest('PHONE', normalizePhone(phone)) !== row.recipientDigest) throw fail('RECIPIENT_MISMATCH', 'Use the mobile associated with this booking.', 403);
  return sendMobileOtp(phone);
}
export async function verifyFeedbackOtp(token, phone, otp) {
  const { row, facts } = await resolveExperience(token), normalized = normalizePhone(phone);
  if (identityDigest('PHONE', normalized) !== row.recipientDigest) throw fail('RECIPIENT_MISMATCH', 'Use the mobile associated with this booking.', 403);
  const owner = await findPhoneIdentity(normalized);
  if (owner?.accountType === 'VENDOR') throw fail('SELF_REVIEW_DENIED', 'Vendor accounts cannot submit customer feedback.', 403);
  const vendor = await VendorOrganization.findById(row.vendor).select('owner').lean();
  const vendorOwner = vendor && await ExternalUser.findById(vendor.owner).select('phone').lean();
  if (vendorOwner?.phone && normalizePhone(vendorOwner.phone) === normalized) throw fail('SELF_REVIEW_DENIED', 'Vendor accounts cannot submit customer feedback.', 403);
  const proof = await verifyMobileOtp(normalized, otp);
  if (!proof.valid || proof.trustSource === 'DEVELOPMENT_OTP') throw fail('INVALID_OTP', 'A valid mobile OTP is required.', 401);
  const accessToken = crypto.randomBytes(32).toString('base64url');
  await FeedbackAccess.create({ experience: row._id, tokenHash: row.tokenHash, phoneDigest: row.recipientDigest, proofHash: digest(accessToken), expiresAt: new Date(Date.now() + 30 * 60000) });
  return { accessToken, event: { date: facts.date, service: facts.service }, expiresInSeconds: 1800 };
}
export async function authorizeFeedback(token, accessToken) {
  const { row, facts } = await resolveExperience(token);
  const access = await FeedbackAccess.findOne({ experience: row._id, tokenHash: row.tokenHash, proofHash: digest(accessToken), expiresAt: { $gt: new Date() }, phoneDigest: row.recipientDigest });
  if (!access) throw fail('FEEDBACK_VERIFICATION_REQUIRED', 'Verify the booking mobile to continue.', 401);
  return { row, facts, access };
}
export function reviewDTO(review) {
  return { _id: review._id, rating: review.rating, reviewText: review.reviewText, criteria: review.criteria, revision: review.revision, status: review.status, isVerified: review.isVerified, source: review.source, permissions: review.feedbackPermissions, vendorReply: review.vendorReply, photoCount: review.photos?.length || 0 };
}
export async function recalculateRating(vendor) {
  const rows = await VendorReview.aggregate([{ $match: { vendor: new mongoose.Types.ObjectId(String(vendor)), status: 'PUBLISHED', isVerified: true } }, { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }]);
  await VendorOrganization.updateOne({ _id: vendor }, { $set: { rating: { average: rows[0]?.average || 0, count: rows[0]?.count || 0 } } });
}
export async function saveFeedback(token, accessToken, input) {
  const { row, facts } = await authorizeFeedback(token, accessToken);
  const key = requestKey(input.idempotencyKey), criteria = {};
  if (input.eventConfirmed !== true || input.noticeVersion !== CUSTOMER_NOTICE.version) throw fail('CONFIRMATION_REQUIRED', 'Confirm the service and read the current data notice.');
  for (const field of ['rating', 'quality', 'punctuality', 'staff', 'communication']) {
    const value = field === 'rating' ? input.rating : input.criteria?.[field];
    if (!Number.isInteger(value) || value < 1 || value > 5) throw fail('INVALID_RATING', 'Ratings must be whole numbers from 1 to 5.');
    if (field !== 'rating') criteria[field] = value;
  }
  const name = text(input.name, 100, true), reviewText = text(input.reviewText, 2000, true);
  if (typeof input.ecosystem !== 'boolean' || typeof input.marketing !== 'boolean' || !['NONE', 'IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'].includes(input.channel) || (input.marketing && input.channel === 'NONE')) throw fail('INVALID_CONSENT', 'Choose optional permissions separately.');
  const permissions = { noticeVersion: CUSTOMER_NOTICE.version, ecosystem: input.ecosystem, marketing: input.marketing, channel: input.channel };
  const hash = digest(JSON.stringify({ name, reviewText, criteria, rating: input.rating, permissions, revision: input.revision }));
  return withVendorSchedule(row.vendor, async () => {
    await authorizeFeedback(token, accessToken);
    let review = await VendorReview.findOne({ booking: row.booking, vendor: row.vendor }).select('+proofDigest');
    const replay = review?.reviewHistory.find(h => h.key === key);
    if (replay) { if (replay.hash !== hash) throw fail('REQUEST_CHANGED', 'Request key reused.', 409); return review; }
    if (review && (review.experienceKey !== row.bookingKey || review.proofDigest !== row.recipientDigest)) throw fail('REVIEW_EXISTS', 'A review already exists for this booking.', 409);
    if (!Number.isInteger(input.revision) || input.revision !== (review?.revision || 0)) throw fail('STALE_REVISION', 'Refresh feedback before editing.', 409);
    if (review && (Date.now() - review.createdAt.getTime() > 7 * 86400000 || review.status !== 'PUBLISHED' || review.feedbackPermissions?.deletionRequestedAt)) throw fail('EDIT_WINDOW_CLOSED', 'Contact support to correct this review.', 409);
    const other = await VendorReview.exists({ proofDigest: row.recipientDigest, reviewText, booking: { $ne: row.booking } });
    const update = { rating: input.rating, reviewText, customerName: name, criteria, feedbackPermissions: permissions };
    const entry = { actor: `RECIPIENT:${row._id}`, action: review ? 'EDITED' : 'SUBMITTED', at: new Date(), key, hash };
    if (!review) review = await VendorReview.create({ ...update, experience: row._id, experienceKey: row.bookingKey, proofDigest: row.recipientDigest, source: row.source, vendor: row.vendor, booking: row.booking, serviceName: facts.service, eventType: '', eventDate: facts.date, isVerified: true, status: 'PUBLISHED', suspicionFlags: other ? ['REPEATED_TEXT'] : [], revision: 1, reviewHistory: [entry] });
    else { Object.assign(review, update); review.revision++; review.reviewHistory.push(entry); await review.save(); }
    await recalculateRating(row.vendor); return review;
  });
}
export async function claimFeedback(customer, token, accessToken) {
  const { row } = await authorizeFeedback(token, accessToken), user = await ExternalUser.findById(customer);
  if (!user || !verifiedContact(user, 'PHONE') || identityDigest('PHONE', normalizePhone(user.phone)) !== row.recipientDigest || !await hasPermission(customer, 'ECOSYSTEM')) throw fail('CLAIM_PERMISSION_REQUIRED', 'Verify your account mobile and enable ecosystem permission first.', 403);
  const review = await VendorReview.findOne({ experienceKey: row.bookingKey });
  if (!review?.feedbackPermissions?.ecosystem || review.feedbackPermissions.withdrawnAt || review.feedbackPermissions.deletionRequestedAt || (review.customer && String(review.customer) !== String(customer))) throw fail('CLAIM_PERMISSION_REQUIRED', 'Feedback must permit this account relationship.', 403);
  review.customer = customer; review.reviewHistory.push({ actor: String(customer), action: 'ACCOUNT_LINKED', at: new Date() }); await review.save();
  return reviewDTO(review);
}
export async function saveSupport(token, accessToken, input) {
  const { row } = await authorizeFeedback(token, accessToken), key = requestKey(input.idempotencyKey), message = text(input.message, 2000, true);
  const support = await ExperienceSupport.findOneAndUpdate({ experience: row._id, requestKey: key }, { $setOnInsert: { message, history: [{ actor: `RECIPIENT:${row._id}`, action: 'REQUESTED' }] } }, { upsert: true, new: true });
  if (support.message !== message) throw fail('REQUEST_CHANGED', 'Request key reused.', 409);
  return { _id: support._id, status: support.status };
}
