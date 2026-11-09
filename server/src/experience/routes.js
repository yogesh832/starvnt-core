import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { asyncHandler as h } from '../customer/utils/http.js';
import { requireCustomer } from '../customer/middleware/requireCustomer.js';
import { requireAdminAuth, requirePermission } from '../admin/middleware/requireAdminAuth.js';
import { recordAudit, auditContext } from '../admin/utils/audit.js';
import { CUSTOMER_NOTICE, foundationError as fail } from '../foundation/consent.service.js';
import { VendorReview } from '../external/models/VendorReview.js';
import { withVendorSchedule } from '../external/services/scheduleLock.js';
import { validateExternalAttachment } from '../external/routes/externalBookings.routes.js';
import { Experience, ExperienceSupport, ExperienceDelivery, FeedbackAccess, CustomerInterests, LoyaltyRule, GrowthCampaign, CampaignDelivery } from './models.js';
import { issueExperience, publicExperience, requestFeedbackOtp, verifyFeedbackOtp, authorizeFeedback, saveFeedback, reviewDTO, claimFeedback, saveSupport, safeExperience, recalculateRating, requestKey, text } from './feedback.service.js';
import { vendorDirectory, customerRelationship, saveInterests, referralCode, attributeReferral, reconcileLoyalty, growthOverview, createCampaign, publishCampaign, vendorGrowth } from './growth.service.js';

export const experiencePublicRoutes = Router();
function requireVendorQr(_req, res, next) {
  if (!config.vendorQrEnabled) return res.sendStatus(404);
  return next();
}
experiencePublicRoutes.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); next(); });
experiencePublicRoutes.use(requireVendorQr);
experiencePublicRoutes.use(rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));
const otpLimit = rateLimit({ windowMs: 15 * 60000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false });
const proof = req => req.headers['x-feedback-access'] || '';
experiencePublicRoutes.get('/:token', h(async (req, res) => res.json(await publicExperience(req.params.token))));
experiencePublicRoutes.post('/:token/otp', otpLimit, h(async (req, res) => { await requestFeedbackOtp(req.params.token, req.body.phone); res.json({ ok: true }); }));
experiencePublicRoutes.post('/:token/verify', otpLimit, h(async (req, res) => res.json(await verifyFeedbackOtp(req.params.token, req.body.phone, req.body.otp))));
experiencePublicRoutes.get('/:token/feedback', h(async (req, res) => { const { row } = await authorizeFeedback(req.params.token, proof(req)); const review = await VendorReview.findOne({ experienceKey: row.bookingKey }); res.json({ review: review ? reviewDTO(review) : null }); }));
experiencePublicRoutes.post('/:token/feedback', h(async (req, res) => res.json({ review: reviewDTO(await saveFeedback(req.params.token, proof(req), req.body)) })));
experiencePublicRoutes.post('/:token/support', h(async (req, res) => res.status(202).json({ request: await saveSupport(req.params.token, proof(req), req.body) })));
experiencePublicRoutes.get('/:token/support', h(async (req, res) => {
  const { row } = await authorizeFeedback(req.params.token, proof(req));
  res.json({ requests: await ExperienceSupport.find({ experience: row._id }).select('_id status message history createdAt').limit(50).lean(), delivery: await ExperienceDelivery.findOne({ experience: row._id }).select('status carrier tracking').lean() });
}));
experiencePublicRoutes.post('/:token/delivery', h(async (req, res) => {
  const { row } = await authorizeFeedback(req.params.token, proof(req));
  if (req.body.addressConsent !== true || req.body.noticeVersion !== CUSTOMER_NOTICE.version) throw fail('ADDRESS_CONSENT_REQUIRED', 'Consent is required to use this address for the requested thank-you card.');
  const address = text(req.body.address, 500, true);
  const request = await ExperienceDelivery.findOneAndUpdate({ experience: row._id }, { $setOnInsert: { address, consentVersion: CUSTOMER_NOTICE.version, consentAt: new Date(), history: [{ actor: `RECIPIENT:${row._id}`, action: 'REQUESTED' }] } }, { upsert: true, new: true });
  if (request.address !== address || request.status === 'CANCELLED') throw fail('DELIVERY_CHANGED', 'Contact support to change this request.', 409);
  res.status(202).json({ request: { _id: request._id, status: request.status }, fulfillmentGuaranteed: false });
}));
experiencePublicRoutes.post('/:token/delivery/cancel', h(async (req, res) => {
  const { row } = await authorizeFeedback(req.params.token, proof(req));
  const request = await ExperienceDelivery.findOneAndUpdate({ experience: row._id, status: 'REQUESTED' }, { $set: { status: 'CANCELLED', address: '' }, $push: { history: { actor: `RECIPIENT:${row._id}`, action: 'CONSENT_WITHDRAWN' } } }, { new: true });
  if (!request) throw fail('DELIVERY_IN_PROGRESS', 'Contact support if a card has already been dispatched.', 409);
  res.json({ status: request.status });
}));
experiencePublicRoutes.post('/:token/withdraw', h(async (req, res) => {
  const { row } = await authorizeFeedback(req.params.token, proof(req));
  const review = await VendorReview.findOneAndUpdate({ experienceKey: row.bookingKey }, { $set: { 'feedbackPermissions.ecosystem': false, 'feedbackPermissions.marketing': false, 'feedbackPermissions.withdrawnAt': new Date() }, $inc: { revision: 1 }, $push: { reviewHistory: { actor: `RECIPIENT:${row._id}`, action: 'OPTIONAL_PERMISSION_WITHDRAWN', at: new Date() } } }, { new: true });
  res.json({ review: review ? reviewDTO(review) : null });
}));
experiencePublicRoutes.post('/:token/deletion', h(async (req, res) => {
  const { row } = await authorizeFeedback(req.params.token, proof(req));
  await VendorReview.updateOne({ experienceKey: row.bookingKey }, { $set: { 'feedbackPermissions.ecosystem': false, 'feedbackPermissions.marketing': false, 'feedbackPermissions.deletionRequestedAt': new Date() }, $inc: { revision: 1 }, $push: { reviewHistory: { actor: `RECIPIENT:${row._id}`, action: 'DELETION_REQUESTED', at: new Date() } } });
  const request = await saveSupport(req.params.token, proof(req), { idempotencyKey: `privacy:${row._id}`, message: 'PRIVACY_DELETION: review guest identity, optional photos and retained commercial evidence.' });
  res.status(202).json({ request, optionalUseStopped: true });
}));
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 10 * 1024 * 1024 } });
experiencePublicRoutes.post('/:token/photos', (req, res, next) => upload.single('file')(req, res, err => { if (err) err.statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400; next(err); }), h(async (req, res) => {
  const { row } = await authorizeFeedback(req.params.token, proof(req));
  validateExternalAttachment(req.file, 'OTHER');
  if (!req.file.mimetype.startsWith('image/') || req.body.photoConsent !== 'true') throw fail('PHOTO_PERMISSION_REQUIRED', 'Confirm permission to share this image with support.');
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) throw fail('PRIVATE_STORAGE_UNAVAILABLE', 'Photo storage is unavailable.', 503);
  await withVendorSchedule(row.vendor, async () => {
    const review = await VendorReview.findOne({ experienceKey: row.bookingKey });
    if (!review || review.feedbackPermissions.deletionRequestedAt || review.photos.length >= 5) throw fail('PHOTO_LIMIT', 'Submit feedback first; at most five photos are allowed.', 409);
    cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
    // Re-encoding removes EXIF and GPS. Delivery remains authenticated, with no public gallery URL.
    const stored = await cloudinary.uploader.upload(`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`, { public_id: `starvnt_private/feedback/${row._id}/${cryptoHash(req.file.buffer)}`, type: 'authenticated', resource_type: 'image', format: 'jpg', transformation: [{ flags: 'strip_profile' }], overwrite: false });
    if (!review.photos.some(p => p.publicId === stored.public_id)) { review.photos.push({ publicId: stored.public_id, resourceType: 'image', format: 'jpg' }); review.reviewHistory.push({ actor: `RECIPIENT:${row._id}`, action: 'PHOTO_ATTACHED', at: new Date() }); await review.save(); }
  }); res.status(201).json({ ok: true });
}));
import crypto from 'node:crypto';
const cryptoHash = b => crypto.createHash('sha256').update(b).digest('hex');

export const experienceVendorRoutes = Router();
experienceVendorRoutes.use('/experiences', requireVendorQr);
experienceVendorRoutes.get('/customer-directory', h(async (req, res) => res.json(await vendorDirectory(req.vendorId))));
experienceVendorRoutes.get('/experiences', h(async (req, res) => res.json({ experiences: (await Experience.find({ vendor: req.vendorId }).sort({ createdAt: -1 }).limit(100)).map(safeExperience) })));
experienceVendorRoutes.post('/experiences', h(async (req, res) => {
  const issued = await issueExperience(req.vendorId, req.externalUser._id, req.body);
  const url = new URL(`/experience/${issued.token}`, config.customerPortalUrl).href;
  res.status(201).json({ experience: issued.experience, url, qrDataUrl: await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 4, width: 512 }) });
}));
experienceVendorRoutes.post('/experiences/:id/revoke', h(async (req, res) => {
  await withVendorSchedule(req.vendorId, async () => {
    const row = await Experience.findOneAndUpdate({ _id: req.params.id, vendor: req.vendorId, revision: req.body.revision }, { $set: { revokedAt: new Date(), sealedToken: null }, $inc: { revision: 1 }, $push: { history: { actor: String(req.externalUser._id), action: 'REVOKED', reason: text(req.body.reason, 500, true) } } }, { new: true });
    if (!row) throw fail('EXPERIENCE_CHANGED', 'Experience changed or is unavailable.', 409);
    await FeedbackAccess.deleteMany({ experience: row._id }); res.json({ experience: safeExperience(row) });
  });
}));
experienceVendorRoutes.post('/reviews/:id/report', h(async (req, res) => {
  const row = await VendorReview.findOneAndUpdate({ _id: req.params.id, vendor: req.vendorId, 'reports.actor': { $ne: String(req.externalUser._id) } }, { $push: { reports: { actor: String(req.externalUser._id), reason: text(req.body.reason, 500, true), at: new Date() } } }, { new: true });
  if (!row) throw fail('REPORT_UNAVAILABLE', 'Review unavailable or already reported.', 409); res.status(202).json({ reported: true, status: row.status });
}));
experienceVendorRoutes.get('/growth', h(async (req, res) => res.json(await vendorGrowth(req.vendorId))));
experienceVendorRoutes.post('/growth/campaigns', h(async (req, res) => res.status(201).json({ campaign: await createCampaign(req.vendorId, req.externalUser._id, req.body) })));
experienceVendorRoutes.post('/growth/campaigns/:id/publish', h(async (req, res) => res.json(await publishCampaign(req.vendorId, req.externalUser._id, req.params.id, req.body))));
experienceVendorRoutes.post('/growth/campaigns/:id/stop', h(async (req, res) => {
  await withVendorSchedule(req.vendorId, async () => {
    const campaign = await GrowthCampaign.findOneAndUpdate({ _id: req.params.id, vendor: req.vendorId, revision: req.body.revision }, { $set: { state: 'STOPPED' }, $inc: { revision: 1 }, $push: { history: { actor: String(req.externalUser._id), action: 'STOPPED' } } }, { new: true });
    if (!campaign) throw fail('CAMPAIGN_CHANGED', 'Campaign changed.', 409); res.json({ campaign });
  });
}));

export const experienceCustomerRoutes = Router();
experienceCustomerRoutes.use(requireCustomer);
experienceCustomerRoutes.get('/relationships', h(async (req, res) => res.json(await customerRelationship(req.externalUser._id))));
experienceCustomerRoutes.put('/interests', h(async (req, res) => { const row = await saveInterests(req.externalUser._id, req.body); res.json({ interests: row.interests, revision: row.revision, preferredChannel: row.preferredChannel }); }));
experienceCustomerRoutes.delete('/interests', h(async (req, res) => { await CustomerInterests.deleteOne({ customer: req.externalUser._id }); res.json({ ok: true }); }));
experienceCustomerRoutes.post('/experience/claim', requireVendorQr, h(async (req, res) => res.json({ review: await claimFeedback(req.externalUser._id, req.body.token, req.body.accessToken) })));
experienceCustomerRoutes.get('/growth', h(async (req, res) => res.json(await growthOverview(req.externalUser._id))));
experienceCustomerRoutes.post('/growth/campaigns/:id/feedback', h(async (req, res) => {
  if (typeof req.body.helpful !== 'boolean') throw fail('INVALID_FEEDBACK', 'Choose whether this campaign was helpful.');
  const delivery = await CampaignDelivery.findOneAndUpdate({ _id: req.params.id, customer: req.externalUser._id, state: 'DELIVERED' }, { $set: { helpful: req.body.helpful } }, { new: true });
  if (!delivery) throw fail('CAMPAIGN_NOT_FOUND', 'Delivered campaign not found.', 404); res.json({ helpful: delivery.helpful });
}));
experienceCustomerRoutes.post('/referrals/code', h(async (req, res) => { const row = await referralCode(req.externalUser._id); res.json({ code: row.code }); }));
experienceCustomerRoutes.post('/referrals/attribute', h(async (req, res) => res.json(await attributeReferral(req.externalUser._id, req.body.code))));
experienceCustomerRoutes.post('/loyalty/reconcile', h(async (req, res) => res.json(await reconcileLoyalty(req.externalUser._id))));

export const experienceAdminRoutes = Router();
experienceAdminRoutes.use(requireAdminAuth);
experienceAdminRoutes.get('/reviews/:id/photos/:index', requirePermission('reviews.media'), h(async (req, res) => {
  const review = await VendorReview.findById(req.params.id), index = Number(req.params.index);
  if (!review || !Number.isInteger(index) || index < 0 || !review.photos[index]) throw fail('PHOTO_NOT_FOUND', 'Photo not found.', 404);
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) throw fail('PRIVATE_STORAGE_UNAVAILABLE', 'Photo storage is unavailable.', 503);
  await recordAudit({ ...auditContext(req), action: 'PRIVATE_FEEDBACK_PHOTO_READ', targetType: 'VendorReview', targetId: review._id, reason: 'Customer experience support review' });
  cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
  const photo = review.photos[index];
  res.set('Cache-Control', 'no-store').json({ url: cloudinary.utils.private_download_url(photo.publicId, photo.format, { type: 'authenticated', resource_type: 'image', expires_at: Math.floor(Date.now() / 1000) + 300 }), expiresInSeconds: 300 });
}));
experienceAdminRoutes.get('/reviews', requirePermission('reviews.read'), h(async (_req, res) => res.json({ reviews: await VendorReview.find({ experienceKey: { $exists: true } }).select('_id vendor rating reviewText status revision suspicionFlags reports reviewHistory').sort({ updatedAt: -1 }).limit(100).lean() })));
experienceAdminRoutes.post('/reviews/:id/moderate', requirePermission('reviews.moderate'), h(async (req, res) => {
  if (!['PUBLISHED', 'HIDDEN'].includes(req.body.status)) throw fail('INVALID_STATUS', 'Choose a valid moderation status.');
  const reason = text(req.body.reason, 500, true);
  const before = await VendorReview.findById(req.params.id);
  if (!before) throw fail('REVIEW_NOT_FOUND', 'Review not found.', 404);
  await recordAudit({ ...auditContext(req), action: 'REVIEW_MODERATION', targetType: 'VendorReview', targetId: before._id, reason, fromState: { status: before.status }, toState: { status: req.body.status } });
  const review = await VendorReview.findOneAndUpdate({ _id: before._id, revision: req.body.revision }, { $set: { status: req.body.status }, $inc: { revision: 1 }, $push: { reviewHistory: { actor: String(req.admin._id), action: 'MODERATED', at: new Date(), reason } } }, { new: true });
  if (!review) throw fail('REVIEW_CHANGED', 'Review changed.', 409); await recalculateRating(review.vendor); res.json({ review: reviewDTO(review) });
}));
experienceAdminRoutes.get('/support', requirePermission('issues.read'), h(async (_req, res) => res.json({ requests: await ExperienceSupport.find().sort({ createdAt: -1 }).limit(100).lean() })));
experienceAdminRoutes.get('/deliveries', requirePermission('customerContacts.read'), h(async (_req, res) => res.json({ deliveries: await ExperienceDelivery.find().sort({ createdAt: -1 }).limit(100).lean() })));
experienceAdminRoutes.post('/deliveries/:id/status', requirePermission('customerContacts.read'), requirePermission('issues.update'), h(async (req, res) => {
  const allowed = { REQUESTED: ['DISPATCHED', 'CANCELLED'], DISPATCHED: ['DELIVERED'], DELIVERED: [], CANCELLED: [] };
  const before = await ExperienceDelivery.findById(req.params.id);
  if (!before || !allowed[before.status].includes(req.body.status)) throw fail('DELIVERY_TRANSITION_DENIED', 'Delivery state cannot move to that status.', 409);
  const reason = text(req.body.reason, 500, true), carrier = text(req.body.carrier || '', 100), tracking = text(req.body.tracking || '', 200);
  if (req.body.status === 'DISPATCHED' && (!carrier || !tracking)) throw fail('TRACKING_REQUIRED', 'Carrier and tracking reference are required.');
  await recordAudit({ ...auditContext(req), action: 'EXPERIENCE_DELIVERY_UPDATED', targetType: 'ExperienceDelivery', targetId: before._id, reason });
  const delivery = await ExperienceDelivery.findOneAndUpdate({ _id: before._id, status: before.status }, { $set: { status: req.body.status, ...(carrier ? { carrier, tracking } : {}), ...(req.body.status === 'CANCELLED' ? { address: '' } : {}) }, $push: { history: { actor: String(req.admin._id), action: req.body.status, reason } } }, { new: true });
  if (!delivery) throw fail('DELIVERY_CHANGED', 'Delivery changed.', 409); res.json({ delivery });
}));
experienceAdminRoutes.post('/support/:id/privacy-process', requirePermission('privacy.manage'), h(async (req, res) => {
  const support = await ExperienceSupport.findById(req.params.id);
  if (!support || !support.message.startsWith('PRIVACY_DELETION:')) throw fail('PRIVACY_REQUEST_REQUIRED', 'A customer deletion request is required.', 404);
  const reason = text(req.body.retentionReason, 500, true), until = new Date(req.body.retainedUntil);
  if (!Number.isFinite(until.getTime()) || until <= new Date()) throw fail('RETENTION_DECISION_REQUIRED', 'Record a future retention review date.');
  const experience = await Experience.findById(support.experience), review = await VendorReview.findOne({ experience: support.experience });
  await recordAudit({ ...auditContext(req), action: 'GUEST_PRIVACY_PROCESSED', targetType: 'Experience', targetId: support.experience, reason, toState: { retainedUntil: until, retained: ['BOOKING', 'BUSINESS_AUDIT', 'PROVIDER_MEDIA_REVIEW'] } });
  if (review) {
    review.customerName = 'Deleted recipient'; review.customerEmail = ''; review.reviewText = 'Feedback removed at customer request.'; review.customer = null;
    review.feedbackPermissions.ecosystem = false; review.feedbackPermissions.marketing = false;
    review.reviewHistory.push({ actor: String(req.admin._id), action: 'ANONYMIZED', at: new Date(), reason: `${reason}; retention review ${until.toISOString()}; private provider media needs separate deletion verification` }); await review.save();
  }
  await ExperienceDelivery.updateOne({ experience: support.experience }, { $set: { address: '' }, $push: { history: { actor: String(req.admin._id), action: 'ADDRESS_REMOVED', reason } } });
  await FeedbackAccess.deleteMany({ experience: support.experience });
  if (experience) { experience.revokedAt = new Date(); experience.sealedToken = null; experience.history.push({ actor: String(req.admin._id), action: 'PRIVACY_REVOKED', reason }); await experience.save(); }
  support.status = 'RESOLVED'; support.history.push({ actor: String(req.admin._id), action: 'ANONYMIZED', reason }); await support.save();
  res.json({ request: { _id: support._id, status: support.status }, providerMediaDeletionVerified: false, retainedUntil: until });
}));
experienceAdminRoutes.post('/support/:id/resolve', requirePermission('issues.update'), h(async (req, res) => {
  const reason = text(req.body.reason, 500, true);
  const request = await ExperienceSupport.findOneAndUpdate({ _id: req.params.id, status: 'OPEN' }, { $set: { status: 'RESOLVED' }, $push: { history: { actor: String(req.admin._id), action: 'RESOLVED', reason } } }, { new: true });
  if (!request) throw fail('REQUEST_NOT_FOUND', 'Open support request not found.', 404); res.json({ request });
}));
experienceAdminRoutes.post('/loyalty/rules', requirePermission('growth.manage'), h(async (req, res) => {
  const version = text(req.body.version, 80, true), points = req.body.pointsPerCompletion;
  if (!Number.isInteger(points) || points < 0 || points > 10000) throw fail('INVALID_POINTS', 'Use whole points between 0 and 10000.');
  await recordAudit({ ...auditContext(req), action: 'LOYALTY_RULE_CREATED', targetType: 'LoyaltyRule', targetId: version, reason: text(req.body.reason, 500, true), toState: { pointsPerCompletion: points } });
  const rule = await LoyaltyRule.create({ version, pointsPerCompletion: points, active: false, history: [{ actor: String(req.admin._id), action: 'CREATED' }] }); res.status(201).json({ rule });
}));
experienceAdminRoutes.post('/loyalty/rules/:id/activate', requirePermission('growth.manage'), h(async (req, res) => {
  await withVendorSchedule('LOYALTY_POLICY', async () => {
  const rule = await LoyaltyRule.findById(req.params.id); if (!rule) throw fail('RULE_NOT_FOUND', 'Rule not found.', 404);
  await recordAudit({ ...auditContext(req), action: 'LOYALTY_RULE_ACTIVATED', targetType: 'LoyaltyRule', targetId: rule._id, reason: text(req.body.reason, 500, true) });
  await LoyaltyRule.updateMany({ active: true }, { $set: { active: false } }); rule.active = true; rule.history.push({ actor: String(req.admin._id), action: 'ACTIVATED' }); await rule.save(); res.json({ rule });
  });
}));
experienceAdminRoutes.get('/loyalty/rules', requirePermission('growth.read'), h(async (_req, res) => res.json({ rules: await LoyaltyRule.find().sort({ createdAt: -1 }).limit(100).lean() })));
