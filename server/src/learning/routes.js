import { createHash } from 'node:crypto';
import { Router } from 'express';
import { isObjectIdOrHexString } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { requireAdminAuth, requireAnyPermission, requirePermission } from '../admin/middleware/requireAdminAuth.js';
import { LearningLesson, LearningProgress, learningCategories } from './models.js';

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

function lessonFields(input) {
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
  return {
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
  return { publishAt: { $lte: at }, rightsReference: { $type: 'string', $ne: '' }, $or: [{ rightsExpiresAt: null }, { rightsExpiresAt: { $gt: at } }] };
}

function metadata(lesson) {
  return {
    id: String(lesson._id), title: lesson.title, category: lesson.category,
    objective: lesson.objective, hasVideo: Boolean(lesson.videoId), durationSeconds: lesson.durationSeconds,
    contentVersion: lesson.contentVersion, publishAt: lesson.publishAt,
  };
}

function adminView(lesson) {
  return {
    ...metadata(lesson), revision: lesson.revision, content: lesson.content, resources: lesson.resources,
    videoId: lesson.videoId, captions: lesson.captions, rightsReference: lesson.rightsReference,
    rightsExpiresAt: lesson.rightsExpiresAt, history: lesson.history,
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
  res.json({ categories: learningCategories, lessons: rows.slice(0, 100).map(adminView), truncated: rows.length > 100 });
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
      $setOnInsert: { ...fields, requestHash, history: [{ actor: createdBy, action: 'DRAFT_CREATED', at: new Date(), revision: 1 }] },
    }, { upsert: true, new: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    row = await LearningLesson.findOne(filter);
  }
  if (!row || row.requestHash !== requestHash) throw fail('REQUEST_CHANGED', 'This draft request already used different content.', 409);
  res.status(201).json({ lesson: adminView(row) });
}));

function expectedRevision(req) {
  const revision = req.body?.revision;
  if (!Number.isSafeInteger(revision) || revision < 1) throw fail('REVISION_REQUIRED', 'Reload the lesson and try again.');
  return revision;
}

async function updateLesson(req, filter, update, action, reason, evidence = {}) {
  const revision = expectedRevision(req);
  const row = await LearningLesson.findOneAndUpdate({ _id: lessonId(req), revision, ...filter }, {
    ...update,
    $inc: { ...update.$inc, revision: 1 },
    $push: { history: { actor: String(req.admin._id), action, at: new Date(), reason, revision: revision + 1, ...evidence } },
  }, { new: true, runValidators: true });
  if (!row) throw fail('LESSON_CHANGED', 'The lesson changed. Reload it before trying again.', 409);
  return row;
}

adminLearningRoutes.put('/:id', requirePermission('academy.edit'), h(async (req, res) => {
  const fields = lessonFields(req.body);
  const row = await updateLesson(req, { publishAt: null }, {
    $set: { ...fields, rightsReference: '' }, $unset: { rightsExpiresAt: 1 }, $inc: { contentVersion: 1 },
  }, 'DRAFT_EDITED');
  res.json({ lesson: adminView(row) });
}));

adminLearningRoutes.post('/:id/publication', requirePermission('academy.publish'), h(async (req, res) => {
  const revision = expectedRevision(req);
  const reason = text(req.body.reason, 500, true);
  const action = req.body.action;
  if (action === 'WITHDRAW') {
    const row = await updateLesson(req, { publishAt: { $type: 'date' } }, { $unset: { publishAt: 1 } }, 'WITHDRAWN', reason);
    return res.json({ lesson: adminView(row) });
  }
  if (action !== 'PUBLISH') throw fail('INVALID_PUBLICATION_ACTION', 'Choose publish or withdraw.');
  const rightsReference = text(req.body.rightsReference, 200, true);
  const publishAt = req.body.publishAt ? isoDate(req.body.publishAt) : new Date();
  const rightsExpiresAt = req.body.rightsExpiresAt ? isoDate(req.body.rightsExpiresAt) : null;
  if (rightsExpiresAt && rightsExpiresAt <= Math.max(Date.now(), publishAt.getTime())) {
    throw fail('RIGHTS_EXPIRED', 'The rights must be valid when the lesson is available.');
  }
  const draft = await LearningLesson.findOne({ _id: lessonId(req), revision, publishAt: null }).lean();
  if (!draft) throw fail('LESSON_CHANGED', 'The draft changed. Reload it before publishing.', 409);
  if (draft.videoId) await requirePrivateVideo(draft.videoId);
  const row = await updateLesson(req, { publishAt: null }, {
    $set: { publishAt, rightsReference, rightsExpiresAt },
  }, 'PUBLICATION_APPROVED', reason, {
    rightsReference, rightsExpiresAt, publishAt, contentVersion: draft.contentVersion, videoId: draft.videoId,
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
  const rows = await LearningLesson.find(visibility()).select('title objective category publishAt videoId durationSeconds contentVersion')
    .sort({ publishAt: -1, _id: -1 }).limit(101).lean();
  const lessons = rows.slice(0, 100);
  const progress = await LearningProgress.find({ vendor: req.vendorId, lesson: { $in: lessons.map(row => row._id) } })
    .select('lesson contentVersion positionSeconds completedAt').lean();
  const byVersion = new Map(progress.map(row => [`${row.lesson}:${row.contentVersion}`, row]));
  res.json({
    categories: learningCategories, truncated: rows.length > 100,
    lessons: lessons.map(row => {
      const current = byVersion.get(`${row._id}:${row.contentVersion}`);
      return { ...metadata(row), positionSeconds: current?.positionSeconds ?? 0, completedAt: current?.completedAt ?? null };
    }),
  });
}));
vendorLearningRoutes.get('/:id', h(async (req, res) => {
  const lesson = await currentLesson(req);
  res.json({ lesson: { ...metadata(lesson), content: lesson.content, resources: lesson.resources, captions: lesson.captions } });
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
