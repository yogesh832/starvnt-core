import "dotenv/config";

function parseOrigins(value) {
  return (value || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

const isProduction = process.env.NODE_ENV === "production";
const cookieSecure =
  process.env.COOKIE_SECURE === undefined
    ? isProduction
    : String(process.env.COOKIE_SECURE).toLowerCase() === "true";

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
  cookieSecure,
  cookieDomain: process.env.COOKIE_DOMAIN || "",
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),

  issuer: "starvnt",

  // ── External domain ──
  mongoUriExternal: process.env.MONGO_URI_EXTERNAL || "",
  jwtSecret: process.env.JWT_EXTERNAL_SECRET || "external-dev-only-secret",
  audience: "starvnt-external",
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || "15m",
  refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30),
  refreshCookieName: "starvnt_ext_rt",

  // ── Internal admin domain ──
  mongoUriAdmin: process.env.MONGO_URI_ADMIN || "",
  adminJwtSecret: process.env.JWT_ADMIN_SECRET || "admin-dev-only-secret",
  adminAudience: "starvnt-admin",
  adminAccessTokenTtl: process.env.ADMIN_ACCESS_TOKEN_TTL || "15m",
  adminRefreshTtlDays: Number(process.env.ADMIN_REFRESH_TOKEN_TTL_DAYS || 7),
  adminRefreshCookieName: "starvnt_admin_rt",
  adminAuthRateLimit: Number(process.env.ADMIN_AUTH_RATE_LIMIT || 10),

  // ── Super admin bootstrap ──
  superAdminName: process.env.SUPER_ADMIN_NAME || "STARVNT Super Admin",
  superAdminEmail: (process.env.SUPER_ADMIN_EMAIL || "").toLowerCase(),
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD || "",

  // ── Google OAuth ──
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",

  // ── MSG91 OTP ──
  msg91AuthKey: process.env.MSG91_AUTHKEY || "",
  msg91OtpTemplateId: process.env.MSG91_OTP_TEMPLATE_ID || "",
  msg91SenderId: process.env.MSG91_SENDER_ID || "STRVNT",
  msg91WidgetId: process.env.MSG91_WIDGET_ID || "",
  msg91WidgetToken: process.env.MSG91_WIDGET_TOKEN || "",
  msg91EmailTemplateId: process.env.MSG91_EMAIL_TEMPLATE_ID || "",
  msg91EmailFrom: process.env.MSG91_EMAIL_FROM || "no-reply@starvnt.com",

  // ── Direct SMTP Email OTP ──
  emailServerHost: process.env.EMAIL_SERVER_HOST || "",
  emailServerPort: Number(process.env.EMAIL_SERVER_PORT || 587),
  emailServerUser: process.env.EMAIL_SERVER_USER || "",
  emailServerPassword: (process.env.EMAIL_SERVER_PASSWORD || "").replace(
    /\s+/g,
    "",
  ),
  emailFrom: process.env.EMAIL_FROM || process.env.EMAIL_SERVER_USER || "",

  // ── Resend Email OTP ──
  resendApiKey: process.env.RESEND_API_KEY || process.env.RESEND_KEY || "",
  resendSenderEmail: process.env.RESEND_SENDER_EMAIL || "no-reply@starvnt.com",

  // ── Production keep-alive for Render free instances ──
  keepAliveUrl:
    process.env.KEEP_ALIVE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    "",
  keepAliveIntervalMs: Number(process.env.KEEP_ALIVE_INTERVAL_MS || 10000),
};
