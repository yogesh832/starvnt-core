import { Router } from 'express';
import { nativeAuthTransport } from '../../common/nativeAuthTransport.js';
import rateLimit from 'express-rate-limit';
import { config, devToolsAllowed } from '../../config.js';
import { AdminUser } from '../models/AdminUser.js';
import { AdminSession } from '../models/AdminSession.js';
import { hashPassword, verifyPassword } from '../../external/utils/password.js';
import { ALL_PERMISSIONS, rolePresetPermissions } from '../constants/permissions.js';
import {
  signAdminAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../utils/tokens.js';
import { recordAudit } from '../utils/audit.js';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';
import { decryptMfaSecret, encryptMfaSecret, generateMfaSecret, otpauthUrl, verifyMfaToken } from '../utils/mfa.js';

const router = Router();
router.use(nativeAuthTransport(config.adminRefreshCookieName));

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

function adminRequiresMfa(admin) {
  return Boolean(admin.mfaRequired || (admin.role === 'SUPER_ADMIN' && config.adminMfaRequiredForSuperAdmin));
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

const DEV_ADMIN_PROFILES = {
  'admin@starvnt.com': { role: 'SUPER_ADMIN', permissions: [] },
  'ops@starvnt.com': {
    role: 'ADMIN',
    roleKey: 'OPERATIONS_ADMIN',
    permissions: rolePresetPermissions('OPERATIONS_ADMIN'),
  },
  'finance@starvnt.com': {
    role: 'ADMIN',
    roleKey: 'FINANCE_ADMIN',
    permissions: rolePresetPermissions('FINANCE_ADMIN'),
  },
  'support@starvnt.com': {
    role: 'ADMIN',
    roleKey: 'SUPPORT_ADMIN',
    permissions: rolePresetPermissions('SUPPORT_ADMIN'),
  },
};


// ── Admin Dev Single-Click Auth Endpoint ────────────────────────────────────
router.post('/dev-auth', async (req, res, next) => {
  try {
    if (!devToolsAllowed()) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    const { email: requestedEmail, role } = req.body || {};
    const email = requestedEmail ? String(requestedEmail).toLowerCase() : 'admin@starvnt.com';
    const profile = DEV_ADMIN_PROFILES[email] || {
      role: role === 'SUPER_ADMIN' && email === 'admin@starvnt.com' ? 'SUPER_ADMIN' : 'ADMIN',
      roleKey: '',
      permissions: role === 'SUPER_ADMIN' && email === 'admin@starvnt.com' ? [] : ALL_PERMISSIONS.filter((p) => p !== 'roles.delete' && p !== 'permissions.manage'),
    };

    let admin = await AdminUser.findOne({ email });
    if (!admin) {
      admin = await AdminUser.create({
        email,
        fullName: email.startsWith('admin')
          ? 'Dev Super Admin'
          : email.startsWith('ops')
          ? 'Ops Operations Lead'
          : email.startsWith('finance')
          ? 'Finance & Ledger Head'
          : 'Support & Audit Officer',
        role: profile.role,
        roleKey: profile.roleKey || '',
        permissions: profile.permissions,
        passwordHash: await hashPassword('Password123!'),
      });
    } else if (config.enableDevTools && admin.email !== 'admin@starvnt.com') {
      admin.role = profile.role || 'ADMIN';
      admin.roleKey = profile.roleKey || '';
      admin.permissions = profile.permissions;
      await admin.save();
    }

    const { session, refreshToken } = await createSession(admin, req);
    res.cookie(config.adminRefreshCookieName, refreshToken, refreshCookieOptions());

    const accessToken = signAdminAccessToken(admin, session._id);
    res.json({
      ok: true,
      accessToken,
      admin: admin.toSafeJSON(),
      redirectTo: '/admin/dashboard'
    });
  } catch (err) {
    next(err);
  }
});

// ── Admin Login ──────────────────────────────────────────────────────────────
router.post('/login', adminAuthLimiter, async (req, res, next) => {
  try {
    const { email, password, mfaToken } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'MISSING_FIELDS' });

    const normalized = String(email).toLowerCase();
    const admin = await AdminUser.findOne({ email: normalized }).select('+passwordHash +mfaSecretEncrypted');

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
        requestId: req.requestId || '',
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
        requestId: req.requestId || '',
      });
      return res.status(401).json({ error: 'ACCOUNT_DISABLED' });
    }

    if (adminRequiresMfa(admin)) {
      if (!admin.mfaEnabled || !admin.mfaSecretEncrypted) {
        await recordAudit({
          actor: admin._id,
          actorEmail: admin.email,
          action: 'ADMIN_LOGIN_FAILED',
          targetType: 'AdminUser',
          targetId: String(admin._id),
          reason: 'MFA_NOT_CONFIGURED',
          ip: req.ip,
          userAgent: req.headers['user-agent'] || '',
          requestId: req.requestId || '',
        });
        return res.status(403).json({ error: 'MFA_SETUP_REQUIRED', message: 'Super Admin MFA must be configured before login.' });
      }
      const secret = decryptMfaSecret(admin.mfaSecretEncrypted);
      if (!verifyMfaToken(secret, mfaToken)) {
        await recordAudit({
          actor: admin._id,
          actorEmail: admin.email,
          action: 'ADMIN_LOGIN_FAILED',
          targetType: 'AdminUser',
          targetId: String(admin._id),
          reason: 'MFA_INVALID',
          ip: req.ip,
          userAgent: req.headers['user-agent'] || '',
          requestId: req.requestId || '',
        });
        return res.status(401).json({ error: 'MFA_REQUIRED', message: 'Enter a valid 6-digit authenticator code.' });
      }
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
      requestId: req.requestId || '',
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

// ── Admin MFA setup ──────────────────────────────────────────────────────────
router.post('/mfa/setup', requireAdminAuth, async (req, res, next) => {
  try {
    const admin = await AdminUser.findById(req.admin._id).select('+mfaSecretEncrypted');
    if (!admin) return res.status(404).json({ error: 'ADMIN_NOT_FOUND' });
    const secret = generateMfaSecret();
    admin.mfaSecretEncrypted = encryptMfaSecret(secret);
    admin.mfaEnabled = false;
    admin.mfaRequired = true;
    await admin.save();
    await recordAudit({
      actor: admin._id,
      actorEmail: admin.email,
      action: 'ADMIN_MFA_SETUP_STARTED',
      targetType: 'AdminUser',
      targetId: String(admin._id),
      reason: req.body?.reason || 'MFA setup started',
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
      requestId: req.requestId || '',
    });
    res.json({ ok: true, secret, otpauthUrl: otpauthUrl(admin, secret) });
  } catch (err) {
    next(err);
  }
});

router.post('/mfa/enable', requireAdminAuth, async (req, res, next) => {
  try {
    const admin = await AdminUser.findById(req.admin._id).select('+mfaSecretEncrypted');
    if (!admin) return res.status(404).json({ error: 'ADMIN_NOT_FOUND' });
    if (!admin.mfaSecretEncrypted) return res.status(400).json({ error: 'MFA_SETUP_REQUIRED' });
    const secret = decryptMfaSecret(admin.mfaSecretEncrypted);
    if (!verifyMfaToken(secret, req.body?.mfaToken)) {
      return res.status(400).json({ error: 'MFA_INVALID', message: 'Enter a valid 6-digit authenticator code.' });
    }
    admin.mfaEnabled = true;
    admin.mfaRequired = true;
    admin.mfaConfiguredAt = new Date();
    await admin.save();
    await recordAudit({
      actor: admin._id,
      actorEmail: admin.email,
      action: 'ADMIN_MFA_ENABLED',
      targetType: 'AdminUser',
      targetId: String(admin._id),
      reason: req.body?.reason || 'MFA enabled',
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
      requestId: req.requestId || '',
    });
    res.json({ ok: true, admin: admin.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

// ── Me (role + effective permissions drive the admin UI) ─────────────────────
router.get('/me', requireAdminAuth, (req, res) => {
  res.json({ admin: req.admin.toSafeJSON() });
});

export default router;
