import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../../config.js';

/**
 * EXTERNAL domain tokens.
 * Audience = 'starvnt-external'. The internal Admin API signs/verifies with a
 * different secret AND a different audience, so a token from one domain can
 * never be replayed against the other.
 */
export function signExternalAccessToken(user, sessionId) {
  return jwt.sign(
    {
      sub: String(user._id),
      accountType: user.accountType, // CUSTOMER | VENDOR
      sid: String(sessionId),
      domain: 'EXTERNAL',
    },
    config.jwtSecret,
    {
      expiresIn: config.accessTokenTtl,
      issuer: config.issuer,
      audience: config.audience,
    }
  );
}

export function verifyExternalAccessToken(token) {
  return jwt.verify(token, config.jwtSecret, {
    issuer: config.issuer,
    audience: config.audience,
  });
}

export function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
