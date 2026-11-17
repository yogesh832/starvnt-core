import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import sharp from 'sharp';
import { sanitizeDiscoveryVideo } from './discoveryMedia.js';
import { asyncHandler as h } from '../customer/utils/http.js';
import { requireCustomer } from '../customer/middleware/requireCustomer.js';
import { requireAdminAuth, requirePermission } from '../admin/middleware/requireAdminAuth.js';
import { foundationError as fail, hasPermission } from '../foundation/consent.service.js';
import { recordAudit, auditContext } from '../admin/utils/audit.js';
import { PortfolioItem } from '../external/models/PortfolioItem.js';
import { withVendorSchedule } from '../external/services/scheduleLock.js';
import { vendorGrowthEvidence } from '../external/services/discoveryReadiness.service.js';
import { DiscoveryProject, DiscoveryPreference, DiscoveryInteraction, DiscoveryConversion, VendorRewardRule, VendorAchievement, VendorBenefit, VendorRedemption, VendorChallenge, VendorChallengeAward } from './discoveryRewards.models.js';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { CustomerConsent } from '../foundation/models.js';
import { ExternalUser } from '../external/models/ExternalUser.js';
import { CustomerEvent } from '../customer/models/index.js';
import { Opportunity } from '../external/models/Opportunity.js';
import { notifyVendor } from '../notifications/notification.service.js';
const coords = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);
const clean = (s, n) => typeof s === 'string' ? s.trim().slice(0, n) : '';
const categories = ['Wedding', 'Birthday', 'Corporate', 'Celebration', 'Other'];
const styles = ['Traditional', 'Modern', 'Candid', 'Minimal', 'Classic', 'Other'];
const file = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const uploadLimit = rateLimit({ windowMs: 10 * 60000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: req => String(req.vendorId) });
async function recordInteraction(customer, project, kind) {
  if (!await hasPermission(customer, 'PERSONALIZATION')) return;
  const day = new Date().toISOString().slice(0, 10);
  try { await DiscoveryInteraction.findOneAndUpdate({ customer, project, kind, day }, { $setOnInsert: { customer, project, kind, day } }, { upsert: true }); }
  catch (err) { if (err.code !== 11000) throw err; }
}
async function reconcileAwards(vendor, evidence, assertLease) {
  const policy = await VendorRewardRule.findOne({ active: true }).lean();
  for (const m of evidence.milestones) {
    const award = await VendorAchievement.findOne({ vendor, milestone: m.key });
    if (award?.state === 'EARNED' && !m.complete) { await assertLease(); award.state = 'REVERSED'; award.history.push({ actor: 'SYSTEM', action: 'REVERSED', reason: 'Evidence no longer eligible' }); await award.save(); }
    if (!award && m.complete && Number.isInteger(policy?.values?.[m.key]) && policy.values[m.key] > 0) { await assertLease(); await VendorAchievement.create({ vendor, milestone: m.key, ruleVersion: policy.version, xp: policy.values[m.key], history: [{ actor: 'SYSTEM', action: 'EARNED', reason: m.evidence }] }); }
  }
  const challengeAwards = await VendorChallengeAward.find({ vendor, state: 'EARNED' });
  for (const award of challengeAwards) if (!await CoreBooking.exists({ _id: award.booking, vendorId: vendor, bookingStatus: 'CONFIRMED', executionStatus: 'COMPLETION_VERIFIED' })) { await assertLease(); award.state = 'REVERSED'; award.history.push({ actor: 'SYSTEM', action: 'REVERSED', reason: 'Core completion no longer eligible' }); await award.save(); }
  return policy;
}
async function earnedXp(vendor) {
  const [milestones, challenges] = await Promise.all([VendorAchievement.find({ vendor, state: 'EARNED' }).lean(), VendorChallengeAward.find({ vendor, state: 'EARNED' }).lean()]);
  return [...milestones, ...challenges].reduce((n, item) => n + item.xp, 0);
}
export const vendorDiscoveryRewards = Router();
vendorDiscoveryRewards.get('/discovery/projects', h(async (req, res) => res.json({ projects: await DiscoveryProject.find({ vendor: req.vendorId }).select('-image -point').sort({ createdAt: -1 }).limit(100).lean() })));
vendorDiscoveryRewards.post('/discovery/projects', uploadLimit, (req, res, next) => file.single('file')(req, res, err => { if (err) err.statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400; next(err); }), h(async (req, res) => {
  const lat = Number(req.body.lat), lng = Number(req.body.lng);
  if (req.body.permission !== 'true' || !coords(lat, lng) || !categories.includes(req.body.category) || !styles.includes(req.body.style) || !req.file || !['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(req.file.mimetype)) throw fail('INVALID_DISCOVERY', 'Permission, category, style, a project location and a JPEG, PNG, WebP or MP4 file are required.');
  const requestKey = clean(req.body.idempotencyKey, 160);
  if (!requestKey || requestKey !== req.body.idempotencyKey) throw fail('REQUEST_KEY_REQUIRED', 'A request key is required.');
  const requestHash = crypto.createHash('sha256').update(req.file.buffer).update(JSON.stringify({ portfolio: req.body.portfolioId, lat, lng, category: req.body.category, style: req.body.style, type: req.file.mimetype })).digest('hex');
  if (!await PortfolioItem.exists({ _id: req.body.portfolioId, vendor: req.vendorId, visibility: 'PUBLIC', status: { $in: ['PUBLISHED', 'VERIFIED', 'BOOKING_PROVEN'] } })) throw fail('PORTFOLIO_REQUIRED', 'Choose an owned public portfolio item.', 404);
  const project = await withVendorSchedule(`DISCOVERY:${req.vendorId}`, async assertLease => {
    const prior = await DiscoveryProject.findOne({ vendor: req.vendorId, requestKey }).select('+requestHash');
    if (prior) { if (prior.requestHash !== requestHash) throw fail('REQUEST_CHANGED', 'Request key was used for different media.', 409); return prior; }
    if (await DiscoveryProject.countDocuments({ vendor: req.vendorId, status: { $ne: 'WITHDRAWN' } }) >= 50) throw fail('PROJECT_LIMIT', 'A maximum of 50 active discovery submissions is allowed.', 409);
    const mediaType = req.file.mimetype === 'video/mp4' ? 'VIDEO' : 'IMAGE';
    let image; if (mediaType === 'VIDEO') image = await sanitizeDiscoveryVideo(req.file.buffer); else { try { image = await sharp(req.file.buffer, { limitInputPixels: 30000000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer(); } catch { throw fail('INVALID_IMAGE', 'Image could not be processed.'); } }
    await assertLease();
    return DiscoveryProject.create({ vendor: req.vendorId, portfolio: req.body.portfolioId, requestKey, requestHash, publicToken: crypto.randomBytes(24).toString('base64url'), category: clean(req.body.category, 80), style: clean(req.body.style, 80), point: { type: 'Point', coordinates: [lng, lat] }, image, mediaType, consentAt: new Date(), history: [{ actor: String(req.externalUser._id), action: 'SUBMITTED' }] });
  });
  res.status(201).json({ project: { _id: project._id, status: project.status } });
}));
vendorDiscoveryRewards.post('/discovery/projects/:id/withdraw', h(async (req, res) => {
  const project = await DiscoveryProject.findOneAndUpdate({ _id: req.params.id, vendor: req.vendorId, status: { $ne: 'WITHDRAWN' } }, { $set: { status: 'WITHDRAWN' }, $push: { history: { actor: String(req.externalUser._id), action: 'WITHDRAWN' } } }, { new: true });
  if (!project) throw fail('PROJECT_NOT_FOUND', 'Project unavailable.', 404); res.json({ status: project.status });
}));
vendorDiscoveryRewards.get('/rewards', h(async (req, res) => {
  let evidence, policy;
  await withVendorSchedule(req.vendorId, async assertLease => {
    evidence = await vendorGrowthEvidence(req.vendorId);
    policy = await reconcileAwards(req.vendorId, evidence, assertLease);
  });
  const ledger = await VendorAchievement.find({ vendor: req.vendorId }).sort({ createdAt: -1 }).lean(), xp = await earnedXp(req.vendorId);
  const challenges = await VendorChallenge.find({ active: true, start: { $lte: new Date() }, end: { $gt: new Date() } }).select('name start end xp').lean();
  const challengeAwards = await VendorChallengeAward.find({ vendor: req.vendorId }).lean();
  for (const award of [...ledger, ...challengeAwards].filter(a => a.state === 'EARNED')) {
    await notifyVendor({ vendorId: req.vendorId, type: 'SYSTEM', title: 'Achievement earned', message: `You earned ${award.xp} XP from a verified milestone or challenge.`, link: '/vendor/discovery-rewards', idempotencyKey: `vendor-achievement:${award._id}` });
  }
  const thresholds = policy?.thresholds?.length === 5 ? policy.thresholds : [100, 250, 500, 800, 1200];
  const levels = ['Starter', 'Builder', 'Professional', 'Growth Partner', 'Star Partner', 'Elite Partner'].map((name, i) => ({ name, threshold: i ? thresholds[i - 1] : 0 }));
  const benefits = await VendorBenefit.find({ active: true }).lean(), redemptions = await VendorRedemption.find({ vendor: req.vendorId }).lean();
  res.set('Cache-Control', 'no-store').json({ evidence, policy: policy?.version || null, xp, credits: redemptions.filter(r => r.status === 'APPROVED' && (!r.expiresAt || new Date(r.expiresAt) > new Date())).reduce((sum, r) => sum + (r.creditValue || 0), 0), ledger, challenges: challenges.map(c => ({ ...c, status: challengeAwards.find(a => String(a.challenge) === String(c._id))?.state || 'AVAILABLE' })), challengeAwards, level: levels.filter(l => l.threshold <= xp).at(-1), nextLevel: levels.find(l => l.threshold > xp) || null, benefits: benefits.map(b => ({ _id: b._id, name: b.name, description: b.description, minimumXp: b.minimumXp, creditValue: b.creditValue || 0, creditExpiryDays: b.creditExpiryDays || 0, redemptionInstructions: b.redemptionInstructions || '', eligible: xp >= b.minimumXp && evidence.matchingEligible, status: redemptions.find(r => String(r.benefit) === String(b._id))?.status || null })), redemptions, note: 'XP does not change verification, matching or guarantee bookings.' });
}));
vendorDiscoveryRewards.post('/rewards/challenges/:id/check', h(async (req, res) => {
  await withVendorSchedule(req.vendorId, async assertLease => {
    const challenge = await VendorChallenge.findOne({ _id: req.params.id, active: true, start: { $lte: new Date() }, end: { $gt: new Date() } });
    if (!challenge) throw fail('CHALLENGE_UNAVAILABLE', 'Challenge is unavailable.', 404);
    const previous = await VendorChallengeAward.findOne({ vendor: req.vendorId, challenge: challenge._id });
    if (previous) return res.json({ state: previous.state, xp: previous.xp });
    const used = await VendorChallengeAward.distinct('booking', { vendor: req.vendorId });
    const booking = await CoreBooking.findOne({ vendorId: req.vendorId, bookingStatus: 'CONFIRMED', executionStatus: 'COMPLETION_VERIFIED', 'validationAudit.verifiedAt': { $gte: challenge.start, $lt: challenge.end }, _id: { $nin: used } }).sort({ 'validationAudit.verifiedAt': 1 });
    if (!booking) throw fail('EVIDENCE_REQUIRED', 'No unused Core-verified completion was recorded during this challenge.', 409);
    await assertLease(); const award = await VendorChallengeAward.create({ vendor: req.vendorId, challenge: challenge._id, booking: booking._id, xp: challenge.xp, history: [{ actor: 'SYSTEM', action: 'EARNED', reason: 'Core completion verified during challenge' }] });
    res.json({ state: award.state, xp: award.xp });
  });
}));
vendorDiscoveryRewards.post('/rewards/benefits/:id/request', h(async (req, res) => {
  await withVendorSchedule(req.vendorId, async assertLease => {
    const benefit = await VendorBenefit.findOne({ _id: req.params.id, active: true });
    const evidence = await vendorGrowthEvidence(req.vendorId); await reconcileAwards(req.vendorId, evidence, assertLease);
    const xp = await earnedXp(req.vendorId);
    if (!benefit || !evidence.matchingEligible || xp < benefit.minimumXp) throw fail('BENEFIT_INELIGIBLE', 'This benefit is not currently eligible.', 403);
    await assertLease(); const row = await VendorRedemption.findOneAndUpdate({ vendor: req.vendorId, benefit: benefit._id }, { $setOnInsert: { history: [{ actor: String(req.externalUser._id), action: 'REQUESTED' }] } }, { upsert: true, new: true });
    res.status(202).json({ status: row.status });
  });
}));
export const customerDiscovery = Router(); customerDiscovery.use(requireCustomer);
customerDiscovery.get('/discovery/preferences', h(async (req, res) => res.json({ preferences: await DiscoveryPreference.findOne({ customer: req.externalUser._id }).lean() })));
customerDiscovery.put('/discovery/preferences', h(async (req, res) => {
  const { lat, lng, radiusKm } = req.body; if (!coords(lat, lng) || ![25, 50, 75, 100].includes(radiusKm)) throw fail('INVALID_LOCATION', 'Choose a valid location and radius.');
  const preferences = await DiscoveryPreference.findOneAndUpdate({ customer: req.externalUser._id }, { $set: { point: { type: 'Point', coordinates: [lng, lat] }, radiusKm, place: clean(req.body.place, 100) } }, { upsert: true, new: true }); res.json({ preferences });
}));
customerDiscovery.put('/discovery/notifications', h(async (req, res) => {
  if (typeof req.body.enabled !== 'boolean' || !Array.isArray(req.body.categories) || req.body.categories.some(c => !categories.includes(c))) throw fail('INVALID_PREFERENCES', 'Choose notification preferences and valid event categories.');
  const preferences = await DiscoveryPreference.findOneAndUpdate({ customer: req.externalUser._id, radiusKm: { $in: [25, 50, 75, 100] } }, { $set: { notificationsEnabled: req.body.enabled, notificationCategories: [...new Set(req.body.categories)] } }, { new: true });
  if (!preferences) throw fail('LOCATION_REQUIRED', 'Choose a discovery location first.'); res.json({ preferences });
}));
customerDiscovery.get('/discovery/feed', h(async (req, res) => {
  const p = await DiscoveryPreference.findOne({ customer: req.externalUser._id }).lean(); if (!p?.point?.coordinates?.length || !p.radiusKm) throw fail('LOCATION_REQUIRED', 'Choose a discovery location and radius.');
  const rows = await DiscoveryProject.aggregate([{ $geoNear: { near: p.point, distanceField: 'distance', maxDistance: p.radiusKm * 1000, spherical: true, query: { status: 'APPROVED' } } }, { $project: { image: 0 } }, { $lookup: { from: PortfolioItem.collection.name, localField: 'portfolio', foreignField: '_id', as: 'source' } }, { $match: { 'source.visibility': 'PUBLIC', 'source.status': { $in: ['PUBLISHED', 'VERIFIED', 'BOOKING_PROVEN'] } } }, { $limit: 50 }, { $project: { _id: 0, token: '$publicToken', category: 1, style: 1, mediaType: 1, distanceKm: { $max: [10, { $multiply: [{ $ceil: { $divide: ['$distance', 10000] } }, 10] }] } } }]);
  if (rows.length && await hasPermission(req.externalUser._id, 'PERSONALIZATION')) {
    const ids = await DiscoveryProject.find({ publicToken: { $in: rows.map(r => r.token) }, status: 'APPROVED' }).select('_id').lean();
    const day = new Date().toISOString().slice(0, 10), customer = req.externalUser._id;
    if (ids.length) { try { await DiscoveryInteraction.bulkWrite(ids.map(p => ({ updateOne: { filter: { customer, project: p._id, kind: 'VIEW', day }, update: { $setOnInsert: { customer, project: p._id, kind: 'VIEW', day } }, upsert: true } })), { ordered: false }); }
      catch (err) { if (err.code !== 11000) throw err; } }
  }
  res.set('Cache-Control', 'no-store').json({ projects: rows, saved: p.saved || [] });
}));
customerDiscovery.get('/discovery/media/:token', h(async (req, res) => {
  const project = await DiscoveryProject.findOne({ publicToken: req.params.token, status: 'APPROVED' }).select('+image'); if (!project || !await PortfolioItem.exists({ _id: project.portfolio, vendor: project.vendor, visibility: 'PUBLIC', status: { $in: ['PUBLISHED', 'VERIFIED', 'BOOKING_PROVEN'] } })) throw fail('MEDIA_NOT_FOUND', 'Media unavailable.', 404);
  res.set('Cache-Control', 'private, no-store').type(project.mediaType === 'VIDEO' ? 'video/mp4' : 'image/jpeg').send(project.image);
}));
customerDiscovery.post('/discovery/saved/:token', h(async (req, res) => {
  const project = await DiscoveryProject.findOne({ publicToken: req.params.token, status: 'APPROVED' }).select('_id'); if (!project) throw fail('PROJECT_NOT_FOUND', 'Project unavailable.', 404);
  await DiscoveryPreference.updateOne({ customer: req.externalUser._id }, { $addToSet: { saved: req.params.token } }); await recordInteraction(req.externalUser._id, project._id, 'SAVE'); res.json({ ok: true });
}));
customerDiscovery.delete('/discovery/saved/:token', h(async (req, res) => { await DiscoveryPreference.updateOne({ customer: req.externalUser._id }, { $pull: { saved: req.params.token } }); res.json({ ok: true }); }));
customerDiscovery.post('/discovery/interactions/:token', h(async (req, res) => {
  if (!['WATCH', 'SIMILAR', 'PROPOSAL', 'AURA'].includes(req.body.kind)) throw fail('INVALID_INTERACTION', 'Invalid discovery interaction.');
  const project = await DiscoveryProject.findOne({ publicToken: req.params.token, status: 'APPROVED' }).select('_id'); if (!project) throw fail('PROJECT_NOT_FOUND', 'Project unavailable.', 404);
  await recordInteraction(req.externalUser._id, project._id, req.body.kind); res.json({ ok: true });
}));
customerDiscovery.post('/discovery/conversions', h(async (req, res) => {
  const customer = req.externalUser._id;
  if (!await hasPermission(customer, 'PERSONALIZATION')) return res.json({ recorded: false });
  const [project, event] = await Promise.all([DiscoveryProject.findOne({ publicToken: req.body.token, status: 'APPROVED' }).select('_id'), CustomerEvent.findOne({ _id: req.body.eventId, customer }).select('_id createdAt')]);
  if (!project || !event || Date.now() - event.createdAt.getTime() > 15 * 60000) throw fail('ATTRIBUTION_UNAVAILABLE', 'This event cannot be attributed.', 404);
  let record;
  try { record = await DiscoveryConversion.findOneAndUpdate({ customer, event: event._id }, { $setOnInsert: { project: project._id } }, { upsert: true, new: true }); }
  catch (err) { if (err.code !== 11000) throw err; record = await DiscoveryConversion.findOne({ customer, event: event._id }); }
  if (String(record.project) !== String(project._id)) throw fail('ATTRIBUTION_ALREADY_SET', 'An inspiration is already linked to this event.', 409);
  res.json({ recorded: true });
}));
export const adminDiscoveryRewards = Router(); adminDiscoveryRewards.use(requireAdminAuth);
adminDiscoveryRewards.get('/projects', requirePermission('discovery.review'), h(async (_req, res) => res.json({ projects: await DiscoveryProject.find({ status: { $in: ['PENDING_REVIEW', 'APPROVED'] } }).select('-image').sort({ updatedAt: -1 }).limit(100).lean() })));
adminDiscoveryRewards.get('/analytics', requirePermission('analytics.read'), h(async (_req, res) => { const permissionFilter = [
  { $lookup: { from: CustomerConsent.collection.name, let: { customer: '$customer' }, pipeline: [{ $match: { $expr: { $eq: ['$customer', '$$customer'] }, purpose: 'PERSONALIZATION', scope: 'STARVNT', channel: 'ALL', status: 'GRANTED' } }], as: 'consent' } },
  { $match: { 'consent.0': { $exists: true } } },
  { $lookup: { from: ExternalUser.collection.name, localField: 'customer', foreignField: '_id', as: 'account' } },
  { $match: { 'account.status': 'ACTIVE', 'account.privacy.deletionRequestedAt': { $exists: false } } },
];
  const metrics = await DiscoveryInteraction.aggregate([...permissionFilter, { $group: { _id: '$kind', count: { $sum: 1 } } }, { $project: { _id: 0, kind: '$_id', count: 1 } }]);
  const all = await DiscoveryConversion.aggregate([...permissionFilter, { $sort: { createdAt: -1 } }, { $limit: 501 }, { $project: { customer: 1, event: 1, createdAt: 1 } }]);
  const records = all.slice(0, 500), ids = records.map(r => r.event);
  const [opportunities, bookings] = await Promise.all([Opportunity.find({ customerEvent: { $in: ids } }).select('customer customerEvent createdAt').limit(10001).lean(), CoreBooking.find({ customerEvent: { $in: ids }, bookingStatus: 'CONFIRMED' }).select('customerId customerEvent createdAt').limit(10001).lean()]);
  const matches = (r, list, owner) => list.some(item => String(item.customerEvent) === String(r.event) && String(item[owner]) === String(r.customer) && item.createdAt >= r.createdAt);
  res.json({ metrics, conversions: { attributedEvents: records.length, eventsWithEnquiry: records.filter(r => matches(r, opportunities, 'customer')).length, eventsWithConfirmedCoreBooking: records.filter(r => matches(r, bookings, 'customerId')).length, truncated: all.length > 500 || opportunities.length > 10000 || bookings.length > 10000 }, meaning: 'Daily deduplicated interactions from active customers with current personalization permission; proposal clicks are not bookings.' });
}));
adminDiscoveryRewards.get('/projects/:id/image', requirePermission('discovery.review'), h(async (req, res) => { const p = await DiscoveryProject.findById(req.params.id).select('+image'); if (!p) throw fail('PROJECT_NOT_FOUND', 'Project unavailable.', 404); res.set('Cache-Control', 'no-store').type(p.mediaType === 'VIDEO' ? 'video/mp4' : 'image/jpeg').send(p.image); }));
adminDiscoveryRewards.post('/projects/:id/review', requirePermission('discovery.review'), h(async (req, res) => {
  if (!['APPROVED', 'REJECTED'].includes(req.body.status) || !clean(req.body.reason, 500) || (req.body.status === 'APPROVED' && req.body.identityAndRightsReviewed !== true)) throw fail('REVIEW_REQUIRED', 'Record the review reason and confirm rights and visible identity checks.');
  await recordAudit({ ...auditContext(req), action: 'DISCOVERY_REVIEW', targetType: 'DiscoveryProject', targetId: req.params.id, reason: clean(req.body.reason, 500) });
  const p = await DiscoveryProject.findOneAndUpdate({ _id: req.params.id, status: 'PENDING_REVIEW' }, { $set: { status: req.body.status }, $push: { history: { actor: String(req.admin._id), action: req.body.status, reason: clean(req.body.reason, 500) } } }, { new: true }); if (!p) throw fail('PROJECT_CHANGED', 'Project changed.', 409); res.json({ status: p.status });
}));
adminDiscoveryRewards.post('/projects/:id/suspend', requirePermission('discovery.review'), h(async (req, res) => {
  const reason = clean(req.body.reason, 500); if (!reason) throw fail('REASON_REQUIRED', 'A moderation reason is required.');
  await recordAudit({ ...auditContext(req), action: 'DISCOVERY_SUSPENDED', targetType: 'DiscoveryProject', targetId: req.params.id, reason });
  const project = await DiscoveryProject.findOneAndUpdate({ _id: req.params.id, status: { $in: ['PENDING_REVIEW', 'APPROVED'] } }, { $set: { status: 'SUSPENDED' }, $push: { history: { actor: String(req.admin._id), action: 'SUSPENDED', reason } } }, { new: true });
  if (!project) throw fail('PROJECT_CHANGED', 'Project unavailable.', 409); res.json({ status: project.status });
}));
adminDiscoveryRewards.get('/reward-rules', requirePermission('growth.read'), h(async (_req, res) => res.json({ rules: await VendorRewardRule.find().sort({ createdAt: -1 }).lean() })));
adminDiscoveryRewards.get('/awards', requirePermission('growth.read'), h(async (_req, res) => res.json({ awards: await VendorAchievement.find().sort({ createdAt: -1 }).limit(100).lean() })));
adminDiscoveryRewards.get('/challenges', requirePermission('growth.read'), h(async (_req, res) => res.json({ challenges: await VendorChallenge.find().sort({ createdAt: -1 }).limit(100).lean(), awards: await VendorChallengeAward.find().sort({ createdAt: -1 }).limit(100).lean() })));
adminDiscoveryRewards.post('/challenges', requirePermission('growth.manage'), h(async (req, res) => {
  const name = clean(req.body.name, 120), reason = clean(req.body.reason, 500), start = new Date(req.body.start), end = new Date(req.body.end), xp = req.body.xp;
  if (!name || !reason || !Number.isInteger(xp) || xp < 1 || xp > 50 || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end - start > 7 * 86400000 || end <= new Date()) throw fail('INVALID_CHALLENGE', 'Provide a valid challenge of at most seven days and 1–50 XP.');
  await recordAudit({ ...auditContext(req), action: 'VENDOR_CHALLENGE_CREATED', targetType: 'VendorChallenge', targetId: name, reason });
  const challenge = await VendorChallenge.create({ name, start, end, xp, history: [{ actor: String(req.admin._id), action: 'CREATED', reason }] }); res.status(201).json({ challenge });
}));
adminDiscoveryRewards.post('/challenges/:id/stop', requirePermission('growth.manage'), h(async (req, res) => { const reason = clean(req.body.reason, 500); if (!reason) throw fail('REASON_REQUIRED', 'A reason is required.'); await recordAudit({ ...auditContext(req), action: 'VENDOR_CHALLENGE_STOPPED', targetType: 'VendorChallenge', targetId: req.params.id, reason }); const challenge = await VendorChallenge.findOneAndUpdate({ _id: req.params.id, active: true }, { $set: { active: false }, $push: { history: { actor: String(req.admin._id), action: 'STOPPED', reason } } }, { new: true }); if (!challenge) throw fail('CHALLENGE_UNAVAILABLE', 'Challenge unavailable.', 404); res.json({ challenge }); }));
adminDiscoveryRewards.post('/challenge-awards/:id/reverse', requirePermission('growth.manage'), h(async (req, res) => { const reason = clean(req.body.reason, 500), before = await VendorChallengeAward.findById(req.params.id); if (!reason || !before || before.state !== 'EARNED') throw fail('AWARD_NOT_FOUND', 'Active award and reason required.', 404); await withVendorSchedule(before.vendor, async assertLease => { await recordAudit({ ...auditContext(req), action: 'CHALLENGE_AWARD_REVERSED', targetType: 'VendorChallengeAward', targetId: before._id, reason }); await assertLease(); const award = await VendorChallengeAward.findOneAndUpdate({ _id: before._id, state: 'EARNED' }, { $set: { state: 'REVERSED' }, $push: { history: { actor: String(req.admin._id), action: 'REVERSED', reason } } }, { new: true }); if (!award) throw fail('AWARD_CHANGED', 'Award changed.', 409); res.json({ award }); }); }));
adminDiscoveryRewards.post('/reward-rules', requirePermission('growth.manage'), h(async (req, res) => {
  const keys = ['PROFILE', 'VERIFICATION', 'OPERATIONS', 'PORTFOLIO', 'COMPLETION', 'FEEDBACK'], values = req.body.values;
  const thresholds = req.body.thresholds || [100, 250, 500, 800, 1200];
  if (!clean(req.body.version, 80) || !clean(req.body.reason, 500) || !values || Object.keys(values).some(k => !keys.includes(k) || !Number.isInteger(values[k]) || values[k] < 0 || values[k] > 1000) || !Array.isArray(thresholds) || thresholds.length !== 5 || thresholds.some((v, i) => !Number.isInteger(v) || v <= (i ? thresholds[i - 1] : 0) || v > 100000)) throw fail('INVALID_RULE', 'Provide a version, reason, valid milestone points and increasing level thresholds.');
  await recordAudit({ ...auditContext(req), action: 'VENDOR_REWARD_RULE_CREATED', targetType: 'VendorRewardRule', targetId: req.body.version, reason: clean(req.body.reason, 500) });
  const rule = await VendorRewardRule.create({ version: clean(req.body.version, 80), values, thresholds, history: [{ actor: String(req.admin._id), action: 'CREATED' }] }); res.status(201).json({ rule });
}));
adminDiscoveryRewards.post('/reward-rules/:id/activate', requirePermission('growth.manage'), h(async (req, res) => {
  await withVendorSchedule('VENDOR_REWARD_POLICY', async () => { const rule = await VendorRewardRule.findById(req.params.id); if (!rule || !clean(req.body.reason, 500)) throw fail('RULE_REQUIRED', 'Rule and reason required.'); await recordAudit({ ...auditContext(req), action: 'VENDOR_REWARD_RULE_ACTIVATED', targetType: 'VendorRewardRule', targetId: rule._id, reason: clean(req.body.reason, 500) }); await VendorRewardRule.updateMany({ active: true }, { $set: { active: false } }); rule.active = true; rule.history.push({ actor: String(req.admin._id), action: 'ACTIVATED', reason: clean(req.body.reason, 500) }); await rule.save(); res.json({ rule }); });
}));
adminDiscoveryRewards.post('/awards/:id/reverse', requirePermission('growth.manage'), h(async (req, res) => { const reason = clean(req.body.reason, 500); if (!reason) throw fail('REASON_REQUIRED', 'A reversal reason is required.'); const before = await VendorAchievement.findById(req.params.id); if (!before || before.state !== 'EARNED') throw fail('AWARD_NOT_FOUND', 'Active award unavailable.', 404); await withVendorSchedule(before.vendor, async () => { await recordAudit({ ...auditContext(req), action: 'VENDOR_AWARD_REVERSED', targetType: 'VendorAchievement', targetId: before._id, reason }); const row = await VendorAchievement.findOneAndUpdate({ _id: before._id, state: 'EARNED' }, { $set: { state: 'REVERSED' }, $push: { history: { actor: String(req.admin._id), action: 'REVERSED', reason } } }, { new: true }); if (!row) throw fail('AWARD_NOT_FOUND', 'Active award unavailable.', 404); res.json({ award: row }); }); }));
adminDiscoveryRewards.get('/benefits', requirePermission('growth.read'), h(async (_req, res) => res.json({ benefits: await VendorBenefit.find().lean(), requests: await VendorRedemption.find().sort({ createdAt: -1 }).limit(100).lean() })));
adminDiscoveryRewards.post('/benefits', requirePermission('growth.manage'), h(async (req, res) => { const name = clean(req.body.name, 120), description = clean(req.body.description, 500), reason = clean(req.body.reason, 500), minimumXp = req.body.minimumXp, creditValue = Math.max(0, Number(req.body.creditValue) || 0), creditExpiryDays = Math.max(0, Number(req.body.creditExpiryDays) || 0), redemptionInstructions = clean(req.body.redemptionInstructions, 500); if (!name || !reason || !Number.isInteger(minimumXp) || minimumXp < 0 || minimumXp > 100000) throw fail('INVALID_BENEFIT', 'Provide a name, reason and minimum XP.'); await recordAudit({ ...auditContext(req), action: 'VENDOR_BENEFIT_CREATED', targetType: 'VendorBenefit', targetId: name, reason }); const benefit = await VendorBenefit.create({ name, description, minimumXp, creditValue, creditExpiryDays, redemptionInstructions, active: true, history: [{ actor: String(req.admin._id), action: 'CREATED', reason }] }); res.status(201).json({ benefit }); }));
adminDiscoveryRewards.post('/benefits/:id/disable', requirePermission('growth.manage'), h(async (req, res) => { const reason = clean(req.body.reason, 500); if (!reason) throw fail('REASON_REQUIRED', 'A reason is required.'); await recordAudit({ ...auditContext(req), action: 'VENDOR_BENEFIT_DISABLED', targetType: 'VendorBenefit', targetId: req.params.id, reason }); const benefit = await VendorBenefit.findOneAndUpdate({ _id: req.params.id, active: true }, { $set: { active: false }, $push: { history: { actor: String(req.admin._id), action: 'DISABLED', reason } } }, { new: true }); if (!benefit) throw fail('BENEFIT_NOT_FOUND', 'Active benefit unavailable.', 404); res.json({ benefit }); }));
adminDiscoveryRewards.post('/redemptions/:id/review', requirePermission('growth.manage'), h(async (req, res) => { const reason = clean(req.body.reason, 500); if (!reason || !['APPROVED', 'REJECTED'].includes(req.body.status)) throw fail('DECISION_REQUIRED', 'Choose a decision and reason.'); const row = await VendorRedemption.findOne({ _id: req.params.id, status: 'REQUESTED' }); if (!row) throw fail('REQUEST_NOT_FOUND', 'Pending request unavailable.', 404); await withVendorSchedule(row.vendor, async assertLease => { let creditValue = 0, expiresAt = null; if (req.body.status === 'APPROVED') { const benefit = await VendorBenefit.findOne({ _id: row.benefit, active: true }); const ready = await vendorGrowthEvidence(row.vendor); await reconcileAwards(row.vendor, ready, assertLease); const xp = await earnedXp(row.vendor); if (!benefit || !ready.matchingEligible || xp < benefit.minimumXp) throw fail('BENEFIT_INELIGIBLE', 'Vendor no longer meets the benefit requirements.', 409); creditValue = benefit.creditValue || 0; if (benefit.creditExpiryDays > 0) expiresAt = new Date(Date.now() + benefit.creditExpiryDays * 86400000); } await recordAudit({ ...auditContext(req), action: 'VENDOR_BENEFIT_REVIEWED', targetType: 'VendorRedemption', targetId: row._id, reason, toState: { status: req.body.status } }); const updated = await VendorRedemption.findOneAndUpdate({ _id: row._id, status: 'REQUESTED' }, { $set: { status: req.body.status, creditValue, expiresAt }, $push: { history: { actor: String(req.admin._id), action: req.body.status, reason } } }, { new: true }); if (!updated) throw fail('REQUEST_CHANGED', 'Request changed.', 409); res.json({ request: updated }); }); }));
