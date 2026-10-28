import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { requireAdminAuth, requireAnyPermission, requirePermission } from '../middleware/requireAdminAuth.js';
import { CorePolicy } from '../models/CorePolicy.js';
import { CorePolicyRevision } from '../models/CorePolicyRevision.js';
import { AdminAuditLog } from '../models/AdminAuditLog.js';
import { auditContext } from '../utils/audit.js';

const router = express.Router();
const POLICY_FIELDS = ['minimumReservationPercent', 'vendorCancellationPenaltyPercent', 'customerCancellationRefunds', 'settlementCondition', 'settlementDelayDays'];
const ALLOWED_SETTLEMENT_CONDITIONS = ['EVENT_DATE_PASSED', 'DELIVERABLES_UPLOADED', 'MANUAL_APPROVAL_REQUIRED'];
router.use(requireAdminAuth);

function canonical(values) {
  const sort = (value) => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]))
    : value;
  return JSON.stringify(sort(values));
}

function hash(values) {
  return crypto.createHash('sha256').update(canonical(values)).digest('hex');
}

function validateValues(input, fallback = {}) {
  const values = { ...fallback };
  for (const field of POLICY_FIELDS) if (Object.hasOwn(input || {}, field)) values[field] = input[field];
  if (!Object.hasOwn(input || {}, 'minimumReservationPercent') && fallback.minimumReservationPercent == null) return { error: 'INVALID_ADVANCE_PERCENT' };
  values.minimumReservationPercent = Number(values.minimumReservationPercent);
  if (!Number.isFinite(values.minimumReservationPercent) || values.minimumReservationPercent < 1 || values.minimumReservationPercent > 100) return { error: 'INVALID_ADVANCE_PERCENT' };

  values.vendorCancellationPenaltyPercent = Number(values.vendorCancellationPenaltyPercent ?? 0);
  if (!Number.isFinite(values.vendorCancellationPenaltyPercent) || values.vendorCancellationPenaltyPercent < 0 || values.vendorCancellationPenaltyPercent > 100) return { error: 'INVALID_PENALTY_PERCENT' };

  const refundSource = values.customerCancellationRefunds;
  const refunds = refundSource instanceof Map ? Object.fromEntries(refundSource) : refundSource;
  if (!refunds || typeof refunds !== 'object' || Array.isArray(refunds)) return { error: 'INVALID_REFUND_POLICY' };
  const refundTiers = Object.fromEntries(Object.entries(refunds).map(([days, percent]) => [days, Number(percent)]));
  if (!Object.keys(refundTiers).length || Object.entries(refundTiers).some(([days, percent]) => !/^\d+$/.test(days) || Number(days) > 365 || !Number.isFinite(percent) || percent < 0 || percent > 100)) return { error: 'INVALID_REFUND_POLICY' };
  values.customerCancellationRefunds = refundTiers;

  values.settlementCondition ||= 'EVENT_DATE_PASSED';
  if (!ALLOWED_SETTLEMENT_CONDITIONS.includes(values.settlementCondition)) return { error: 'INVALID_SETTLEMENT_CONDITION' };
  values.settlementDelayDays = Number(values.settlementDelayDays ?? 0);
  if (!Number.isInteger(values.settlementDelayDays) || values.settlementDelayDays < 0 || values.settlementDelayDays > 365) return { error: 'INVALID_SETTLEMENT_DELAY' };
  return { values };
}

async function activeRevision(category, at = new Date()) {
  return CorePolicyRevision.findOne({ category, status: { $in: ['APPROVED', 'SCHEDULED'] }, effectiveFrom: { $lte: at } })
    .sort({ effectiveFrom: -1, version: -1 }).lean();
}

async function auditRequired(req, { action, targetId, fromState = null, toState = null, reason }) {
  await AdminAuditLog.create({
    ...auditContext(req), action, targetType: 'CorePolicyRevision', targetId: String(targetId), fromState, toState, reason,
  });
}

function validId(id) { return mongoose.isValidObjectId(id); }

async function createDraft(req, res) {
  const category = String(req.params.category || '').trim();
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (!category || category.length > 80) return res.status(400).json({ error: 'INVALID_POLICY_CATEGORY' });
  if (!reason) return res.status(400).json({ error: 'POLICY_CHANGE_REASON_REQUIRED' });
  const { values, error } = validateValues(req.body);
  if (error) return res.status(400).json({ error });
  const effectiveFrom = req.body?.effectiveFrom ? new Date(req.body.effectiveFrom) : new Date();
  if (Number.isNaN(effectiveFrom.getTime()) || effectiveFrom < new Date(Date.now() - 60_000)) return res.status(400).json({ error: 'INVALID_EFFECTIVE_DATE' });

  const existingWorkflow = await CorePolicyRevision.exists({ category, status: { $in: ['PENDING_APPROVAL', 'SCHEDULED'] } });
  if (existingWorkflow) return res.status(409).json({ error: 'POLICY_REVISION_ALREADY_PENDING' });
  const active = await activeRevision(category);
  const baseActiveVersion = active?.version || 0;
  if (req.body.expectedActiveVersion != null && Number(req.body.expectedActiveVersion) !== baseActiveVersion) return res.status(409).json({ error: 'POLICY_VERSION_CONFLICT', activeVersion: baseActiveVersion });
  const latest = await CorePolicyRevision.findOne({ category }).sort({ version: -1 }).select('version').lean();
  const version = Math.max(latest?.version || 0, active?.version || 0) + 1;
  const revision = await CorePolicyRevision.create({
    category, version, values, contentHash: hash(values), baseActiveVersion, effectiveFrom, reason,
    createdBy: req.admin._id, createdByEmail: req.admin.email,
  });
  try {
    await auditRequired(req, { action: 'FINANCE_POLICY_DRAFT_CREATED', targetId: revision._id, toState: revision.toObject(), reason });
  } catch (err) {
    await CorePolicyRevision.deleteOne({ _id: revision._id, status: 'DRAFT' });
    throw err;
  }
  return res.status(201).json({ ok: true, revision });
}

router.get('/', requireAnyPermission('settings.read', 'financePolicies.read'), async (req, res, next) => {
  try {
    const [policies, revisions] = await Promise.all([
      CorePolicy.find().sort({ category: 1 }).lean(),
      CorePolicyRevision.find().sort({ category: 1, version: -1 }).limit(500).lean(),
    ]);
    res.json({ ok: true, count: policies.length, policies, revisions });
  } catch (err) { next(err); }
});

router.get('/revisions', requireAnyPermission('settings.read', 'financePolicies.read'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = String(req.query.category).trim();
    if (req.query.status) filter.status = String(req.query.status).toUpperCase();
    const revisions = await CorePolicyRevision.find(filter).sort({ updatedAt: -1 }).limit(Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)).lean();
    res.json({ ok: true, revisions });
  } catch (err) { next(err); }
});

router.get('/:category', requireAnyPermission('settings.read', 'financePolicies.read'), async (req, res, next) => {
  try {
    const category = String(req.params.category || '').trim();
    const [policy, revisions] = await Promise.all([
      CorePolicy.findOne({ category }), CorePolicyRevision.find({ category }).sort({ version: -1 }).limit(50).lean(),
    ]);
    res.json({ ok: true, policy, revisions });
  } catch (err) { next(err); }
});

// Legacy route now creates a draft only; it can no longer activate policy in one step.
router.put('/:category', requirePermission('financePolicies.update'), async (req, res, next) => {
  try { await createDraft(req, res); } catch (err) { next(err); }
});

router.post('/:category/drafts', requirePermission('financePolicies.update'), async (req, res, next) => {
  try { await createDraft(req, res); } catch (err) { next(err); }
});

router.put('/revisions/:id', requirePermission('financePolicies.update'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'INVALID_POLICY_REVISION_ID' });
    const revision = await CorePolicyRevision.findById(req.params.id);
    if (!revision) return res.status(404).json({ error: 'POLICY_REVISION_NOT_FOUND' });
    if (revision.status !== 'DRAFT') return res.status(409).json({ error: 'POLICY_REVISION_IMMUTABLE' });
    if (String(revision.createdBy) !== String(req.admin._id)) return res.status(403).json({ error: 'FORBIDDEN' });
    const { values, error } = validateValues(req.body, revision.values);
    if (error) return res.status(400).json({ error });
    const reason = String(req.body?.reason ?? revision.reason).trim().slice(0, 500);
    if (!reason) return res.status(400).json({ error: 'POLICY_CHANGE_REASON_REQUIRED' });
    const effectiveFrom = req.body?.effectiveFrom ? new Date(req.body.effectiveFrom) : revision.effectiveFrom;
    if (Number.isNaN(effectiveFrom.getTime()) || effectiveFrom < new Date(Date.now() - 60_000)) return res.status(400).json({ error: 'INVALID_EFFECTIVE_DATE' });
    const before = revision.toObject();
    revision.values = values; revision.reason = reason; revision.effectiveFrom = effectiveFrom; revision.contentHash = hash(values);
    await revision.save();
    await auditRequired(req, { action: 'FINANCE_POLICY_DRAFT_EDITED', targetId: revision._id, fromState: before, toState: revision.toObject(), reason });
    res.json({ ok: true, revision });
  } catch (err) { next(err); }
});

router.post('/revisions/:id/submit', requirePermission('financePolicies.update'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'INVALID_POLICY_REVISION_ID' });
    const revision = await CorePolicyRevision.findById(req.params.id);
    if (!revision) return res.status(404).json({ error: 'POLICY_REVISION_NOT_FOUND' });
    if (revision.status !== 'DRAFT') return res.status(409).json({ error: 'POLICY_REVISION_NOT_DRAFT' });
    if (String(revision.createdBy) !== String(req.admin._id)) return res.status(403).json({ error: 'FORBIDDEN' });
    const { error } = validateValues(revision.values);
    if (error) return res.status(400).json({ error });
    if (hash(revision.values) !== revision.contentHash) return res.status(409).json({ error: 'POLICY_REVISION_CONTENT_CHANGED' });
    const before = revision.toObject();
    revision.status = 'PENDING_APPROVAL'; revision.submittedAt = new Date(); revision.submittedHash = revision.contentHash;
    await revision.save();
    try { await auditRequired(req, { action: 'FINANCE_POLICY_SUBMITTED', targetId: revision._id, fromState: before, toState: revision.toObject(), reason: revision.reason }); }
    catch (err) { revision.status = 'DRAFT'; revision.submittedAt = null; revision.submittedHash = ''; await revision.save(); throw err; }
    res.json({ ok: true, revision });
  } catch (err) { next(err); }
});

router.post('/revisions/:id/approve', requirePermission('financePolicies.approve'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'INVALID_POLICY_REVISION_ID' });
    const revision = await CorePolicyRevision.findById(req.params.id);
    if (!revision) return res.status(404).json({ error: 'POLICY_REVISION_NOT_FOUND' });
    if (revision.status !== 'PENDING_APPROVAL') return res.status(409).json({ error: 'POLICY_REVISION_NOT_PENDING' });
    if (String(revision.createdBy) === String(req.admin._id)) return res.status(403).json({ error: 'MAKER_CHECKER_REQUIRED' });
    if (hash(revision.values) !== revision.submittedHash || revision.contentHash !== revision.submittedHash) return res.status(409).json({ error: 'POLICY_REVISION_CONTENT_CHANGED' });
    const active = await activeRevision(revision.category);
    if ((active?.version || 0) !== revision.baseActiveVersion) return res.status(409).json({ error: 'POLICY_REVISION_STALE', activeVersion: active?.version || 0 });
    const otherScheduled = await CorePolicyRevision.exists({ category: revision.category, status: 'SCHEDULED', _id: { $ne: revision._id } });
    if (otherScheduled) return res.status(409).json({ error: 'POLICY_REVISION_ALREADY_SCHEDULED' });
    const now = new Date();
    const status = revision.effectiveFrom > now ? 'SCHEDULED' : 'APPROVED';
    const before = revision.toObject();
    const updated = await CorePolicyRevision.findOneAndUpdate(
      { _id: revision._id, status: 'PENDING_APPROVAL', submittedHash: revision.contentHash },
      { $set: { status, approvedBy: req.admin._id, approvedByEmail: req.admin.email, approvedAt: now } },
      { new: true },
    );
    if (!updated) return res.status(409).json({ error: 'POLICY_REVISION_CHANGED' });
    try { await auditRequired(req, { action: 'FINANCE_POLICY_APPROVED', targetId: updated._id, fromState: before, toState: updated.toObject(), reason: String(req.body?.reason || updated.reason).trim() }); }
    catch (err) { await CorePolicyRevision.updateOne({ _id: updated._id, status }, { $set: { status: 'PENDING_APPROVAL', approvedBy: null, approvedByEmail: '', approvedAt: null } }); throw err; }
    res.json({ ok: true, revision: updated, message: status === 'SCHEDULED' ? 'Policy approved and scheduled for its effective date.' : 'Policy approved and active.' });
  } catch (err) { next(err); }
});

router.post('/revisions/:id/reject', requirePermission('financePolicies.approve'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'INVALID_POLICY_REVISION_ID' });
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (!reason) return res.status(400).json({ error: 'POLICY_REJECTION_REASON_REQUIRED' });
    const revision = await CorePolicyRevision.findById(req.params.id);
    if (!revision) return res.status(404).json({ error: 'POLICY_REVISION_NOT_FOUND' });
    if (revision.status !== 'PENDING_APPROVAL') return res.status(409).json({ error: 'POLICY_REVISION_NOT_PENDING' });
    if (String(revision.createdBy) === String(req.admin._id)) return res.status(403).json({ error: 'MAKER_CHECKER_REQUIRED' });
    const before = revision.toObject();
    const updated = await CorePolicyRevision.findOneAndUpdate(
      { _id: revision._id, status: 'PENDING_APPROVAL', submittedHash: revision.contentHash },
      { $set: { status: 'REJECTED', rejectedBy: req.admin._id, rejectedByEmail: req.admin.email, rejectedAt: new Date(), decisionReason: reason } },
      { new: true },
    );
    if (!updated) return res.status(409).json({ error: 'POLICY_REVISION_CHANGED' });
    try { await auditRequired(req, { action: 'FINANCE_POLICY_REJECTED', targetId: updated._id, fromState: before, toState: updated.toObject(), reason }); }
    catch (err) { await CorePolicyRevision.updateOne({ _id: updated._id, status: 'REJECTED' }, { $set: { status: 'PENDING_APPROVAL', rejectedBy: null, rejectedByEmail: '', rejectedAt: null, decisionReason: '' } }); throw err; }
    res.json({ ok: true, revision: updated });
  } catch (err) { next(err); }
});

export default router;
