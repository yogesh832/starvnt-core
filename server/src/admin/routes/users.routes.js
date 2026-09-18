import { Router } from 'express';
import { AdminUser } from '../models/AdminUser.js';
import { AdminSession } from '../models/AdminSession.js';
import { invalidPermissions } from '../constants/permissions.js';
import { hashPassword, passwordIssues } from '../../external/utils/password.js';
import { requireAdminAuth, requireRole } from '../middleware/requireAdminAuth.js';
import { recordAudit, auditContext } from '../utils/audit.js';

const router = Router();

// Every route below: authenticated SUPER_ADMIN only. Only SUPER_ADMIN can
// create/manage admins in V1 — regular admins cannot, even with permissions.
router.use(requireAdminAuth, requireRole('SUPER_ADMIN'));

// ── List admins ──────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const admins = await AdminUser.find().sort({ createdAt: -1 });
    res.json({ admins: admins.map((a) => a.toSafeJSON()) });
  } catch (err) {
    next(err);
  }
});

// ── Create admin (role is forced to ADMIN — sole SUPER_ADMIN is seeded) ─────
router.post('/', async (req, res, next) => {
  try {
    const { fullName, email, password, permissions = [], reason = '', idempotencyKey } =
      req.body || {};
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }
    const issues = passwordIssues(password);
    if (issues.length) return res.status(400).json({ error: 'WEAK_PASSWORD', issues });

    const invalid = invalidPermissions(permissions);
    if (invalid.length) return res.status(400).json({ error: 'INVALID_PERMISSIONS', invalid });

    const normalized = String(email).toLowerCase();
    if (await AdminUser.findOne({ email: normalized })) {
      return res.status(409).json({ error: 'EMAIL_IN_USE' });
    }

    const admin = await AdminUser.create({
      fullName,
      email: normalized,
      passwordHash: await hashPassword(password),
      role: 'ADMIN',
      permissions,
      createdBy: req.admin._id,
    });

    await recordAudit({
      ...auditContext(req),
      action: 'ADMIN_CREATE',
      targetType: 'AdminUser',
      targetId: String(admin._id),
      toState: { email: admin.email, role: 'ADMIN', permissions },
      reason,
      idempotencyKey,
    });

    res.status(201).json({ admin: admin.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

// ── Update an admin's permissions (from → to recorded) ───────────────────────
router.patch('/:id/permissions', async (req, res, next) => {
  try {
    const { permissions, reason = '', idempotencyKey } = req.body || {};
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'PERMISSIONS_MUST_BE_ARRAY' });
    }
    const invalid = invalidPermissions(permissions);
    if (invalid.length) return res.status(400).json({ error: 'INVALID_PERMISSIONS', invalid });

    const admin = await AdminUser.findById(req.params.id);
    if (!admin) return res.status(404).json({ error: 'NOT_FOUND' });
    if (admin.role === 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'CANNOT_EDIT_SUPER_ADMIN' });
    }

    const fromState = [...admin.permissions];
    admin.permissions = permissions;
    await admin.save();

    await recordAudit({
      ...auditContext(req),
      action: 'PERMISSIONS_UPDATED',
      targetType: 'AdminUser',
      targetId: String(admin._id),
      fromState: { permissions: fromState },
      toState: { permissions },
      reason,
      idempotencyKey,
    });

    res.json({ admin: admin.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

// ── Disable admin → invalidate ALL active sessions server-side ───────────────
router.post('/:id/disable', async (req, res, next) => {
  try {
    const admin = await AdminUser.findById(req.params.id);
    if (!admin) return res.status(404).json({ error: 'NOT_FOUND' });
    if (admin.role === 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'CANNOT_DISABLE_SUPER_ADMIN' });
    }
    if (String(admin._id) === String(req.admin._id)) {
      return res.status(400).json({ error: 'CANNOT_DISABLE_SELF' });
    }
    if (admin.status === 'DISABLED') {
      return res.json({ admin: admin.toSafeJSON() }); // idempotent
    }

    const fromState = { status: admin.status };
    admin.status = 'DISABLED';
    await admin.save();
    await AdminSession.updateMany(
      { admin: admin._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    await recordAudit({
      ...auditContext(req),
      action: 'ADMIN_DISABLE',
      targetType: 'AdminUser',
      targetId: String(admin._id),
      fromState,
      toState: { status: 'DISABLED' },
      reason: req.body?.reason || '',
      idempotencyKey: req.body?.idempotencyKey,
    });

    res.json({ admin: admin.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

// ── Re-enable admin ──────────────────────────────────────────────────────────
router.post('/:id/enable', async (req, res, next) => {
  try {
    const admin = await AdminUser.findById(req.params.id);
    if (!admin) return res.status(404).json({ error: 'NOT_FOUND' });
    if (String(admin._id) === String(req.admin._id)) {
      return res.status(400).json({ error: 'CANNOT_MODIFY_SELF' });
    }
    if (admin.status === 'ACTIVE') return res.json({ admin: admin.toSafeJSON() });

    const fromState = { status: admin.status };
    admin.status = 'ACTIVE';
    await admin.save();

    await recordAudit({
      ...auditContext(req),
      action: 'ADMIN_ENABLE',
      targetType: 'AdminUser',
      targetId: String(admin._id),
      fromState,
      toState: { status: 'ACTIVE' },
      reason: req.body?.reason || '',
      idempotencyKey: req.body?.idempotencyKey,
    });

    res.json({ admin: admin.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

export default router;
