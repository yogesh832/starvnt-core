import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../../config.js';
import { ExternalUser } from '../models/ExternalUser.js';
import { VendorOrganization } from '../models/VendorOrganization.js';
import { OperatingLocation } from '../models/OperatingLocation.js';
import { ExternalSession } from '../models/ExternalSession.js';
import { hashPassword, verifyPassword, passwordIssues } from '../utils/password.js';
import {
  signExternalAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../utils/tokens.js';
import { requireExternalAuth } from '../middleware/requireExternalAuth.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED' },
});

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: config.refreshTtlDays * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  };
}

async function createSession(user, req) {
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + config.refreshTtlDays * 24 * 60 * 60 * 1000);
  const session = await ExternalSession.create({
    user: user._id,
    refreshTokenHash: hashRefreshToken(refreshToken),
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
    expiresAt,
  });
  return { session, refreshToken };
}

function issueTokens(user, session) {
  return { accessToken: signExternalAccessToken(user, session._id) };
}

// ── Register (single external auth: CUSTOMER or VENDOR) ─────────────────────
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      phone,
      password,
      accountType,
      businessName,
      brandName,
      category,
      location,
      city,
    } = req.body || {};

    const resolvedBusinessName = businessName || brandName;

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }
    if (!['CUSTOMER', 'VENDOR'].includes(accountType)) {
      return res.status(400).json({ error: 'INVALID_ACCOUNT_TYPE' });
    }
    const issues = passwordIssues(password);
    if (issues.length) return res.status(400).json({ error: 'WEAK_PASSWORD', issues });
    if (accountType === 'VENDOR' && !resolvedBusinessName) {
      return res.status(400).json({ error: 'BUSINESS_NAME_REQUIRED' });
    }

    const exists = await ExternalUser.findOne({ email: String(email).toLowerCase() });
    if (exists) return res.status(409).json({ error: 'EMAIL_IN_USE' });

    const user = await ExternalUser.create({
      fullName,
      email,
      phone,
      passwordHash: await hashPassword(password),
      accountType,
    });

    if (accountType === 'VENDOR') {
      const resolvedLocation = city || location || '';
      const resolvedCategory = category || 'Cinematic Production';

      const org = await VendorOrganization.create({
        businessName: resolvedBusinessName,
        category: resolvedCategory,
        location: resolvedLocation,
        owner: user._id,
        status: 'PENDING',
        activationState: 'REGISTERED',
        isCommerciallyActive: false,
      });
      user.vendorOrganization = org._id;
      await user.save();
    }

    const { session, refreshToken } = await createSession(user, req);
    res.cookie(config.refreshCookieName, refreshToken, refreshCookieOptions());
    return res.status(201).json({ ...issueTokens(user, session), user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

// ── Login ────────────────────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'MISSING_FIELDS' });

    const user = await ExternalUser.findOne({ email: String(email).toLowerCase() }).select(
      '+passwordHash'
    );
    // Uniform failure — no account enumeration.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }
    if (user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'ACCOUNT_DISABLED' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const { session, refreshToken } = await createSession(user, req);
    res.cookie(config.refreshCookieName, refreshToken, refreshCookieOptions());
    return res.json({ ...issueTokens(user, session), user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

// ── Refresh (rotation) ──────────────────────────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.[config.refreshCookieName];
    if (!token) return res.status(401).json({ error: 'NO_REFRESH_TOKEN' });

    const session = await ExternalSession.findOne({
      refreshTokenHash: hashRefreshToken(token),
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'SESSION_INVALID' });
    }

    const user = await ExternalUser.findById(session.user);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'ACCOUNT_DISABLED_OR_MISSING' });
    }

    // Rotate: revoke old session, create new one.
    session.revokedAt = new Date();
    await session.save();
    const fresh = await createSession(user, req);
    res.cookie(config.refreshCookieName, fresh.refreshToken, refreshCookieOptions());
    return res.json({ ...issueTokens(user, fresh.session), user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

// ── Logout ───────────────────────────────────────────────────────────────────
router.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.[config.refreshCookieName];
    if (token) {
      await ExternalSession.updateOne(
        { refreshTokenHash: hashRefreshToken(token), revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    }
    res.clearCookie(config.refreshCookieName, { path: '/api/auth' });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Me ───────────────────────────────────────────────────────────────────────
router.get('/me', requireExternalAuth, (req, res) => {
  res.json({ user: req.externalUser.toSafeJSON() });
});

export default router;
