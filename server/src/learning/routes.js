import { createHash } from 'node:crypto';
import { Router } from 'express';
import { isObjectIdOrHexString } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { requireAdminAuth, requireAnyPermission, requirePermission } from '../admin/middleware/requireAdminAuth.js';
import { LearningLesson, LearningProgress, LearningFeedback, learningCategories } from './models.js';
import { learningContentSnapshot, learningContentHash, appendLearningContentVersions, assertLearningContentHistory } from '../common/learningContentVersions.js';
import { readinessMetricKeys } from '../common/readinessMetrics.js';
import { evaluateVendorActivation } from '../external/services/vendorActivation.service.js';
import { lessonRecommendationEvidence, lessonRecommendationReasons } from './recommendations.js';

export const adminLearningRoutes = Router();
export const vendorLearningRoutes = Router();
const h = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next);
const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const text = (value, max, required = false) => {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw fail('INVALID_LESSON', 'Review the lesson fields and their length limits.');
  }
  return value.trim();
};

function lessonFields(input, previous = {}) {
  const category = input?.category;
  if (!learningCategories.includes(category)) throw fail('INVALID_CATEGORY', 'Choose an Academy category.');
  const videoId = text(input.videoId, 200);
  const captions = text(input.captions, 45000);
  const durationSeconds = input.durationSeconds ?? 0;
  if (videoId && (!/^starvnt_private\/academy\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(videoId) ||
      !/^WEBVTT(?:\r?\n)/.test(captions) || !Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 3600)) {
    throw fail('INVALID_VIDEO', 'Use a private Academy asset ID, a duration up to 60 minutes, and WebVTT captions.');
  }
  if (!videoId && (captions || durationSeconds !== 0)) throw fail('INVALID_VIDEO', 'Enter a video asset ID or clear the video details.');
  const needsTags = input.needsTags === undefined ? previous.needsTags || [] : input.needsTags;
  const featured = input.featured === undefined ? previous.featured || false : input.featured;
  if (!Array.isArray(needsTags) || needsTags.length > readinessMetricKeys.length || needsTags.some(key => !readinessMetricKeys.includes(key)) || typeof featured !== 'boolean') throw fail('INVALID_LESSON', 'Choose valid readiness topics and featured status.');
  return {
    description: text(input.description ?? previous.description, 1000), difficulty: text(input.difficulty ?? previous.difficulty, 80), featured, needsTags: [...new Set(needsTags)].sort(),
    title: text(input.title, 160, true), category, objective: text(input.objective, 400, true),
    content: text(input.content, 20000, true), resources: text(input.resources, 10000),
    videoId, captions, durationSeconds,
  };
}

function isoDate(input) {
  const date = new Date(input);
  if (typeof input !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(input) ||
      !Number.isFinite(date.getTime())) throw fail('INVALID_DATE', 'Supply a date and time with a timezone.');
  return date;
}

function visibility(at = new Date()) {
  return { publishAt: { $lte: at }, rightsReference: { $type: 'string', $ne: '' }, $and: [{ $or: [{ state: 'PUBLISHED' }, { state: { $exists: false } }] }, { $or: [{ rightsExpiresAt: null }, { rightsExpiresAt: { $gt: at } }] }] };
}

function metadata(lesson) {
  return {
    id: String(lesson._id), title: lesson.title, category: lesson.category,
    objective: lesson.objective, hasVideo: Boolean(lesson.videoId), durationSeconds: lesson.durationSeconds,
    contentVersion: lesson.contentVersion, publishAt: lesson.publishAt,
    description: lesson.description || '', difficulty: lesson.difficulty || '', featured: lesson.featured === true, needsTags: lesson.needsTags || [],
  };
}

function adminView(lesson) {
  return {
    ...metadata(lesson), revision: lesson.revision, content: lesson.content, resources: lesson.resources,
    videoId: lesson.videoId, captions: lesson.captions, rightsReference: lesson.rightsReference,
    rightsExpiresAt: lesson.rightsExpiresAt, history: lesson.history,
    state: lesson.state || (lesson.publishAt ? 'PUBLISHED' : 'DRAFT'),
  };
}

async function requirePrivateVideo(videoId) {
  const provider = cloudinary.config();
  if (!provider.cloud_name || !provider.api_key || !provider.api_secret) {
    throw fail('LEARNING_MEDIA_UNAVAILABLE', 'Private Academy video storage is unavailable.', 503);
  }
  let asset;
  try { asset = await cloudinary.api.resource(videoId, { resource_type: 'video', type: 'authenticated' }); }
  catch (error) {
    if (error.http_code !== 404) throw fail('LEARNING_MEDIA_UNAVAILABLE', 'Private Academy video storage is unavailable.', 503);
  }
  if (asset?.type !== 'authenticated' || asset.resource_type !== 'video' || asset.format !== 'mp4' || asset.public_id !== videoId) {
    throw fail('PRIVATE_VIDEO_REQUIRED', 'Use an authenticated MP4 from the Academy media folder.', 409);
  }
}

function lessonId(req) {
  if (!isObjectIdOrHexString(req.params.id)) throw fail('LESSON_UNAVAILABLE', 'This lesson is unavailable.', 404);
  return req.params.id;
}

async function currentLesson(req) {
  const lesson = await LearningLesson.findOne({ _id: lessonId(req), ...visibility() }).lean();
  if (!lesson) throw fail('LESSON_UNAVAILABLE', 'This lesson is unavailable.', 404);
  return lesson;
}

adminLearningRoutes.use(requireAdminAuth, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
adminLearningRoutes.get('/', requireAnyPermission('academy.read', 'academy.edit', 'academy.publish'), h(async (_req, res) => {
  const rows = await LearningLesson.find().select('-requestKey -requestHash -createdBy').sort({ updatedAt: -1 }).limit(101).lean();
  res.json({ categories: learningCategories, needsTagOptions: readinessMetricKeys, lessons: rows.slice(0, 100).map(adminView), truncated: rows.length > 100 });
}));
adminLearningRoutes.post('/', requirePermission('academy.edit'), h(async (req, res) => {
  const fields = lessonFields(req.body);
  const requestKey = text(req.body.requestKey, 80, true);
  const requestHash = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  const createdBy = String(req.admin._id);
  const filter = { createdBy, requestKey };
  let row;
  try {
    row = await LearningLesson.findOneAndUpdate(filter, {
      $setOnInsert: { ...fields, state: 'DRAFT', lastEditedBy: createdBy, requestHash, contentVersions: [learningContentSnapshot(fields, { version: 1, actor: createdBy })], history: [{ actor: createdBy, action: 'DRAFT_CREATED', at: new Date(), revision: 1 }] },
    }, { upsert: true, new: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    row = await LearningLesson.findOne(filter);
  }
  const { description, difficulty, featured, needsTags, ...legacyFields } = fields;
  const legacyHash = createHash('sha256').update(JSON.stringify(legacyFields)).digest('hex');
  const legacyReplay = row && row.requestHash === legacyHash && !description && !difficulty && !featured && !needsTags.length;
  if (!row || (row.requestHash !== requestHash && !legacyReplay)) throw fail('REQUEST_CHANGED', 'This draft request already used different content.', 409);
  res.status(201).json({ lesson: adminView(row) });
}));

function expectedRevision(req) {
  const revision = req.body?.revision;
  if (!Number.isSafeInteger(revision) || revision < 1) throw fail('REVISION_REQUIRED', 'Reload the lesson and try again.');
  return revision;
}

const canonicalRequest = value => Array.isArray(value) ? value.map(canonicalRequest) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalRequest(value[key])])) : value;
function actionHash(req, action) {
  return createHash('sha256').update(JSON.stringify(canonicalRequest({ actor: String(req.admin._id), action, body: req.body }))).digest('hex');
}
async function replayLessonAction(req, action) {
  const row = await LearningLesson.findOne({ _id: lessonId(req), revision: expectedRevision(req) + 1 });
  const last = row?.history?.at(-1);
  return last?.requestHash === actionHash(req, action) ? row : null;
}

async function updateLesson(req, filter, update, action, reason, evidence = {}) {
  const revision = expectedRevision(req);
  const row = await LearningLesson.findOneAndUpdate({ _id: lessonId(req), revision, ...filter }, {
    ...update,
    $inc: { ...update.$inc, revision: 1 },
    $push: { ...update.$push, history: { actor: String(req.admin._id), action, at: new Date(), reason, revision: revision + 1, requestHash: actionHash(req, action), ...evidence } },
  }, { new: true, runValidators: true });
  if (!row) {
    const replay = await replayLessonAction(req, action);
    if (replay) return replay;
    throw fail('LESSON_CHANGED', 'The lesson changed. Reload it before trying again.', 409);
  }
  return row;
}

adminLearningRoutes.put('/:id', requirePermission('academy.edit'), h(async (req, res) => {
  const replay = await replayLessonAction(req, 'DRAFT_EDITED');
  if (replay) return res.json({ lesson: adminView(replay) });
  const previous = await LearningLesson.findOne({ _id: lessonId(req), revision: expectedRevision(req) }).select('+contentVersions').lean();
  if (!previous) throw fail('LESSON_CHANGED', 'The lesson changed. Reload it before trying again.', 409);
  const fields = lessonFields(req.body, previous);
  const versions = appendLearningContentVersions(previous, fields, req.admin._id);
  const row = await updateLesson(req, { publishAt: null, state: { $in: ['DRAFT', 'UNPUBLISHED', null] } }, {
    $set: { ...fields, state: 'DRAFT', lastEditedBy: String(req.admin._id), rightsReference: '' }, $unset: { rightsExpiresAt: 1 }, $inc: { contentVersion: 1 },
    $push: { contentVersions: { $each: versions } },
  }, 'DRAFT_EDITED');
  res.json({ lesson: adminView(row) });
}));

adminLearningRoutes.get('/:id/versions', requireAnyPermission('academy.read', 'academy.edit', 'academy.publish'), h(async (req, res) => {
  const row = await LearningLesson.findById(lessonId(req)).select('+contentVersions').lean();
  if (!row) throw fail('LESSON_UNAVAILABLE', 'This lesson is unavailable.', 404);
  assertLearningContentHistory(row);
  res.json({ currentVersion: row.contentVersion, versions: row.contentVersions || [], currentVersionArchived: Boolean(row.contentVersions?.some(entry => entry.version === row.contentVersion)) });
}));

adminLearningRoutes.post('/:id/submit-review', requirePermission('academy.edit'), h(async (req, res) => {
  const row = await updateLesson(req, { publishAt: null, state: { $in: ['DRAFT', 'UNPUBLISHED', null] } }, { $set: { state: 'REVIEW' } }, 'REVIEW_REQUESTED', text(req.body.reason, 500, true));
  res.json({ lesson: adminView(row) });
}));
adminLearningRoutes.post('/:id/request-changes', requirePermission('academy.publish'), h(async (req, res) => {
  const row = await updateLesson(req, { state: 'REVIEW' }, { $set: { state: 'DRAFT' } }, 'CHANGES_REQUESTED', text(req.body.reason, 500, true));
  res.json({ lesson: adminView(row) });
}));

adminLearningRoutes.post('/:id/publication', requirePermission('academy.publish'), h(async (req, res) => {
  const revision = expectedRevision(req);
  const reason = text(req.body.reason, 500, true);
  const action = req.body.action;
  if (['WITHDRAW', 'PUBLISH'].includes(action)) {
    const replay = await replayLessonAction(req, action === 'WITHDRAW' ? 'WITHDRAWN' : 'PUBLICATION_APPROVED');
    if (replay) return res.json({ lesson: adminView(replay) });
  }
  if (action === 'WITHDRAW') {
    const row = await updateLesson(req, { publishAt: { $type: 'date' } }, { $set: { state: 'UNPUBLISHED' }, $unset: { publishAt: 1 } }, 'WITHDRAWN', reason);
    return res.json({ lesson: adminView(row) });
  }
  if (action !== 'PUBLISH') throw fail('INVALID_PUBLICATION_ACTION', 'Choose publish or withdraw.');
  const rightsReference = text(req.body.rightsReference, 200, true);
  const publishAt = req.body.publishAt ? isoDate(req.body.publishAt) : new Date();
  const rightsExpiresAt = req.body.rightsExpiresAt ? isoDate(req.body.rightsExpiresAt) : null;
  if (rightsExpiresAt && rightsExpiresAt <= Math.max(Date.now(), publishAt.getTime())) {
    throw fail('RIGHTS_EXPIRED', 'The rights must be valid when the lesson is available.');
  }
  const draft = await LearningLesson.findOne({ _id: lessonId(req), revision, publishAt: null, state: 'REVIEW' }).select('+contentVersions').lean();
  if (!draft) throw fail('LESSON_CHANGED', 'The draft changed. Reload it before publishing.', 409);
  const archived = assertLearningContentHistory(draft);
  if ([draft.createdBy, draft.lastEditedBy].includes(String(req.admin._id))) throw fail('INDEPENDENT_REVIEW_REQUIRED', 'A different authorized publisher must review and publish this lesson.', 403);
  if (draft.videoId) await requirePrivateVideo(draft.videoId);
  const row = await updateLesson(req, { publishAt: null, state: 'REVIEW' }, {
    $set: { state: 'PUBLISHED', publishAt, rightsReference, rightsExpiresAt },
  }, 'PUBLICATION_APPROVED', reason, {
    rightsReference, rightsExpiresAt, publishAt, contentVersion: draft.contentVersion, contentHash: learningContentHash(draft, archived?.hashVersion || (archived ? 1 : 2)), videoId: draft.videoId,
  });
  res.json({ lesson: adminView(row) });
}));

vendorLearningRoutes.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (req.vendor.status === 'SUSPENDED' || req.vendor.isRestricted || req.externalUser.isRestricted) {
    return res.status(403).json({ error: 'ACADEMY_ACCESS_RESTRICTED', message: 'Academy access is unavailable for this account.' });
  }
  return next();
});
vendorLearningRoutes.get('/', h(async (req, res) => {
  const evidencePromise = evaluateVendorActivation(req.vendorId).then(lessonRecommendationEvidence).catch(() => lessonRecommendationEvidence(null));
  const rows = await LearningLesson.find(visibility()).select('title objective category publishAt videoId durationSeconds contentVersion description difficulty featured needsTags')
    .sort({ publishAt: -1, _id: -1 }).limit(101).lean();
  const lessons = rows.slice(0, 100);
  const progress = await LearningProgress.find({ vendor: req.vendorId, lesson: { $in: lessons.map(row => row._id) } })
    .select('lesson contentVersion positionSeconds completedAt').lean();
  const byVersion = new Map(progress.map(row => [`${row.lesson}:${row.contentVersion}`, row]));
  const recommendations = await evidencePromise;
  res.json({
    recommendations,
    categories: learningCategories, truncated: rows.length > 100,
    lessons: lessons.map(row => {
      const current = byVersion.get(`${row._id}:${row.contentVersion}`);
      return { ...metadata(row), recommendationReasons: lessonRecommendationReasons(row, current, recommendations), positionSeconds: current?.positionSeconds ?? 0, completedAt: current?.completedAt ?? null };
    }),
  });
}));
vendorLearningRoutes.get('/:id', h(async (req, res) => {
  const lesson = await currentLesson(req);
  const feedback = await LearningFeedback.findOne({ vendor: req.vendorId, lesson: lesson._id, contentVersion: lesson.contentVersion }).sort({ createdAt: -1, _id: -1 }).select('rating comment createdAt -_id').lean();
  res.json({ lesson: { ...metadata(lesson), content: lesson.content, resources: lesson.resources, captions: lesson.captions }, feedback });
}));
vendorLearningRoutes.post('/:id/feedback', h(async (req, res) => {
  const lesson = await currentLesson(req);
  if (req.body.contentVersion !== lesson.contentVersion) throw fail('LESSON_CHANGED', 'Reopen the current lesson before sending feedback.', 409);
  const rating = req.body.rating, comment = text(req.body.comment, 1500), requestKey = text(req.body.requestKey, 100, true);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || requestKey.length < 8) throw fail('INVALID_FEEDBACK', 'Choose a rating from 1 to 5 and provide a request key.');
  const requestHash = createHash('sha256').update(JSON.stringify({ rating, comment })).digest('hex');
  const filter = { vendor: req.vendorId, lesson: lesson._id, contentVersion: lesson.contentVersion, requestKey };
  let row;
  try { row = await LearningFeedback.findOneAndUpdate(filter, { $setOnInsert: { actor: String(req.externalUser._id), rating, comment, requestHash } }, { upsert: true, new: true, runValidators: true }); }
  catch (error) { if (error.code !== 11000) throw error; row = await LearningFeedback.findOne(filter); }
  if (!row || row.requestHash !== requestHash) throw fail('REQUEST_CHANGED', 'This request key already recorded different feedback.', 409);
  res.json({ feedback: { rating: row.rating, comment: row.comment, createdAt: row.createdAt } });
}));
vendorLearningRoutes.post('/:id/playback', h(async (req, res) => {
  const lesson = await currentLesson(req);
  if (!lesson.videoId) throw fail('VIDEO_UNAVAILABLE', 'This lesson has no video.', 404);
  await requirePrivateVideo(lesson.videoId);
  const at = Date.now();
  // Recheck publication after awaiting provider metadata.
  if (!await LearningLesson.exists({ _id: lesson._id, revision: lesson.revision, ...visibility(new Date(at)) })) {
    throw fail('LESSON_UNAVAILABLE', 'This lesson is unavailable.', 404);
  }
  const expiry = Math.floor(Math.min(at + 300000, lesson.rightsExpiresAt?.getTime() ?? Infinity) / 1000);
  if (expiry <= Math.floor(at / 1000)) throw fail('LESSON_UNAVAILABLE', 'This lesson is unavailable.', 404);
  const url = cloudinary.utils.private_download_url(lesson.videoId, 'mp4', {
    resource_type: 'video', type: 'authenticated', expires_at: expiry, attachment: false,
  });
  res.json({ url, expiresAt: new Date(expiry * 1000) });
}));
vendorLearningRoutes.put('/:id/progress', h(async (req, res) => {
  const lesson = await currentLesson(req);
  const { contentVersion, positionSeconds, complete } = req.body || {};
  if (contentVersion !== lesson.contentVersion) throw fail('LESSON_CHANGED', 'This lesson changed. Reopen the current version.', 409);
  if (!Number.isInteger(positionSeconds) || positionSeconds < 0 || positionSeconds > lesson.durationSeconds ||
      (complete !== undefined && typeof complete !== 'boolean')) throw fail('INVALID_PROGRESS', 'Supply a valid lesson position.');
  const filter = { vendor: req.vendorId, lesson: lesson._id, contentVersion };
  const update = { $max: { positionSeconds }, ...(complete ? { $min: { completedAt: new Date() } } : {}) };
  let row;
  try { row = await LearningProgress.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: false }); }
  catch (error) {
    if (error.code !== 11000) throw error;
    row = await LearningProgress.findOneAndUpdate(filter, update, { new: true });
  }
  res.json({ positionSeconds: row.positionSeconds, completedAt: row.completedAt ?? null });
}));
