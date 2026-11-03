import crypto from 'node:crypto';
import { requireAdminAuth, requirePermission } from '../../admin/middleware/requireAdminAuth.js';

/**
 * Internal ops / admin endpoints: `x-internal-key` must match INTERNAL_API_KEY.
 * No key configured → the endpoints are off (503), never open.
 */
export function requireInternal(req, res, next) {
  if (req.headers.authorization) return requireAdminAuth(req, res, () => { req.internalActor = String(req.admin._id); next(); });
  if (process.env.NODE_ENV === 'production') return res.status(401).json({ error: 'ADMIN_IDENTITY_REQUIRED' });
  const expected = process.env.INTERNAL_API_KEY || '';
  if (!expected) return res.status(503).json({ error: 'INTERNAL_API_DISABLED', message: 'INTERNAL_API_KEY is not configured' });
  const given = String(req.headers['x-internal-key'] || '');
  const a = Buffer.from(crypto.createHash('sha256').update(given).digest('hex'));
  const b = Buffer.from(crypto.createHash('sha256').update(expected).digest('hex'));
  if (!given || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid internal key' });
  req.internalActor = 'development-internal-service';
  next();
}

export function requireInternalPermission(permission) {
  return (req, res, next) => req.admin ? requirePermission(permission)(req, res, next) : next();
}
