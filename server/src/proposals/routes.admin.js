import express from 'express';
import multer from 'multer';
import { requireAdminAuth, requirePermission } from '../admin/middleware/requireAdminAuth.js';
import { CustomerEvent } from '../customer/models/index.js';
import { ExternalUser } from '../external/models/ExternalUser.js';
import { EventManifest, VendorAgreement, Proposal, ProposalVersion, ProposalChangeRequest, ProposalAccessLog, CommercialApproval, VisualAsset } from './models.js';
import { uploadAdminAsset, generateConcept, decideAsset, readAssetFile, assetForAdmin } from './assets.service.js';
import { buildManifest, freezeManifest } from './manifest.service.js';
import { createAgreementFromQuote, updateAgreementDraft, sendAgreement, reviseAgreement } from './agreement.service.js';
import { prepareCommercialApproval, submitCommercialApproval, decideCommercialApproval } from './commercial.service.js';
import { evaluateGate, gateSummary } from './gate.service.js';
import { createPreliminary, requestFinalGeneration, publishVersion } from './proposal.service.js';
import { previewHtml, readStoredPdf, renderProposalVersion } from './render.service.js';
import { handle, proposalError } from './utils.js';

const router = express.Router();
router.use(requireAdminAuth);
const actor = (req) => String(req.admin._id);

// ── Readiness + history ───────────────────────────────────────────────────
router.get('/events/:eventId/readiness', requirePermission('proposals.read'), handle(async (req, res) => {
  res.json(gateSummary(await evaluateGate(req.params.eventId)));
}));

router.get('/proposals', requirePermission('proposals.read'), handle(async (req, res) => {
  const proposals = await Proposal.find().sort({ updatedAt: -1 }).limit(Math.min(200, Number(req.query.limit) || 50)).lean();
  const rows = await Promise.all(proposals.map(async (p) => {
    const [event, customer, latest] = await Promise.all([
      CustomerEvent.findById(p.event).select('eventType title eventDate city guestCount').lean(),
      ExternalUser.findById(p.customer).select('fullName').lean(),
      ProposalVersion.findOne({ proposal: p._id }).sort({ version: -1 }).select('version kind status').lean(),
    ]);
    const gate = await evaluateGate(p.event);
    return {
      proposalId: p._id, proposalNumber: p.proposalNumber, eventId: p.event, customer: customer?.fullName || '',
      eventType: event?.eventType, eventTitle: event?.title, eventDate: event?.eventDate, city: event?.city, guestCount: event?.guestCount,
      readiness: gate.state, latestVersion: latest?.version || 0, latestStatus: latest?.status || null,
      publishedVersion: p.publishedVersion, latestApprovedVersion: p.latestApprovedVersion,
    };
  }));
  res.json({ proposals: rows });
}));

router.get('/proposals/:id', requirePermission('proposals.read'), handle(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id).lean();
  if (!proposal) throw proposalError('PROPOSAL_NOT_FOUND', 'Proposal not found.', 404);
  const versions = await ProposalVersion.find({ proposal: proposal._id }).sort({ version: -1 }).select('-snapshot').lean();
  res.json({ proposal, versions });
}));

router.get('/versions/:id', requirePermission('proposals.read'), handle(async (req, res) => {
  const version = await ProposalVersion.findById(req.params.id).lean();
  if (!version) throw proposalError('PROPOSAL_VERSION_NOT_FOUND', 'Version not found.', 404);
  res.json({ version });
}));

router.get('/versions/:id/preview', requirePermission('proposals.read'), handle(async (req, res) => {
  res.type('html').set('Content-Security-Policy', "default-src 'none'; img-src data: https://res.cloudinary.com; style-src 'unsafe-inline'").send(await previewHtml(req.params.id));
}));
router.get('/versions/:id/pdf', requirePermission('proposals.read'), handle(async (req, res) => {
  const version = await ProposalVersion.findById(req.params.id).lean();
  if (!version?.pdf?.storageKey) throw proposalError('PDF_NOT_FOUND', 'This version has no PDF yet.', 404);
  const pdf = await readStoredPdf(version.pdf.storageKey);
  await ProposalAccessLog.create({ proposal: version.proposal, version: version.version, actorType: 'admin', actorId: actor(req), action: 'DOWNLOAD', ip: req.ip });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="proposal-v${version.version}.pdf"`, 'Cache-Control': 'private, no-store' }).send(pdf);
}));
router.post('/versions/:id/render', requirePermission('proposals.compose'), handle(async (req, res) => {
  res.json(await renderProposalVersion(req.params.id));
}));

router.get('/proposals/:id/access-log', requirePermission('proposals.read'), handle(async (req, res) => {
  res.json({ entries: await ProposalAccessLog.find({ proposal: req.params.id }).sort({ createdAt: -1 }).limit(500).lean() });
}));

// ── Manifest ──────────────────────────────────────────────────────────────
router.get('/events/:eventId/manifests', requirePermission('proposals.read'), handle(async (req, res) => {
  res.json({ manifests: await EventManifest.find({ event: req.params.eventId }).sort({ version: -1 }).lean() });
}));
router.post('/events/:eventId/manifest', requirePermission('proposals.compose'), handle(async (req, res) => {
  res.status(201).json({ manifest: await buildManifest(req.params.eventId, { actor: actor(req) }) });
}));
router.post('/manifests/:id/freeze', requirePermission('proposals.compose'), handle(async (req, res) => {
  res.json({ manifest: await freezeManifest(req.params.id, { actor: actor(req) }) });
}));

// ── Vendor agreements ─────────────────────────────────────────────────────
router.get('/events/:eventId/agreements', requirePermission('agreements.read'), handle(async (req, res) => {
  res.json({ agreements: await VendorAgreement.find({ event: req.params.eventId }).sort({ category: 1, version: -1 }).lean() });
}));
router.post('/agreements', requirePermission('agreements.manage'), handle(async (req, res) => {
  res.status(201).json({ agreement: await createAgreementFromQuote(req.body || {}, { actor: actor(req) }) });
}));
router.patch('/agreements/:id', requirePermission('agreements.manage'), handle(async (req, res) => {
  res.json({ agreement: await updateAgreementDraft(req.params.id, req.body || {}, { actor: actor(req) }) });
}));
router.post('/agreements/:id/send', requirePermission('agreements.manage'), handle(async (req, res) => {
  res.json({ agreement: await sendAgreement(req.params.id, { actor: actor(req) }) });
}));
router.post('/agreements/:id/revise', requirePermission('agreements.manage'), handle(async (req, res) => {
  res.status(201).json({ agreement: await reviseAgreement(req.params.id, { actor: actor(req), reason: req.body?.reason }) });
}));

// ── Commercial approval (maker-checker) ───────────────────────────────────
router.get('/events/:eventId/commercial', requirePermission('commercial.read'), handle(async (req, res) => {
  res.json({ records: await CommercialApproval.find({ event: req.params.eventId }).sort({ createdAt: -1 }).lean() });
}));
router.post('/events/:eventId/commercial', requirePermission('commercial.prepare'), handle(async (req, res) => {
  res.status(201).json({ record: await prepareCommercialApproval(req.params.eventId, req.body || {}, req.admin) });
}));
router.post('/commercial/:id/submit', requirePermission('commercial.prepare'), handle(async (req, res) => {
  res.json({ record: await submitCommercialApproval(req.params.id, req.admin) });
}));
router.post('/commercial/:id/decision', requirePermission('commercial.approve'), handle(async (req, res) => {
  res.json({ record: await decideCommercialApproval(req.params.id, req.body || {}, req.admin) });
}));

// ── Generation + publishing ───────────────────────────────────────────────
router.post('/events/:eventId/preliminary', requirePermission('proposals.compose'), handle(async (req, res) => {
  res.status(201).json({ version: await createPreliminary(req.params.eventId, { actor: actor(req), theme: req.body?.theme }) });
}));
router.post('/events/:eventId/generate', requirePermission('proposals.compose'), handle(async (req, res) => {
  const version = await requestFinalGeneration(req.params.eventId, { actor: actor(req), idempotencyKey: req.get('Idempotency-Key'), theme: req.body?.theme });
  res.status(202).json({ version });
}));
router.post('/versions/:id/publish', requirePermission('proposals.publish'), handle(async (req, res) => {
  res.json({ version: await publishVersion(req.params.id, { actor: actor(req) }) });
}));

// ── Visual assets (vendor photos, STARVNT photos, AI concepts, customer references) ──
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
router.get('/assets', requirePermission('assets.read'), handle(async (req, res) => {
  const filter = {};
  if (req.query.eventId) filter['links.event'] = req.query.eventId;
  if (req.query.vendorId) filter['links.vendor'] = req.query.vendorId;
  if (req.query.status) filter.status = String(req.query.status);
  const rows = await VisualAsset.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ assets: rows.map(assetForAdmin) });
}));
router.post('/assets', requirePermission('assets.manage'), upload.single('file'), handle(async (req, res) => {
  const b = req.body || {};
  const asset = await uploadAdminAsset({ buffer: req.file?.buffer, sourceType: b.sourceType, category: b.category, eventId: b.eventId || null, vendorId: b.vendorId || null, caption: b.caption, licence: b.licence }, req.admin);
  res.status(201).json({ asset: assetForAdmin(asset) });
}));
router.post('/assets/generate', requirePermission('assets.manage'), handle(async (req, res) => {
  const asset = await generateConcept({ eventId: req.body?.eventId, category: req.body?.category, extra: req.body?.prompt }, req.admin);
  res.status(201).json({ asset: assetForAdmin(asset) });
}));
router.post('/assets/:id/decision', requirePermission('assets.manage'), handle(async (req, res) => {
  res.json({ asset: assetForAdmin(await decideAsset(req.params.id, req.body || {}, req.admin)) });
}));
router.get('/assets/:id/file', requirePermission('assets.read'), handle(async (req, res) => {
  const asset = await VisualAsset.findById(req.params.id).lean();
  if (!asset) throw proposalError('ASSET_NOT_FOUND', 'Image not found.', 404);
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300' }).send(await readAssetFile(asset));
}));

// ── Change requests ───────────────────────────────────────────────────────
router.get('/change-requests', requirePermission('proposals.read'), handle(async (req, res) => {
  const filter = req.query.status ? { status: String(req.query.status) } : {};
  res.json({ changeRequests: await ProposalChangeRequest.find(filter).sort({ createdAt: -1 }).limit(200).lean() });
}));
router.post('/change-requests/:id/status', requirePermission('proposals.compose'), handle(async (req, res) => {
  const status = String(req.body?.status || '');
  if (!['IN_REVIEW', 'RESOLVED', 'REJECTED'].includes(status)) throw proposalError('INVALID_STATUS', 'Status must be IN_REVIEW, RESOLVED or REJECTED.', 400);
  const cr = await ProposalChangeRequest.findById(req.params.id);
  if (!cr) throw proposalError('CHANGE_REQUEST_NOT_FOUND', 'Change request not found.', 404);
  cr.history.push({ from: cr.status, to: status, by: actor(req), reason: req.body?.note || '' });
  cr.status = status;
  if (req.body?.resolutionVersion) cr.resolutionVersion = Number(req.body.resolutionVersion);
  if (req.body?.note) cr.resolutionNote = String(req.body.note).slice(0, 1000);
  await cr.save();
  res.json({ changeRequest: cr });
}));

export default router;
