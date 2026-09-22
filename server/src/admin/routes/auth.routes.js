import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../../config.js';
import { AdminUser } from '../models/AdminUser.js';
import { AdminSession } from '../models/AdminSession.js';
import { verifyPassword } from '../../external/utils/password.js';
import {
  signAdminAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../utils/tokens.js';
import { recordAudit } from '../utils/audit.js';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';

const router = Router();

// Brute-force protection on the admin auth surface.
const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.adminAuthRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED' },
});

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSecure ? 'none' : 'lax',
    maxAge: config.adminRefreshTtlDays * 24 * 60 * 60 * 1000,
    path: '/api/admin/auth',
  };
}

async function createSession(admin, req) {
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + config.adminRefreshTtlDays * 24 * 60 * 60 * 1000);
  const session = await AdminSession.create({
    admin: admin._id,
    refreshTokenHash: hashRefreshToken(refreshToken),
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
    expiresAt,
  });
  return { session, refreshToken };
}

// ── Admin Login ──────────────────────────────────────────────────────────────
router.post('/login', adminAuthLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'MISSING_FIELDS' });

    const normalized = String(email).toLowerCase();
    const admin = await AdminUser.findOne({ email: normalized }).select('+passwordHash');

    // Uniform failure — no account enumeration. External DB is never consulted.
    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      await recordAudit({
        actor: admin?._id || null,
        actorEmail: normalized,
        action: 'ADMIN_LOGIN_FAILED',
        targetType: 'AdminUser',
        targetId: admin ? String(admin._id) : '',
        reason: 'INVALID_CREDENTIALS',
        ip: req.ip,
        userAgent: req.headers['user-agent'] || '',
      });
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    if (admin.status !== 'ACTIVE') {
      await recordAudit({
        actor: admin._id,
        actorEmail: admin.email,
        action: 'ADMIN_LOGIN_FAILED',
        targetType: 'AdminUser',
        targetId: String(admin._id),
        reason: 'ACCOUNT_DISABLED',
        ip: req.ip,
        userAgent: req.headers['user-agent'] || '',
      });
      return res.status(401).json({ error: 'ACCOUNT_DISABLED' });
    }

    admin.lastLoginAt = new Date();
    await admin.save();

    const { session, refreshToken } = await createSession(admin, req);
    await recordAudit({
      actor: admin._id,
      actorEmail: admin.email,
      action: 'ADMIN_LOGIN_SUCCESS',
      targetType: 'AdminUser',
      targetId: String(admin._id),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
    });

    res.cookie(config.adminRefreshCookieName, refreshToken, refreshCookieOptions());
    return res.json({
      accessToken: signAdminAccessToken(admin, session._id),
      admin: admin.toSafeJSON(),
    });
  } catch (err) {
    next(err);
  }
});

// ── Refresh (rotation) ───────────────────────────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.[config.adminRefreshCookieName];
    if (!token) return res.status(200).json({ ok: false, error: 'NO_REFRESH_TOKEN' });

    const session = await AdminSession.findOne({ refreshTokenHash: hashRefreshToken(token) });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      res.clearCookie(config.adminRefreshCookieName, { path: '/api/admin/auth' });
      return res.status(200).json({ ok: false, error: 'SESSION_INVALID' });
    }

    const admin = await AdminUser.findById(session.admin);
    if (!admin || admin.status !== 'ACTIVE') {
      res.clearCookie(config.adminRefreshCookieName, { path: '/api/admin/auth' });
      return res.status(200).json({ ok: false, error: 'ACCOUNT_DISABLED_OR_MISSING' });
    }

    session.revokedAt = new Date();
    await session.save();
    const fresh = await createSession(admin, req);
    res.cookie(config.adminRefreshCookieName, fresh.refreshToken, refreshCookieOptions());
    return res.json({
      accessToken: signAdminAccessToken(admin, fresh.session._id),
      admin: admin.toSafeJSON(),
    });
  } catch (err) {
    next(err);
  }
});

// ── Logout ───────────────────────────────────────────────────────────────────
router.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.[config.adminRefreshCookieName];
    if (token) {
      await AdminSession.updateOne(
        { refreshTokenHash: hashRefreshToken(token), revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    }
    res.clearCookie(config.adminRefreshCookieName, { path: '/api/admin/auth' });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Me (role + effective permissions drive the admin UI) ─────────────────────
router.get('/me', requireAdminAuth, (req, res) => {
  res.json({ admin: req.admin.toSafeJSON() });
});

export default router;
