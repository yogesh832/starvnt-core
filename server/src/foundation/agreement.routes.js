import { Router } from 'express';
import mongoose from 'mongoose';
import { AgreementVersion, VendorAgreement } from './agreement.models.js';
import { createAgreementVersion, transitionAgreementVersion, assignVendorAgreement, acceptVendorAgreement } from './agreement.service.js';
import { requireAdminAuth, requirePermission } from '../admin/middleware/requireAdminAuth.js';
import { recordBusinessAudit } from '../admin/utils/audit.js';

const h = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const summaries = '-snapshot.body -acceptance.requestHash -acceptance.requestKey';
const notFound = () => Object.assign(new Error('Agreement not found.'), { statusCode: 404, code: 'AGREEMENT_NOT_FOUND' });
function publicRow(row) {
  const value = row.toObject ? row.toObject() : { ...row };
  delete value.requestKey; delete value.requestHash;
  if (value.acceptance) { delete value.acceptance.requestKey; delete value.acceptance.requestHash; }
  if (value.history) value.history = value.history.map(({ requestHash, ...entry }) => entry);
  return value;
}
export const vendorAgreementRoutes = Router();
vendorAgreementRoutes.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
// Mounted only after the existing Vendor authentication/owner resolver.
vendorAgreementRoutes.get('/', h(async (req, res) => {
  const rows = await VendorAgreement.find({ vendor: req.vendorId }).select(summaries).sort({ createdAt: -1 }).limit(101).lean();
  res.json({ ok: true, agreements: rows.slice(0, 100).map(publicRow), hasMore: rows.length > 100, paymentEnforcement: 'NOT_ACTIVATED_PENDING_APPROVED_POLICY_AND_CUSTOMER_INTEGRATION' });
}));
vendorAgreementRoutes.get('/:id', h(async (req, res) => {
  const row = mongoose.isValidObjectId(req.params.id) && await VendorAgreement.findOne({ _id: req.params.id, vendor: req.vendorId }).select('-acceptance.requestHash -acceptance.requestKey').lean();
  if (!row) throw notFound();
  await recordBusinessAudit({ actorId: String(req.externalUser._id), actorType: 'EXTERNAL', organizationId: String(req.vendorId), action: 'AGREEMENT_REVIEW_READ', resourceType: 'AGREEMENT', resourceId: String(row._id), source: 'AGREEMENT_CORE' });
  res.json({ ok: true, agreement: publicRow(row) });
}));
vendorAgreementRoutes.get('/:id/document', h(async (req, res) => {
  const row = mongoose.isValidObjectId(req.params.id) && await VendorAgreement.findOne({ _id: req.params.id, vendor: req.vendorId }).lean();
  if (!row) throw notFound();
  await recordBusinessAudit({ actorId: String(req.externalUser._id), actorType: 'EXTERNAL', organizationId: String(req.vendorId), action: 'AGREEMENT_DOCUMENT_READ', resourceType: 'AGREEMENT', resourceId: String(row._id), source: 'AGREEMENT_CORE' });
  res.set('Cache-Control', 'private, no-store').set('Content-Disposition', `attachment; filename="agreement-${row._id}-v${row.snapshot.version}.txt"`).type('text/plain');
  res.send(`${row.snapshot.title}\nVersion: ${row.snapshot.version}\nDocument hash: ${row.snapshot.contentHash}\nScope hash: ${row.scopeHash}\nState: ${row.state}\nAccepted at: ${row.acceptance?.acceptedAt?.toISOString() || 'Not accepted'}\n\n${row.snapshot.body}\n\nBound scope:\n${JSON.stringify(row.scope, null, 2)}`);
}));
vendorAgreementRoutes.post('/:id/accept', h(async (req, res) => res.json({ ok: true, agreement: publicRow(await acceptVendorAgreement(req.vendorId, req.externalUser._id, req.params.id, req.body)) })));

export const adminAgreementRoutes = Router();
adminAgreementRoutes.use(requireAdminAuth);
adminAgreementRoutes.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
adminAgreementRoutes.get('/versions', requirePermission('vendorCompliance.read'), h(async (_req, res) => {
  const rows = await AgreementVersion.find().sort({ createdAt: -1 }).limit(101).lean();
  res.json({ ok: true, versions: rows.slice(0, 100).map(publicRow), hasMore: rows.length > 100 });
}));
adminAgreementRoutes.post('/versions', requirePermission('vendorCompliance.edit'), h(async (req, res) => res.status(201).json({ ok: true, version: publicRow(await createAgreementVersion(req.body, req.admin._id)) })));
for (const [path, action, permission] of [['submit-review', 'SUBMIT_REVIEW', 'edit'], ['approve', 'APPROVE', 'review'], ['publish', 'PUBLISH', 'publish'], ['archive', 'ARCHIVE', 'publish']]) {
  adminAgreementRoutes.post(`/versions/:id/${path}`, requirePermission(`vendorCompliance.${permission}`), h(async (req, res) => res.json({ ok: true, version: publicRow(await transitionAgreementVersion(req.params.id, { ...req.body, action }, req.admin._id)) })));
}
adminAgreementRoutes.post('/assignments', requirePermission('vendorCompliance.assign'), h(async (req, res) => res.status(201).json({ ok: true, agreement: publicRow(await assignVendorAgreement(req.body, req.admin._id)) })));
adminAgreementRoutes.get('/assignments/:id/evidence', requirePermission('vendorCompliance.export'), h(async (req, res) => {
  const row = mongoose.isValidObjectId(req.params.id) && await VendorAgreement.findById(req.params.id).lean();
  if (!row) throw notFound();
  await recordBusinessAudit({ actorId: String(req.admin._id), actorType: 'ADMIN', action: 'AGREEMENT_EVIDENCE_EXPORTED', resourceType: 'AGREEMENT', resourceId: String(row._id), source: 'AGREEMENT_CORE', organizationId: String(row.vendor) });
  const evidence = {
    schemaVersion: 'vendor-agreement-evidence/1', exportedAt: new Date(),
    agreementId: row._id, vendorId: row.vendor, versionId: row.versionId,
    relationshipType: row.relationshipType, state: row.state, revision: row.revision,
    documentVersion: row.snapshot.version, documentHash: row.snapshot.contentHash, scopeHash: row.scopeHash,
    effectiveFrom: row.snapshot.effectiveFrom, expiresAt: row.snapshot.expiresAt,
    scope: { bookingId: row.scope.bookingId || null, amountMinor: row.scope.amountMinor ?? null, currency: row.scope.currency || null, quotationHash: row.scope.quotationHash || null, policyHash: row.scope.policyHash || null },
    acceptance: row.state === 'ACCEPTED' ? { actorId: row.acceptance.actor, acceptedAt: row.acceptance.acceptedAt, method: row.acceptance.method, authorityConfirmed: row.acceptance.authorityConfirmed, documentHash: row.acceptance.documentHash, scopeHash: row.acceptance.scopeHash } : null,
    history: row.history.map(entry => ({ actorId: entry.actor, action: entry.action, at: entry.at, revision: entry.revision })),
    redactions: ['documentText', 'signatoryFullName', 'requestKeysAndHashes', 'freeTextScope', 'freeTextReasons'],
    limitations: ['Acceptance evidence does not prove legal sufficiency, identity verification, payment capture or settlement.'],
  };
  res.set('Content-Disposition', `attachment; filename="agreement-evidence-${row._id}.json"`).type('application/json').send(JSON.stringify(evidence, null, 2));
}));
adminAgreementRoutes.get('/assignments', requirePermission('vendorCompliance.read'), h(async (req, res) => {
  const filter = {};
  if (req.query.vendorId) {
    if (!mongoose.isValidObjectId(req.query.vendorId)) throw Object.assign(new Error('Invalid vendor ID.'), { statusCode: 400 });
    filter.vendor = req.query.vendorId;
  }
  if (req.query.state) {
    if (!['ASSIGNED', 'ACCEPTED', 'WITHDRAWN'].includes(req.query.state)) throw Object.assign(new Error('Invalid agreement state.'), { statusCode: 400 });
    filter.state = req.query.state;
  }
  const rows = await VendorAgreement.find(filter).select(`${summaries} -acceptance.signatoryFullName`).sort({ createdAt: -1 }).limit(101).lean();
  res.json({ ok: true, agreements: rows.slice(0, 100).map(publicRow), hasMore: rows.length > 100 });
}));
