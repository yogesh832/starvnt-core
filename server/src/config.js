import 'dotenv/config';

function parseOrigins(value) {
  return (value || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * ONE server, TWO identity domains.
 *
 * EXTERNAL (Customers + Vendors) and INTERNAL (Admin + Super Admin) each use:
 *   - their own database   (MONGO_URI_EXTERNAL / MONGO_URI_ADMIN)
 *   - their own JWT secret (JWT_EXTERNAL_SECRET / JWT_ADMIN_SECRET)
 *   - their own token audience + session cookie
 * so a token from one domain can never be replayed against the other.
 */
export const config = {
  port: Number(process.env.PORT || 4000),
  clientOrigins: parseOrigins(process.env.CLIENT_ORIGINS),
  cookieSecure: String(process.env.COOKIE_SECURE).toLowerCase() === 'true',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),

  issuer: 'starvnt',

  // ── External domain ──
  mongoUriExternal: process.env.MONGO_URI_EXTERNAL || '',
  jwtSecret: process.env.JWT_EXTERNAL_SECRET || 'external-dev-only-secret',
  audience: 'starvnt-external',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30),
  refreshCookieName: 'starvnt_ext_rt',

  // ── Internal admin domain ──
  mongoUriAdmin: process.env.MONGO_URI_ADMIN || '',
  adminJwtSecret: process.env.JWT_ADMIN_SECRET || 'admin-dev-only-secret',
  adminAudience: 'starvnt-admin',
  adminAccessTokenTtl: process.env.ADMIN_ACCESS_TOKEN_TTL || '15m',
  adminRefreshTtlDays: Number(process.env.ADMIN_REFRESH_TOKEN_TTL_DAYS || 7),
  adminRefreshCookieName: 'starvnt_admin_rt',
  adminAuthRateLimit: Number(process.env.ADMIN_AUTH_RATE_LIMIT || 10),

  // ── Super admin bootstrap ──
  superAdminName: process.env.SUPER_ADMIN_NAME || 'STARVNT Super Admin',
  superAdminEmail: (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase(),
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD || '',
};
