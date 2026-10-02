# STARVNT — Events. Simplified.

Dual-domain identity & authorization foundation on the MERN stack.

## Topology

**One unified backend server** (`server/`, Express + Mongoose) hosting **two hard-separated identity domains**, each on its **own MongoDB database** on the same Atlas cluster:

| Domain | Database | Identities | Auth | Token audience |
|---|---|---|---|---|
| EXTERNAL | `starvnt_external` | Customers, Vendors, VendorOrganizations, ExternalSessions | one shared flow (`accountType` = CUSTOMER \| VENDOR) | `starvnt-external` |
| INTERNAL | `starvnt_admin` | AdminUsers, AdminSessions, Roles, AdminAuditLogs | separate admin auth (`role` = ADMIN \| SUPER_ADMIN) | `starvnt-admin` |

Cross-domain replay is impossible by construction: different secrets, different
audiences, different session stores, different refresh cookies.

**One frontend app** (`web/`, Vite + React + Tailwind v4) with **three separate experiences**:
- `/customer` — Customer App (AI-style plan-an-event chat)
- `/vendor` — Vendor OS business console
- `/admin` — STARVNT Core (permission-driven internal console; `/admin/login`)
- `/login` — shared external sign-in / register UI

Production routes by subdomain (`customers./vendors./admin.`); dev routes by path.

## Security model

- Access JWT (15m) per domain + rotating refresh token in HttpOnly cookie
  (SHA-256 hashed in session doc, TTL-indexed, revoked on logout/disable).
- bcrypt (12 rounds), uniform `INVALID_CREDENTIALS`, rate limiting on auth.
- Admin RBAC: centralized middleware — validate session (401) → load role →
  SUPER_ADMIN allow-all → else explicit `resource.action` permission (403).
  The admin UI hides modules without permission as **UX only**.
- Only **SUPER_ADMIN** can create/disable admins; disabling revokes all
  sessions server-side and blocks login immediately.
- Full audit logging: WHO / WHAT / WHEN / from→to state / reason / source /
  reference / IP / device / idempotency key.

## Getting started

```bash
npm install

# 1. Configure server/.env (Atlas URIs are already filled; see server/.env.example)
# 2. Bootstrap the Super Admin
npm run seed:super-admin

# 3. Run backend + frontend
npm run dev          # server on :4000
npm run dev:web      # web on :5173 (proxies /api → :4000)

# 4. Tests (in-memory MongoDB, no Atlas needed)
npm test
```

Sign in at `http://localhost:5173/admin/login` with `SUPER_ADMIN_EMAIL` /
`SUPER_ADMIN_PASSWORD`, then create regular admins from **Users & Access**.

## Service & platform map

Keep real credentials only in local `.env` files. Commit only `.env.example`
templates. The root `.gitignore` is configured to ignore real env files and keep
the examples visible for onboarding.

| Area | Platform / provider | Used for | Main env keys | Notes |
|---|---|---|---|---|
| Database | MongoDB Atlas or local MongoDB | Core app data, external customer/vendor identity, admin identity | `DATABASE_URL`, `MONGO_URI_EXTERNAL`, `MONGO_URI_ADMIN` | STARVNT uses separate databases for domain isolation. |
| Server runtime | Node.js + Express | Unified API server on `:4000` | `PORT`, `CLIENT_ORIGINS`, `COOKIE_SECURE` | Frontend calls through `/api` in dev. |
| Frontend runtime | Vite + React + Tailwind | Customer, Vendor, Admin dashboards | `VITE_API_URL` | Runs on `:5173` in dev. |
| External auth | JWT + HttpOnly refresh cookie | Customer/vendor login sessions | `JWT_EXTERNAL_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS` | Customer/vendor account type is resolved by backend, not trusted from UI. |
| Admin auth | JWT + admin sessions | STARVNT Core admin console | `JWT_ADMIN_SECRET`, `ADMIN_ACCESS_TOKEN_TTL`, `ADMIN_REFRESH_TOKEN_TTL_DAYS` | Must use a different secret from external auth. |
| Password hashing | bcrypt | Password storage | `BCRYPT_ROUNDS` | Default local value is `12`. |
| OTP SMS | MSG91 | Phone OTP | `MSG91_AUTHKEY`, `MSG91_OTP_TEMPLATE_ID`, optional widget keys in web env | Sender ID/template must be approved in MSG91 for STARVNT branding. |
| Email OTP | SMTP, optional Resend | Email OTP and transactional mail | `EMAIL_SERVER_*`, `EMAIL_FROM`, optional `RESEND_API_KEY`, `RESEND_SENDER_EMAIL` | Keep Resend disabled locally if SMTP fallback is preferred. |
| Google OAuth | Google Cloud OAuth | Continue with Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VITE_GOOGLE_CLIENT_ID` | Rotate secrets before production if shared anywhere. |
| Google location APIs | Google Maps / Places / Distance Matrix | Vendor hubs, customer event location, distance, Google business rating lookup | `GOOGLE_PLACES_API_KEY`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_DISTANCE_MATRIX_API_KEY` | Use browser-restricted keys for frontend map use; server keys should be server-restricted. |
| Media storage | Cloudinary | Portfolio uploads, evidence uploads, CDN URLs | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | UI should say STARVNT Media, not Cloudinary branding. |
| Payments | Razorpay test/live | Orders, 30% advance, payment verification | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Test keys must start with `rzp_test_`; webhook needed for production-grade automatic verification. |
| GSTIN verification | gstinapi.in | GST number lookup and business verification | `GSTIN_API_KEY`, `GSTIN_API_BASE_URL` | Test GSTIN: `00AAAAA0000A1ZT`. |
| PAN lookup / verification | gstinapi.in PAN-to-GSTIN now; dedicated PAN provider later | Corporate PAN support | `PAN_API_KEY`, `PAN_API_BASE_URL`, optional `PAN_MOCK_ENABLED` | `gstinapi.in` can find GSTINs under a PAN; full PAN KYC/name status needs a dedicated provider such as Protean/NSDL, Signzy, Karza, Surepass, Eko, or Hyperverge. |
| Aura+ AI | Gemini, optional OpenAI/voice providers | Customer Aura and Vendor Aura assistants | `GEMINI_API_KEY`, optional `OPENAI_API_KEY`, `ELEVENLABS_API_KEY` | Keep AI keys server-side unless a provider explicitly requires a browser key. |
| Internal ops | STARVNT internal API key | Manual ops actions, payment verification simulation, admin/internal flows | `INTERNAL_API_KEY` | Never expose to frontend. |
| Production keep-alive | Render or hosting cron | Keep production backend warm | `KEEP_ALIVE_URL`, `KEEP_ALIVE_INTERVAL_MS` | Only relevant in production deployments that sleep. |

### Env files

| File | Purpose | Commit? |
|---|---|---|
| `server/.env` | Real backend secrets for local/dev machine | No |
| `server/.env.example` | Safe backend template with placeholders | Yes |
| `web/.env` | Real frontend public config for local/dev machine | No |
| `web/.env.example` | Safe frontend template with placeholders | Yes |

After editing any `.env`, restart the server/web dev process. Vite reads
`VITE_*` values at startup/build time.

## Customer App + Aura+

Code: `server/src/customer/` (routes → controllers → services → repositories → MongoDB)
and `web/src/pages/customer/`. Customer data lives in `customer_*` collections of the
external database; Vendor OS and Admin collections are only read, never written.

Journey: TELL → UNDERSTAND → PLAN → DISCOVER → COMPARE → DECIDE → RESERVE → PAY →
BOOK → CONNECT (Event Circle) → EXPERIENCE (event day) → COMPLETE → REMEMBER.

**Rules that hold everywhere**
- The customer decides. Aura+ understands and recommends; it can never select, quote,
  reserve, pay, verify, confirm or complete anything (see `aura/coreClient.js`).
- A reservation (48 h hold) is not a booking. The browser callback only moves a payment
  to *processing*; only a signed Razorpay webhook or ops verification makes it
  *verified*. A booking is confirmed only if the payment is verified **and** the hold is
  live **and** the date isn't taken — otherwise it waits *under review*.
- No fake data: options come from commercially active Vendor OS vendors plus clearly
  labelled demo listings (development only). No rating without reviews, availability is
  "not confirmed" unless a vendor blockout/booking says otherwise.
- Another customer's event/quote/booking returns 404. Nothing is ever deleted.

**Setup** (Hinglish: `.env` edit karne ke baad server restart karein)

| `server/.env` | Needed for |
|---|---|
| `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`, default `gemini-3.5-flash-lite`) | Aura+ |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (test mode) | "Pay" (otherwise 503) |
| `RAZORPAY_WEBHOOK_SECRET` | verifying payments via webhook |
| `INTERNAL_API_KEY` | ops / admin endpoints (`x-internal-key`) |

```bash
npm run seed:customer-demo   # 12 demo listings (dev only; safe to re-run; refuses in production)
npm run dev && npm run dev:web
```

Razorpay webhook (test mode): Dashboard → Webhooks → `https://<tunnel>/api/webhooks/razorpay`,
events `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid` (use ngrok
locally). Without it, verify manually:

```bash
K=<INTERNAL_API_KEY>
# verify a payment (bank transfer etc.)
curl -X POST localhost:4000/api/internal/ops/payments/<paymentId>/verify -H "x-internal-key: $K" -H "Content-Type: application/json" -d '{"operator":"ravi"}'
# event day: checked_in → started → completed (forward-only)
curl -X POST localhost:4000/api/internal/ops/bookings/<bookingId>/execution -H "x-internal-key: $K" -H "Content-Type: application/json" -d '{"status":"checked_in","operator":"ravi"}'
# vendor / team message in the Event Circle
curl -X POST localhost:4000/api/internal/ops/events/<eventId>/messages -H "x-internal-key: $K" -H "Content-Type: application/json" -d '{"senderType":"team","body":"Hi!","operator":"ravi"}'
# complete an event (refused while any booked service is incomplete)
curl -X POST localhost:4000/api/internal/ops/events/<eventId>/complete -H "x-internal-key: $K" -H "Content-Type: application/json" -d '{"operator":"ravi"}'
# simulate a vendor cancellation (plan item reopens)
curl -X POST localhost:4000/api/internal/admin/simulate-vendor-cancellation -H "x-internal-key: $K" -H "Content-Type: application/json" -d '{"bookingId":"<bookingId>","operator":"ravi"}'
```

Tests (`npm test`, 49 tests) use an in-memory MongoDB, a scripted LLM and a faked
Razorpay orders API — they never touch Atlas, Gemini or Razorpay.

## Layout

```
server/
  src/
    config.js  db/index.js  app.js  index.js
    external/  models · middleware · routes · utils   (Customer/Vendor auth)
    admin/     models · middleware · routes · constants · utils  (RBAC)
  scripts/seed-super-admin.js
  test/  external-auth.test.js · admin-rbac.test.js
web/
  src/pages/{customer,vendor,admin,external}/
  src/auth/  (separate External/Admin auth contexts)
```

## Roadmap hooks (env already in `.env`)

- MSG91 direct OTP — phone verification on external auth with `MSG91_AUTHKEY` and an approved `MSG91_OTP_TEMPLATE_ID`
- Google OAuth — "Continue with Google" buttons

> Security note: the Google client secret was shared in chat — rotate it in
> Google Cloud Console before production.
