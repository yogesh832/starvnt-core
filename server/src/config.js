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

  // ── GSTIN verification ──
  gstinApiKey: process.env.GSTIN_API_KEY || "",
  gstinApiBaseUrl: process.env.GSTIN_API_BASE_URL || "https://www.gstinapi.in/v1",

  // ── Corporate PAN verification ──
  panApiKey: process.env.PAN_API_KEY || process.env.GSTIN_API_KEY || "",
  panApiBaseUrl: process.env.PAN_API_BASE_URL || process.env.GSTIN_API_BASE_URL || "https://www.gstinapi.in/v1",
  panMockEnabled: process.env.PAN_MOCK_ENABLED === "true" || process.env.NODE_ENV === "test",

  // ── Bank account verification ──
  bankVerificationProvider: process.env.BANK_VERIFICATION_PROVIDER || "CASHFREE",
  bankVerificationMockEnabled: process.env.BANK_VERIFICATION_MOCK_ENABLED === "true" || process.env.NODE_ENV === "test",
  cashfreeClientId: process.env.CASHFREE_CLIENT_ID || "",
  cashfreeClientSecret: process.env.CASHFREE_CLIENT_SECRET || "",
  cashfreeBavBaseUrl: process.env.CASHFREE_BAV_BASE_URL || "https://sandbox.cashfree.com",

  // ── Gemini & Aura+ Dual-Path Architecture ──
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  geminiThinkingLevel: process.env.GEMINI_THINKING_LEVEL || "minimal",

  auraReasoningModel: process.env.AURA_REASONING_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  auraReasoningLevel: process.env.AURA_REASONING_LEVEL || "low",

  chatThinkingStatusDelayMs: Number(process.env.CHAT_THINKING_STATUS_DELAY_MS || 1200),
  chatStatusRotationMs: Number(process.env.CHAT_STATUS_ROTATION_MS || 2500),

  // ── Core workers / safety gates ──
  enableQaPaymentBypass: process.env.ENABLE_QA_PAYMENT_BYPASS === "true",
  outboxWorkerEnabled: process.env.OUTBOX_WORKER_ENABLED !== "false",
  outboxWorkerIntervalMs: Number(process.env.OUTBOX_WORKER_INTERVAL_MS || 15000),
  reservationExpiryWorkerEnabled: process.env.RESERVATION_EXPIRY_WORKER_ENABLED !== "false",
  reservationExpiryIntervalMs: Number(process.env.RESERVATION_EXPIRY_INTERVAL_MS || 60000),
  metricsEnabled: process.env.METRICS_ENABLED !== "false",
  enableDevTools: process.env.ENABLE_DEV_TOOLS === "true" && !isProduction,

  // ── Settlement math ──
  platformCommissionPercent: Number(process.env.PLATFORM_COMMISSION_PERCENT || 10),
  tdsPercent: Number(process.env.TDS_PERCENT || 1),
  gstPercent: Number(process.env.GST_PERCENT || 18),
};
