import { Router } from 'express';
import { AdminAuditLog } from '../models/AdminAuditLog.js';
import { requireAdminAuth, requirePermission } from '../middleware/requireAdminAuth.js';

const router = Router();

// Audit log listing — newest first, filterable by action / actor / target.
router.get('/', requireAdminAuth, requirePermission('audit.read'), async (req, res, next) => {
  try {
    const { action, actor, targetType, targetId, limit = 50, before } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (actor) filter.actor = actor;
    if (targetType) filter.targetType = targetType;
    if (targetId) filter.targetId = targetId;
    if (before) filter.createdAt = { $lt: new Date(before) };

    const logs = await AdminAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200));

    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

export default router;
