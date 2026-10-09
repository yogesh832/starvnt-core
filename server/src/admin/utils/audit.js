import { AdminAuditLog } from '../models/AdminAuditLog.js';
import { BusinessAuditLog } from '../models/BusinessAuditLog.js';

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

/**
 * Spec §38 Audit Engine:
 * Every critical state change records WHO, WHAT, WHEN, FROM_STATE, TO_STATE, WHY, SOURCE, AUTHORITY, REFERENCE_ID and IDEMPOTENCY_KEY.
 */
export async function recordBusinessAudit({
  who,
  actorId,
  actorType = 'SYSTEM',
  organizationId,
  action,
  resourceType,
  resourceId,
  referenceId,
  fromState,
  toState,
  why,
  source = 'CORE',
  authority = 'CORE_AUTHORITY',
  idempotencyKey,
  traceContext,
}) {
  try {
    await BusinessAuditLog.create({
      who: who || actorId || actorType,
      actorId,
      actorType,
      organizationId,
      action,
      resourceType,
      resourceId,
      referenceId,
      fromState,
      toState,
      why: why || action,
      source,
      authority,
      idempotencyKey,
      traceContext,
    });
  } catch (err) {
    if (err?.code === 11000) return; // Duplicate idempotency key safely skipped
    console.error('[business-audit] failed to record transition', action, err.message);
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
