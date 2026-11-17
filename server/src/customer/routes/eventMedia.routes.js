import { Router } from 'express';
import multer from 'multer';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { asyncHandler as h, badRequest, HttpError, jsonErrorHandler } from '../utils/http.js';
import { customerActor } from '../services/eventCircle.service.js';
import { createEventMedia, listEventMedia, moderateEventMedia, eventMemory, changeEventPublication, getEventMediaAccess, publicEventMedia } from '../services/eventMedia.service.js';
import { eventMediaStorage } from '../services/eventMediaStorage.service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 8, fieldSize: 4000 } });
export const eventMediaRoutes = Router();
export const publicEventMediaRoutes = Router();
const actor = req => customerActor(req.externalUser._id);

export async function streamEventMedia(req, res, actor, options = {}) {
  const { storage } = await getEventMediaAccess(req.params.assetId, actor, options);
  const range = req.headers.range;
  if (range && !/^bytes=\d+-\d*$/.test(range)) throw badRequest('INVALID_RANGE', 'Request one media range.');
  const response = await eventMediaStorage.read(storage, range);
  if (!response.ok || !response.body) throw new HttpError(502, 'MEDIA_UNAVAILABLE', 'This media is temporarily unavailable. Please retry.');
  res.status(response.status).set({
    'Content-Type': storage.mime, 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline',
  });
  for (const name of ['content-length', 'content-range', 'accept-ranges']) {
    const value = response.headers.get(name);
    if (value) res.set(name, value);
  }
  await pipeline(Readable.fromWeb(response.body), res);
}
eventMediaRoutes.get('/events/:id/media', h(async (req, res) => res.json(await listEventMedia(actor(req), req.params.id, req.query))));
eventMediaRoutes.post('/events/:id/media', (req, res, next) => upload.single('file')(req, res, error => next(error ? badRequest('INVALID_MEDIA', 'Choose one photo or MP4 video up to 20 MB.') : null)), h(async (req, res) => {
  res.status(201).json(await createEventMedia(actor(req), req.params.id, req.body || {}, req.file));
}));
eventMediaRoutes.post('/events/:id/media/:assetId/review', h(async (req, res) => res.json(await moderateEventMedia(actor(req), req.params.id, req.params.assetId, req.body || {}))));
eventMediaRoutes.get('/events/:id/memory', h(async (req, res) => res.json(await eventMemory(actor(req), req.params.id))));
eventMediaRoutes.put('/events/:id/publication', h(async (req, res) => res.json(await changeEventPublication(actor(req), req.params.id, req.body || {}))));
eventMediaRoutes.get('/event-media/:assetId/file', h((req, res) => streamEventMedia(req, res, actor(req))));
publicEventMediaRoutes.get('/:token/:view', h(async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await publicEventMedia(req.params.token, req.params.view));
}));
publicEventMediaRoutes.get('/:token/:view/media/:assetId/file', h((req, res) => streamEventMedia(req, res, null, { shareToken: req.params.token, view: req.params.view })));
publicEventMediaRoutes.use(jsonErrorHandler);
