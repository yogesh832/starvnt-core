import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import sharp from 'sharp';
import rateLimit from 'express-rate-limit';
import { requireCustomer } from '../customer/middleware/requireCustomer.js';
import { requireAdminAuth, requirePermission } from '../admin/middleware/requireAdminAuth.js';
import { asyncHandler as h } from '../customer/utils/http.js';
import { foundationError as fail } from '../foundation/consent.service.js';
import { withVendorSchedule } from '../external/services/scheduleLock.js';
import { CustomerEvent } from '../customer/models/index.js';
import { VendorService } from '../external/models/VendorService.js';
import { EventProposal, ProposalVisual, ProposalHandover } from './models.js';
import { proposalFor, listMessages, postMessage, handoverOptions, changeHandover } from './collaboration.js';
import { createProposal, editProposal, transition, customerDTO, readiness, hash, text, snapshotEvent, validateSuppliers, withProposalDecision } from './service.js';
import { renderProposal } from './pdf.js';

export const adminProposals = Router(), customerProposals = Router(), vendorProposals = Router();
for (const router of [adminProposals, customerProposals, vendorProposals]) router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
adminProposals.use(requireAdminAuth, requirePermission('proposals.read'));
customerProposals.use(requireCustomer);
const discussionLimit = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
const adminActor = req => ({ domain: 'ADMIN', id: req.admin._id });
const customerActor = req => ({ domain: 'CUSTOMER', id: req.externalUser._id });
const vendorActor = req => ({ domain: 'VENDOR', id: req.externalUser._id, vendor: req.vendorId });
adminProposals.get('/handover/assigned', requirePermission('proposals.handover'), h(async (req, res) => {
  if (req.query.before !== undefined && (typeof req.query.before !== 'string' || !mongoose.isValidObjectId(req.query.before))) throw fail('INVALID_CURSOR', 'Use a valid handover cursor.');
  const found = await ProposalHandover.find({ assignee: req.admin._id, ...(req.query.before ? { _id: { $lt: req.query.before } } : {}) }).sort({ _id: -1 }).limit(51).lean(), rows = found.slice(0, 50);
  const proposals = await EventProposal.find({ _id: { $in: rows.map(r => r.proposal) } }).select('manifest.title manifest.eventDate version').lean();
  res.json({ handovers: rows.map(r => ({ _id: r._id, state: r.state, proposal: proposals.find(p => String(p._id) === String(r.proposal)) || null })), hasMore: found.length > 50, next: rows.at(-1)?._id || null });
}));
for (const [router, actor, guards] of [[adminProposals, adminActor, [requirePermission('proposals.discuss')]], [customerProposals, customerActor, []], [vendorProposals, vendorActor, []]]) {
  router.get('/:id/messages', ...guards, h(async (req, res) => res.json(await listMessages(req.params.id, actor(req), req.query))));
  router.post('/:id/messages', ...guards, discussionLimit, h(async (req, res) => res.status(201).json({ message: await postMessage(req.params.id, actor(req), req.body) })));
}
adminProposals.get('/:id/handover', requirePermission('proposals.handover'), h(async (req, res) => {
  const p = await proposalFor(req.params.id, adminActor(req)); res.json({ handover: await ProposalHandover.findOne({ proposal: p._id }), ...await handoverOptions(p), currentAdmin: String(req.admin._id) });
}));
for (const [path, action] of [['prepare', 'PREPARE'], ['release', 'RELEASE'], ['accept', 'ACCEPT'], ['task', 'TASK'], ['complete', 'COMPLETE']]) adminProposals.post(`/:id/handover/${path}`, requirePermission('proposals.handover'), h(async (req, res) => res.json({ handover: await changeHandover(req.params.id, adminActor(req), req.body, action) })));
async function find(id, query = {}, pdf = false) {
  const p = mongoose.isValidObjectId(id) && await EventProposal.findOne({ _id: id, ...query }).select(pdf ? '+pdf' : '-pdf');
  if (!p) throw fail('PROPOSAL_NOT_FOUND', 'Proposal unavailable.', 404); return p;
}
const staffDTO = p => ({ ...p.toObject(), pdf: undefined, readiness: readiness(p) });
const sendPDF = (res, p) => res.type('pdf').set('Content-Disposition', `attachment; filename="STARVNT-proposal-v${p.version}.pdf"`).send(p.pdf);
async function visualsFor(p) {
  const visuals = p.frozenSnapshot?.visuals || p.visuals || [], rows = [];
  for (const v of visuals) { const row = await ProposalVisual.findById(v.asset).select('+bytes'); if (!row || row.hash !== v.hash || hash(row.bytes) !== v.hash) throw fail('VISUAL_UNAVAILABLE', 'An approved visual is unavailable.', 409); rows.push({ ...v.toObject?.() || v, bytes: row.bytes }); }
  return rows;
}
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 5 * 1024 * 1024 } });
adminProposals.post('/:id/visuals', requirePermission('proposals.manage'), (req, res, next) => upload.single('file')(req, res, err => { if (err) err.statusCode = 400; next(err); }), h(async (req, res) => {
  const p = await withVendorSchedule(`PROPOSAL:${req.params.id}`, async lease => {
    const row = await find(req.params.id);
    if (row.state !== 'DRAFT' || Number(req.body.revision) !== row.revision || row.visuals.length >= 12) throw fail('VISUAL_LOCKED', 'Refresh an editable draft; at most 12 visuals are allowed.', 409);
    if (req.body.rightsConfirmed !== 'true' || !['VENDOR_PORTFOLIO', 'CUSTOMER_REFERENCE', 'AI_CONCEPT', 'LICENSED'].includes(req.body.source) || !req.file) throw fail('VISUAL_RIGHTS_REQUIRED', 'Supply an authorized visual and its source.');
    const title = text(req.body.title, 160, true), attribution = text(req.body.attribution, 500, true);
    let bytes;
    try { const image = sharp(req.file.buffer, { limitInputPixels: 25000000, animated: false }); const meta = await image.metadata(); if (!['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages || 1) !== 1) throw new Error(); bytes = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(); } catch { throw fail('INVALID_VISUAL', 'Upload a single JPEG, PNG or WebP image up to 5 MB.'); }
    await lease(); const asset = await ProposalVisual.create({ proposal: row._id, bytes, hash: hash(bytes), title, source: req.body.source, attribution, uploadedBy: String(req.admin._id), rightsConfirmedAt: new Date() });
    row.visuals.push({ asset: asset._id, title, source: asset.source, attribution, hash: asset.hash }); row.revision++; row.history.push({ actor: String(req.admin._id), action: 'VISUAL_ADDED', hash: asset.hash }); await lease(); await row.save(); return row;
  }); res.status(201).json({ proposal: staffDTO(p) });
}));
adminProposals.delete('/:id/visuals/:asset', requirePermission('proposals.manage'), h(async (req, res) => {
  const p = await withVendorSchedule(`PROPOSAL:${req.params.id}`, async lease => { const row = await find(req.params.id); if (row.state !== 'DRAFT' || req.body.revision !== row.revision) throw fail('VISUAL_LOCKED', 'Refresh an editable draft.', 409); row.visuals = row.visuals.filter(v => String(v.asset) !== req.params.asset); row.revision++; row.history.push({ actor: String(req.admin._id), action: 'VISUAL_REMOVED' }); await lease(); await row.save(); return row; }); res.json({ proposal: staffDTO(p) });
}));
adminProposals.get('/', h(async (_req, res) => res.json({ proposals: (await EventProposal.find().sort({ createdAt: -1 }).limit(100)).map(staffDTO) })));
adminProposals.get('/options', h(async (_req, res) => res.json({ events: await CustomerEvent.find({ status: { $nin: ['completed', 'cancelled'] } }).select('title city eventDate guestCount').limit(200).lean(), services: await VendorService.find({ status: 'ACTIVE' }).select('name vendor').limit(500).lean() })));
adminProposals.get('/:id', h(async (req, res) => res.json({ proposal: staffDTO(await find(req.params.id)) })));
adminProposals.post('/', requirePermission('proposals.manage'), h(async (req, res) => res.status(201).json({ proposal: staffDTO(await createProposal(req.body.event, req.admin._id, req.body, req.body.from || null)) })));
adminProposals.patch('/:id', requirePermission('proposals.manage'), h(async (req, res) => res.json({ proposal: staffDTO(await editProposal(req.params.id, req.admin._id, req.body)) })));
for (const [path, action, permission] of [['freeze', 'FREEZE', 'approve'], ['quality', 'QUALITY', 'approve'], ['send', 'SEND', 'send']]) adminProposals.post(`/:id/${path}`, requirePermission(`proposals.${permission}`), h(async (req, res) => res.json({ proposal: staffDTO(await transition(req.params.id, req.admin._id, req.body, action)) })));
adminProposals.post('/:id/pdf', requirePermission('proposals.manage'), h(async (req, res) => {
  const p = await withVendorSchedule(`PROPOSAL:${req.params.id}`, async lease => {
    const row = await find(req.params.id, {}, true);
    if (row.state !== 'FROZEN' || !readiness(row).ready || row.snapshotHash !== hash(row.frozenSnapshot) || row.commercialApproval?.snapshotHash !== row.snapshotHash) throw fail('PDF_GATE', 'Freeze a ready, commercially approved snapshot first.', 409);
    if (row.revision !== req.body.revision) throw fail('STALE_REVISION', 'Refresh before generating.', 409);
    await validateSuppliers(row);
    if (!row.pdf) { row.pdf = await renderProposal({ ...row.frozenSnapshot, version: row.version, snapshotHash: row.snapshotHash }, false, await visualsFor(row)); row.pdfHash = hash(row.pdf); row.revision++; row.history.push({ actor: String(req.admin._id), action: 'PDF_GENERATED', hash: row.pdfHash }); await lease(); await row.save(); }
    return row;
  }); res.json({ proposal: staffDTO(p) });
}));
adminProposals.get('/:id/preview', h(async (req, res) => { const p = await find(req.params.id); res.type('pdf').send(await renderProposal({ ...p.toObject(), ...(p.frozenSnapshot || {}) }, true, await visualsFor(p))); }));
adminProposals.get('/:id/pdf', h(async (req, res) => { const p = await find(req.params.id, {}, true); if (!p.pdf || hash(p.pdf) !== p.pdfHash) throw fail('PDF_UNAVAILABLE', 'Generate the proposal PDF first.', 409); sendPDF(res, p); }));

customerProposals.get('/', h(async (req, res) => {
  const filter = { customer: req.externalUser._id, state: 'SENT' };
  if (req.query.eventId) {
    const eventId = String(req.query.eventId);
    if (!mongoose.isValidObjectId(eventId)) throw fail('INVALID_EVENT_ID', 'Choose a valid event.', 400);
    if (!await CustomerEvent.exists({ _id: eventId, customer: req.externalUser._id })) throw fail('EVENT_NOT_FOUND', 'Event not found.', 404);
    filter.event = eventId;
  }
  res.json({ proposals: (await EventProposal.find(filter).sort({ createdAt: -1 }).limit(100)).map(customerDTO) });
}));
customerProposals.get('/:id/pdf', h(async (req, res) => { const p = await find(req.params.id, { customer: req.externalUser._id, state: 'SENT' }, true); if (!p.pdf || hash(p.pdf) !== p.pdfHash) throw fail('PDF_UNAVAILABLE', 'PDF unavailable.', 409); sendPDF(res, p); }));
customerProposals.post('/:id/response', h(async (req, res) => {
  const p = await withProposalDecision(req.params.id, async lease => {
    const row = await find(req.params.id, { customer: req.externalUser._id, state: 'SENT' });
    const decision = req.body.decision, message = text(req.body.message || '', 2000);
    if (!['APPROVED', 'DECLINED', 'CHANGES_REQUESTED'].includes(decision) || req.body.snapshotHash !== row.snapshotHash || req.body.pdfHash !== row.pdfHash) throw fail('INVALID_RESPONSE', 'Review this exact proposal version first.', 409);
    if (decision !== 'APPROVED' && !message) throw fail('REASON_REQUIRED', 'Please explain the changes or decline.');
    if (row.response?.decision) { if (row.response.decision === decision && row.response.message === message) return row; throw fail('RESPONSE_RECORDED', 'A response is already recorded. Request a new proposal version.', 409); }
    const current = await snapshotEvent(row.event);
    if (String(current.customer) !== String(row.customer) || (decision === 'APPROVED' && (!readiness(row).ready || hash(current.manifest) !== hash(row.manifest)))) throw fail('PROPOSAL_EXPIRED', 'This proposal can no longer be approved. Please request a revised version.', 409);
    if (decision === 'APPROVED') await validateSuppliers(row);
    const newer = await EventProposal.exists({ event: row.event, state: 'SENT', version: { $gt: row.version } }); if (newer) throw fail('SUPERSEDED_PROPOSAL', 'Respond to the latest sent version.', 409);
    row.response = { decision, message, actor: String(req.externalUser._id), at: new Date(), snapshotHash: row.snapshotHash }; row.history.push({ actor: String(req.externalUser._id), action: `CUSTOMER_${decision}`, hash: row.snapshotHash }); row.revision++; await lease(); await row.save(); return row;
  }); res.json({ proposal: customerDTO(p), bookingConfirmed: false });
}));
// Mounted only after the existing authenticated owner/vendor-context middleware.
const vendorDTO = (p, vendor) => ({ _id: p._id, version: p.version, revision: p.revision, state: p.state, event: { eventType: p.manifest.eventType, eventDate: p.manifest.eventDate, city: p.manifest.city, guestCount: p.manifest.guestCount }, lines: p.lines.filter(l => String(l.vendor) === String(vendor)).map(l => ({ _id: l._id, name: l.name, description: l.description, quantity: l.quantity, vendorUnitCost: l.vendorUnitCost, agreement: l.agreement })) });
vendorProposals.get('/', h(async (req, res) => res.json({ proposals: (await EventProposal.find({ 'lines.vendor': req.vendorId }).sort({ createdAt: -1 }).limit(100)).map(p => vendorDTO(p, req.vendorId)) })));
vendorProposals.post('/:id/agreement', h(async (req, res) => {
  await find(req.params.id, { 'lines.vendor': req.vendorId });
  const p = await transition(req.params.id, req.externalUser._id, req.body, 'AGREEMENT', req.vendorId); res.json({ proposal: vendorDTO(p, req.vendorId) });
}));
