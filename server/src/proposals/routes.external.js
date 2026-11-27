import express from 'express';
import { requireExternalAuth, requireAccountType } from '../external/middleware/requireExternalAuth.js';
import { VendorAgreement } from './models.js';
import { agreementForVendor, vendorDecideAgreement } from './agreement.service.js';
import { listCustomerProposals, getCustomerVersion, decideAsCustomer, raiseChangeRequest, customerPdfVersion, logAccess } from './proposal.service.js';
import { readStoredPdf } from './render.service.js';
import { askAboutProposal } from './assistant.service.js';
import { ensureCustomerPreview } from './preview.service.js';
import multer from 'multer';
import { VisualAsset } from './models.js';
import { uploadCustomerReference, readAssetFile } from './assets.service.js';
import { customerVisibleVersion } from './proposal.service.js';
import { handle, proposalError } from './utils.js';

const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] || '' });

// ── Vendor: own agreements only ───────────────────────────────────────────
export const vendorAgreementRoutes = express.Router();
vendorAgreementRoutes.use('/proposal-agreements', requireExternalAuth, requireAccountType('VENDOR'));
const vendorOrg = (req) => {
  const id = req.externalUser.vendorOrganization;
  if (!id) throw proposalError('NO_VENDOR_ORGANIZATION', 'No vendor organization on this account.', 403);
  return id;
};

vendorAgreementRoutes.get('/proposal-agreements', handle(async (req, res) => {
  const rows = await VendorAgreement.find({ vendor: vendorOrg(req), status: { $ne: 'DRAFT' } }).sort({ updatedAt: -1 }).limit(200).lean();
  res.json({ agreements: rows.map(agreementForVendor) });
}));
vendorAgreementRoutes.get('/proposal-agreements/:id', handle(async (req, res) => {
  const a = await VendorAgreement.findOne({ _id: req.params.id, vendor: vendorOrg(req), status: { $ne: 'DRAFT' } }).lean();
  if (!a) throw proposalError('AGREEMENT_NOT_FOUND', 'Agreement not found.', 404);
  res.json({ agreement: agreementForVendor(a) });
}));
vendorAgreementRoutes.post('/proposal-agreements/:id/decision', handle(async (req, res) => {
  const a = await vendorDecideAgreement(req.params.id, vendorOrg(req), req.body || {}, { actor: String(req.externalUser._id) });
  res.json({ agreement: agreementForVendor(a) });
}));

// ── Customer: own proposals only ──────────────────────────────────────────
export const customerProposalRoutes = express.Router();
customerProposalRoutes.use('/proposals', requireExternalAuth, requireAccountType('CUSTOMER'));
const me = (req) => req.externalUser._id;

customerProposalRoutes.post('/proposals/preview', handle(async (req, res) => {
  if (!req.body?.eventId) throw proposalError('EVENT_REQUIRED', 'Choose an event.', 400);
  res.json(await ensureCustomerPreview(me(req), req.body.eventId));
}));
customerProposalRoutes.get('/proposals', handle(async (req, res) => {
  res.json({ proposals: await listCustomerProposals(me(req)) });
}));
customerProposalRoutes.get('/proposals/:id', handle(async (req, res) => {
  res.json(await getCustomerVersion(me(req), req.params.id, null, ctx(req)));
}));
customerProposalRoutes.get('/proposals/:id/versions/:version', handle(async (req, res) => {
  res.json(await getCustomerVersion(me(req), req.params.id, req.params.version, ctx(req)));
}));
customerProposalRoutes.post('/proposals/:id/versions/:version/decision', handle(async (req, res) => {
  const v = await decideAsCustomer(me(req), req.params.id, req.params.version, req.body || {}, ctx(req));
  res.json({
    version: v.version,
    status: v.status,
    // Explicit so every client shows it: approval is not a booking.
    bookingConfirmed: false,
    nextStep: v.status === 'CUSTOMER_APPROVED' ? 'Continue to booking and payment to confirm your event.' : null,
  });
}));
customerProposalRoutes.get('/proposals/:id/versions/:version/pdf', handle(async (req, res) => {
  const { proposal, version } = await customerPdfVersion(me(req), req.params.id, req.params.version);
  const pdf = await readStoredPdf(version.pdf.storageKey);
  await logAccess({ proposal: proposal._id, version: version.version, actorType: 'customer', actorId: String(me(req)), action: 'DOWNLOAD', ...ctx(req) });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename="${proposal.proposalNumber}-v${version.version}.pdf"`, 'Cache-Control': 'private, no-store' });
  res.send(pdf);
}));
customerProposalRoutes.get('/proposals/:id/versions/:version/assets/:assetId', handle(async (req, res) => {
  // Only images that are part of this customer's visible proposal version.
  const { version } = await customerVisibleVersion(me(req), req.params.id, req.params.version);
  const inSnapshot = Object.values(version.snapshot.visuals || {}).some((list) => list.some((v) => v.assetId === req.params.assetId));
  const asset = inSnapshot && await VisualAsset.findOne({ _id: req.params.assetId, status: 'APPROVED' }).lean();
  if (!asset) throw proposalError('ASSET_NOT_FOUND', 'Image not found.', 404);
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300' }).send(await readAssetFile(asset));
}));
customerProposalRoutes.post('/proposals/:id/ask', handle(async (req, res) => {
  res.json(await askAboutProposal(me(req), req.params.id, req.body?.question));
}));
customerProposalRoutes.post('/proposals/:id/versions/:version/change-requests', handle(async (req, res) => {
  res.status(201).json({ changeRequest: await raiseChangeRequest(me(req), req.params.id, req.params.version, req.body || {}) });
}));

// ── Customer reference images (reviewed by STARVNT before any proposal uses them) ──
export const customerReferenceRoutes = express.Router();
const referenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
customerReferenceRoutes.use(['/events/:eventId/references', '/references'], requireExternalAuth, requireAccountType('CUSTOMER'));

customerReferenceRoutes.get('/events/:eventId/references', handle(async (req, res) => {
  const rows = await VisualAsset.find({ 'links.event': req.params.eventId, 'links.customer': me(req), sourceType: 'CUSTOMER_REFERENCE' }).sort({ createdAt: -1 }).lean();
  res.json({ references: rows.map((a) => ({ id: a._id, caption: a.caption, status: a.status, category: a.tags?.category, createdAt: a.createdAt })) });
}));
customerReferenceRoutes.post('/events/:eventId/references', referenceUpload.single('file'), handle(async (req, res) => {
  const asset = await uploadCustomerReference({ buffer: req.file?.buffer, eventId: req.params.eventId, category: req.body?.category, caption: req.body?.caption }, me(req));
  res.status(201).json({ reference: { id: asset._id, caption: asset.caption, status: asset.status, category: asset.tags?.category } });
}));
customerReferenceRoutes.get('/references/:assetId/file', handle(async (req, res) => {
  const asset = await VisualAsset.findOne({ _id: req.params.assetId, 'links.customer': me(req), sourceType: 'CUSTOMER_REFERENCE' }).lean();
  if (!asset) throw proposalError('ASSET_NOT_FOUND', 'Image not found.', 404);
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300' }).send(await readAssetFile(asset));
}));
