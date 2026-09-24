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
