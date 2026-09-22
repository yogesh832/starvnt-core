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
import { verifyGoogleIdToken } from '../services/googleAuth.service.js';
import {
  sendMobileOtp,
  verifyMobileOtp,
  verifyWidgetAccessToken,
  normalizePhone,
} from '../services/otp.service.js';

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
    sameSite: config.cookieSecure ? 'none' : 'lax',
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

async function ensureVendorOrganization(user, { businessName, brandName, category, city, location } = {}) {
  if (!user) return;
  if (!user.vendorOrganization) {
    let org = await VendorOrganization.findOne({ owner: user._id });
    if (!org) {
      const defaultName = user.fullName || 'Vendor';
      const resolvedBusinessName = businessName?.trim() || brandName?.trim() || `${defaultName}'s Studio`;
      const resolvedCategory = category?.trim() || 'Cinematic Production';
      const resolvedLocation = city?.trim() || location?.trim() || '';
      const hasExplicitBrand = Boolean(businessName?.trim() || brandName?.trim());
      const hasExplicitLoc = Boolean(resolvedLocation);
      const isProfileCompleted = Boolean(hasExplicitBrand && resolvedCategory && hasExplicitLoc);

      org = await VendorOrganization.create({
        businessName: resolvedBusinessName,
        category: resolvedCategory,
        location: resolvedLocation,
        owner: user._id,
        status: 'PENDING',
        activationState: 'REGISTERED',
        isCommerciallyActive: false,
        isProfileCompleted,
      });
    }
    user.vendorOrganization = org._id;
  }
  user.accountType = 'VENDOR';
  await user.save();
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

    const normalizedPhone = phone ? normalizePhone(phone) : undefined;

    const user = await ExternalUser.create({
      fullName,
      email,
      phone: normalizedPhone,
      passwordHash: await hashPassword(password),
      accountType,
    });

    if (accountType === 'VENDOR') {
      const resolvedLocation = city || location || '';
      const resolvedCategory = category || 'Cinematic Production';
      const hasExplicitBrand = Boolean(resolvedBusinessName && resolvedBusinessName.trim());
      const hasExplicitLoc = Boolean(resolvedLocation && resolvedLocation.trim());
      const isProfileCompleted = Boolean(hasExplicitBrand && resolvedCategory && hasExplicitLoc);

      const org = await VendorOrganization.create({
        businessName: resolvedBusinessName,
        category: resolvedCategory,
        location: resolvedLocation,
        owner: user._id,
        status: 'PENDING',
        activationState: 'REGISTERED',
        isCommerciallyActive: false,
        isProfileCompleted,
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
    const { email, password, accountType, businessName, brandName, category, city, location } =
      req.body || {};
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

    if (accountType === 'VENDOR') {
      await ensureVendorOrganization(user, { businessName, brandName, category, city, location });
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

// ── Google OAuth / One-Tap Login (Customer & Vendor) ────────────────────────
router.post('/google', authLimiter, async (req, res, next) => {
  try {
    const { credential, accountType, businessName, brandName, category, city, location } = req.body || {};
    if (!credential) {
      return res.status(400).json({ error: 'MISSING_GOOGLE_CREDENTIAL' });
    }

    const googleUser = await verifyGoogleIdToken(credential);
    let user = await ExternalUser.findOne({
      $or: [{ email: googleUser.email }, { googleId: googleUser.googleId }],
    });

    if (user) {
      if (!user.googleId) user.googleId = googleUser.googleId;
      if (!user.avatarUrl && googleUser.avatarUrl) user.avatarUrl = googleUser.avatarUrl;
      if (accountType === 'VENDOR') {
        await ensureVendorOrganization(user, { businessName, brandName, category, city, location });
      }
      user.lastLoginAt = new Date();
      await user.save();
    } else {
      const targetAccountType = accountType === 'VENDOR' ? 'VENDOR' : 'CUSTOMER';
      user = await ExternalUser.create({
        fullName: googleUser.fullName,
        email: googleUser.email,
        googleId: googleUser.googleId,
        avatarUrl: googleUser.avatarUrl,
        accountType: targetAccountType,
        authProvider: 'GOOGLE',
        status: 'ACTIVE',
        lastLoginAt: new Date(),
      });

      if (targetAccountType === 'VENDOR') {
        const hasExplicitBrand = Boolean(businessName?.trim() || brandName?.trim());
        const hasExplicitCity = Boolean(city?.trim() || location?.trim());
        const isProfileCompleted = Boolean(hasExplicitBrand && category?.trim() && hasExplicitCity);

        const resolvedBusinessName = hasExplicitBrand
          ? (businessName || brandName).trim()
          : `${googleUser.fullName}'s Studio`;
        const resolvedCategory = category?.trim() || 'Cinematic Production';
        const resolvedLocation = hasExplicitCity ? (city || location).trim() : '';

        const org = await VendorOrganization.create({
          businessName: resolvedBusinessName,
          category: resolvedCategory,
          location: resolvedLocation,
          owner: user._id,
          status: 'PENDING',
          activationState: 'REGISTERED',
          isCommerciallyActive: false,
          isProfileCompleted,
        });
        user.vendorOrganization = org._id;
        await user.save();
      }
    }

    if (user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'ACCOUNT_DISABLED' });
    }

    const { session, refreshToken } = await createSession(user, req);
    res.cookie(config.refreshCookieName, refreshToken, refreshCookieOptions());
    return res.json({ ...issueTokens(user, session), user: user.toSafeJSON() });
  } catch (err) {
    if (err.message === 'INVALID_GOOGLE_TOKEN' || err.message === 'MISSING_GOOGLE_CREDENTIAL') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// ── Mobile Phone OTP: Request OTP (Customer & Vendor) ───────────────────────
router.post('/otp/send', authLimiter, async (req, res, next) => {
  try {
    const { phone } = req.body || {};
    if (!phone) {
      return res.status(400).json({ error: 'PHONE_NUMBER_REQUIRED' });
    }

    const result = await sendMobileOtp(phone);
    return res.json({
      ok: true,
      phone: result.phone,
      expiresInSeconds: result.expiresInSeconds,
      devOtp: result.devOtp, // Returned for dev/test instant verification
      message: 'OTP sent successfully',
    });
  } catch (err) {
    if (err.message === 'INVALID_PHONE_NUMBER') {
      return res.status(400).json({ error: 'INVALID_PHONE_NUMBER' });
    }
    next(err);
  }
});

// ── Mobile Phone OTP: Verify OTP & Sign In / Register ───────────────────────
router.post('/otp/verify', authLimiter, async (req, res, next) => {
  try {
    const { phone, otp, accountType, fullName, businessName, brandName, category, city, location } =
      req.body || {};
    if (!phone || !otp) {
      return res.status(400).json({ error: 'PHONE_AND_OTP_REQUIRED' });
    }

    const verification = await verifyMobileOtp(phone, otp);
    if (!verification.valid) {
      return res.status(400).json({ error: verification.reason || 'INVALID_OTP' });
    }

    const normalizedPhone = verification.phone;
    let user = await ExternalUser.findOne({ phone: normalizedPhone });

    if (user) {
      if (accountType === 'VENDOR') {
        await ensureVendorOrganization(user, { businessName, brandName, category, city, location });
      }
      user.lastLoginAt = new Date();
      await user.save();
    } else {
      const targetAccountType = accountType === 'VENDOR' ? 'VENDOR' : 'CUSTOMER';
      const cleanDigits = normalizedPhone.replace(/\D/g, '');
      const defaultName =
        fullName ||
        (targetAccountType === 'VENDOR'
          ? (businessName || brandName || `Vendor ${cleanDigits.slice(-4)}`)
          : `Customer ${cleanDigits.slice(-4)}`);

      user = await ExternalUser.create({
        fullName: defaultName,
        email: `${cleanDigits}@phone.starvnt.com`,
        phone: normalizedPhone,
        accountType: targetAccountType,
        authProvider: 'PHONE',
        status: 'ACTIVE',
        lastLoginAt: new Date(),
      });

      if (targetAccountType === 'VENDOR') {
        const hasExplicitBrand = Boolean(businessName?.trim() || brandName?.trim());
        const hasExplicitCity = Boolean(city?.trim());
        const isProfileCompleted = Boolean(hasExplicitBrand && category?.trim() && hasExplicitCity);

        const resolvedBusinessName = hasExplicitBrand
          ? (businessName || brandName).trim()
          : `${defaultName} Studios`;
        const resolvedCategory = category?.trim() || 'Cinematic Production';
        const resolvedLocation = hasExplicitCity ? city.trim() : '';

        const org = await VendorOrganization.create({
          businessName: resolvedBusinessName,
          category: resolvedCategory,
          location: resolvedLocation,
          owner: user._id,
          status: 'PENDING',
          activationState: 'REGISTERED',
          isCommerciallyActive: false,
          isProfileCompleted,
        });
        user.vendorOrganization = org._id;
        await user.save();
      }
    }

    if (user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'ACCOUNT_DISABLED' });
    }

    const { session, refreshToken } = await createSession(user, req);
    res.cookie(config.refreshCookieName, refreshToken, refreshCookieOptions());
    return res.json({ ...issueTokens(user, session), user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

// ── MSG91 OTP Widget: Verify Access Token & Sign In / Register ─────────────
router.post('/otp/widget-verify', authLimiter, async (req, res, next) => {
  try {
    const { accessToken, phone, accountType, fullName, businessName, brandName, category, city, location } =
      req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: 'MISSING_WIDGET_ACCESS_TOKEN' });
    }

    let normalizedPhone = '';

    // 1. If accessToken is a JWT or test token, verify it
    if (accessToken && typeof accessToken === 'string') {
      try {
        const verification = await verifyWidgetAccessToken(accessToken);
        if (verification?.phone) {
          normalizedPhone = verification.phone;
        }
      } catch (err) {
        console.warn('[Widget Verify] Token verification notice:', err.message);
      }
    }

    // 2. Fallback to phone number verified in MSG91 widget session
    if (!normalizedPhone && phone) {
      normalizedPhone = normalizePhone(phone);
    }

    if (!normalizedPhone) {
      return res.status(400).json({ error: 'INVALID_WIDGET_TOKEN' });
    }

    let user = await ExternalUser.findOne({ phone: normalizedPhone });

    if (user) {
      if (accountType === 'VENDOR') {
        await ensureVendorOrganization(user, { businessName, brandName, category, city, location });
      }
      user.lastLoginAt = new Date();
      await user.save();
    } else {
      const targetAccountType = accountType === 'VENDOR' ? 'VENDOR' : 'CUSTOMER';
      const cleanDigits = normalizedPhone.replace(/\D/g, '');
      const defaultName =
        fullName ||
        (targetAccountType === 'VENDOR'
          ? (businessName || brandName || `Vendor ${cleanDigits.slice(-4)}`)
          : `Customer ${cleanDigits.slice(-4)}`);

      user = await ExternalUser.create({
        fullName: defaultName,
        email: `${cleanDigits}@phone.starvnt.com`,
        phone: normalizedPhone,
        accountType: targetAccountType,
        authProvider: 'PHONE',
        status: 'ACTIVE',
        lastLoginAt: new Date(),
      });

      if (targetAccountType === 'VENDOR') {
        const hasExplicitBrand = Boolean(businessName?.trim() || brandName?.trim());
        const hasExplicitCity = Boolean(city?.trim());
        const isProfileCompleted = Boolean(hasExplicitBrand && category?.trim() && hasExplicitCity);

        const resolvedBusinessName = hasExplicitBrand
          ? (businessName || brandName).trim()
          : `${defaultName} Studios`;
        const resolvedCategory = category?.trim() || 'Cinematic Production';
        const resolvedLocation = hasExplicitCity ? city.trim() : '';

        const org = await VendorOrganization.create({
          businessName: resolvedBusinessName,
          category: resolvedCategory,
          location: resolvedLocation,
          owner: user._id,
          status: 'PENDING',
          activationState: 'REGISTERED',
          isCommerciallyActive: false,
          isProfileCompleted,
        });
        user.vendorOrganization = org._id;
        await user.save();
      }
    }

    if (user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'ACCOUNT_DISABLED' });
    }

    const { session, refreshToken } = await createSession(user, req);
    res.cookie(config.refreshCookieName, refreshToken, refreshCookieOptions());
    return res.json({ ...issueTokens(user, session), user: user.toSafeJSON() });
  } catch (err) {
    if (err.message === 'INVALID_WIDGET_TOKEN' || err.message === 'MISSING_ACCESS_TOKEN') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// ── Refresh (rotation) ──────────────────────────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.[config.refreshCookieName];
    if (!token) return res.status(200).json({ ok: false, error: 'NO_REFRESH_TOKEN' });

    const session = await ExternalSession.findOne({
      refreshTokenHash: hashRefreshToken(token),
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      res.clearCookie(config.refreshCookieName, { path: '/api/auth' });
      return res.status(200).json({ ok: false, error: 'SESSION_INVALID' });
    }

    const user = await ExternalUser.findById(session.user);
    if (!user || user.status !== 'ACTIVE') {
      res.clearCookie(config.refreshCookieName, { path: '/api/auth' });
      return res.status(200).json({ ok: false, error: 'ACCOUNT_DISABLED_OR_MISSING' });
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
