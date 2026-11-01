import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { requireCustomer } from '../customer/middleware/requireCustomer.js';
import { requireAdminAuth, requirePermission } from '../admin/middleware/requireAdminAuth.js';
import { requireExternalAuth, requireAccountType } from '../external/middleware/requireExternalAuth.js';
import { asyncHandler as h, jsonErrorHandler } from '../customer/utils/http.js';
import { CustomerEvent } from '../customer/models/index.js';
import * as s from './service.js';
import { requestConcept } from './ai.js';
import { ProposalConceptJob } from './models.js';

const adminActor = req => ({ id: req.admin._id, role: req.admin.role });
export const proposalCustomerRoutes = Router();
proposalCustomerRoutes.use('/events/:eventId/proposal', requireCustomer, (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
proposalCustomerRoutes.get('/events/:eventId/proposal', h(async (req, res) => res.json(await s.customerWorkspace(req.externalUser._id, req.params.eventId))));
proposalCustomerRoutes.post('/events/:eventId/proposal/preferences', h(async (req, res) => { await s.saveDesignPreference(req.externalUser._id, req.params.eventId, req.body); res.json({ ok: true }); }));
proposalCustomerRoutes.post('/events/:eventId/proposal/decision', h(async (req, res) => { await s.customerDecision(req.externalUser._id, req.params.eventId, req.body); res.json({ ok: true }); }));
proposalCustomerRoutes.post('/events/:eventId/proposal/ask', rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false }), h(async (req, res) => res.json(await s.explain(req.externalUser._id, req.params.eventId, req.body.question))));
proposalCustomerRoutes.get('/events/:eventId/proposal/versions/:versionId/pdf', h(async (req, res) => {
  const bytes = await s.download(req.externalUser._id, req.params.eventId, req.params.versionId);
  res.set({ 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'attachment; filename="starvnt-event-proposal.pdf"' }).send(bytes);
}));
proposalCustomerRoutes.use(jsonErrorHandler);

export const proposalAdminRoutes = Router();
proposalAdminRoutes.use(requireAdminAuth);
proposalAdminRoutes.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } });
proposalAdminRoutes.post('/assets/upload', requirePermission('proposals.update'), upload.single('file'), h(async (req, res) => {
  if (!req.file || !['image/png', 'image/jpeg'].includes(req.file.mimetype)) return res.status(400).json({ error: 'PNG_OR_JPEG_REQUIRED' });
  if (!cloudinary.config().cloud_name || !cloudinary.config().api_key || !cloudinary.config().api_secret) return res.status(503).json({ error: 'IMAGE_STORAGE_UNAVAILABLE', message: 'STARVNT image storage is not configured.' });
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder: 'starvnt_proposals', resource_type: 'image', allowed_formats: ['jpg', 'png'], format: 'jpg', transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 85 }] }, (err, result) => err ? reject(err) : resolve(result)).end(req.file.buffer);
  });
  res.status(201).json({ url: result.secure_url });
}));
proposalAdminRoutes.get('/', requirePermission('proposals.read'), h(async (req, res) => {
  const events = await CustomerEvent.find({ status: { $nin: ['cancelled', 'completed'] } }).sort({ updatedAt: -1 }).limit(100).select('title eventType eventDate city guestCount customer').lean();
  res.json({ events });
}));
proposalAdminRoutes.get('/:eventId', requirePermission('proposals.read'), h(async (req, res) => res.json(await s.adminWorkspace(req.params.eventId))));
proposalAdminRoutes.get('/:eventId/concepts', requirePermission('proposals.read'), h(async (req, res) => {
  const { source } = await s.adminWorkspace(req.params.eventId);
  const jobs = await ProposalConceptJob.find({ event: source.event.id }).sort({ createdAt: -1 }).limit(20).select('-prompt -requestHash').lean();
  res.json({ jobs: jobs.map(j => ({ ...j, stale: j.sourceHash !== source.hash })) });
}));
proposalAdminRoutes.post('/:eventId/concepts', requirePermission('proposals.update'), rateLimit({ windowMs: 60_000, limit: 3, standardHeaders: 'draft-7', legacyHeaders: false }), h(async (req, res) => {
  const { source, dossier } = await s.adminWorkspace(req.params.eventId);
  const job = await requestConcept(source, dossier, adminActor(req), req.body || {});
  res.status(202).json({ job: { _id: job._id, status: job.status, asset: job.asset } });
}));
proposalAdminRoutes.put('/:eventId/draft', requirePermission('proposals.update'), h(async (req, res) => { await s.saveDraft(req.params.eventId, adminActor(req), req.body); res.json({ ok: true }); }));
proposalAdminRoutes.post('/:eventId/agreements', requirePermission('proposals.update'), h(async (req, res) => { await s.sendAgreement(req.params.eventId, adminActor(req), req.body); res.json({ ok: true }); }));
proposalAdminRoutes.post('/:eventId/commercial-approval', requirePermission('proposals.approve'), h(async (req, res) => { await s.approveCommercial(req.params.eventId, adminActor(req), req.body); res.json({ ok: true }); }));
proposalAdminRoutes.post('/:eventId/generate', requirePermission('proposals.generate'), rateLimit({ windowMs: 60_000, limit: 3, standardHeaders: 'draft-7', legacyHeaders: false }), h(async (req, res) => res.json({ version: await s.generate(req.params.eventId, adminActor(req), req.body) })));
proposalAdminRoutes.use(jsonErrorHandler);

export const proposalVendorRoutes = Router();
proposalVendorRoutes.use(requireExternalAuth, requireAccountType('VENDOR'));
proposalVendorRoutes.get('/', h(async (req, res) => res.json(await s.vendorAgreements(req.externalUser.vendorOrganization))));
proposalVendorRoutes.post('/:eventId/decision', h(async (req, res) => {
  await s.decideAgreement(req.externalUser.vendorOrganization, req.params.eventId, { id: req.externalUser._id, role: 'VENDOR' }, req.body);
  res.json({ ok: true });
}));
proposalVendorRoutes.use(jsonErrorHandler);
