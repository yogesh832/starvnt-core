import { verifyAdminAccessToken } from '../utils/tokens.js';
import { AdminUser } from '../models/AdminUser.js';
import { AdminSession } from '../models/AdminSession.js';

/**
 * Authentication gate for the INTERNAL ADMIN domain.
 * Rejects any token not signed by the admin domain secret with the admin
 * audience — including external customer/vendor tokens (401).
 *
 * Centralized authorization pipeline for every admin API:
 *   1. validate session    → 401 if invalid
 *   2. load role           → req.admin
 *   3. (route-level) SUPER_ADMIN allow-all, else permission check → 403
 */
export async function requireAdminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });

    let payload;
    try {
      payload = verifyAdminAccessToken(token);
    } catch {
      // Wrong secret, wrong audience, expired, external token — all 401.
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }

    const [admin, session] = await Promise.all([
      AdminUser.findById(payload.sub),
      AdminSession.findById(payload.sid),
    ]);

    if (!admin || admin.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'ACCOUNT_DISABLED_OR_MISSING' });
    }
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'SESSION_REVOKED' });
    }

    req.admin = admin;
    req.adminSession = session;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Permission gate. SUPER_ADMIN → allow-all. Otherwise the admin must hold
 * every listed permission explicitly → 403 FORBIDDEN otherwise.
 */
export function requirePermission(...required) {
  return (req, res, next) => {
    const admin = req.admin;
    if (!admin) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    if (admin.role === 'SUPER_ADMIN') return next();

    const missing = required.filter((p) => !admin.permissions.includes(p));
    if (missing.length) {
      return res.status(403).json({ error: 'FORBIDDEN', missing });
    }
    next();
  };
}

/** Role gate — e.g. only SUPER_ADMIN may create/disable admins. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    next();
  };
}
