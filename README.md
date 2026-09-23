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
