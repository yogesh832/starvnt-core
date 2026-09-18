import { AdminAuditLog } from '../models/AdminAuditLog.js';

/**
 * Write an audit-log entry. Audit failures are logged but never break the
 * request they describe. Duplicate idempotency keys are silently skipped.
 */
export async function recordAudit(entry) {
  try {
    await AdminAuditLog.create(entry);
  } catch (err) {
    if (err?.code === 11000) return; // idempotencyKey already recorded
    console.error('[audit] failed to record', entry?.action, err.message);
  }
}

/** Convenience: pull request context into audit shape. */
export function auditContext(req) {
  return {
    ip: req.ip || '',
    userAgent: req.headers['user-agent'] || '',
    actor: req.admin?._id || null,
    actorEmail: req.admin?.email || '',
  };
}
