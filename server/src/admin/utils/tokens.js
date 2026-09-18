import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../../config.js';

/**
 * INTERNAL ADMIN domain tokens.
 * Audience = 'starvnt-admin', signed with JWT_ADMIN_SECRET — an external
 * (customer/vendor) token can never pass verification here, and vice versa.
 */
export function signAdminAccessToken(admin, sessionId) {
  return jwt.sign(
    {
      sub: String(admin._id),
      role: admin.role, // ADMIN | SUPER_ADMIN
      sid: String(sessionId),
      domain: 'ADMIN',
    },
    config.adminJwtSecret,
    {
      expiresIn: config.adminAccessTokenTtl,
      issuer: config.issuer,
      audience: config.adminAudience,
    }
  );
}

export function verifyAdminAccessToken(token) {
  return jwt.verify(token, config.adminJwtSecret, {
    issuer: config.issuer,
    audience: config.adminAudience,
  });
}

export function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
