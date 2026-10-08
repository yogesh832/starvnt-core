# STARVNT Admin Panel / Command Center Audit

Audit date: October 8, 2026

This audit compares the current `/admin` Command Center against the required Core/Admin blueprint scope. Live payment rails and live KYC provider execution remain intentionally out of scope until production credentials are attached.

## Blueprint Coverage

- `server/src/admin/` exists as an isolated admin backend domain with models, routes, services, middleware, RBAC, sessions, and audit logging.
- Admin authentication is separate from Customer/Vendor authentication and uses separate cookies, JWT audience, sessions, and database connection.
- Core booking, settlement, dispute, policy, automation, audit, user access, and coupon modules are wired into the Admin Shell.

## Module Comparison

| Module | Required | Current state | Status |
|---|---|---|---|
| Identity, Auth and RBAC | Separate admin identity, refresh cookies, RBAC checks, admin-only routes | `AdminUser`, `AdminSession`, permission catalog, `UsersAccess.jsx`, and route-level permission middleware are present | Completed |
| Vendor Onboarding and KYC | Verification ladder, document review, PAN/GST/bank status, status override | `VendorKycModal.jsx`, `external-users.routes.js`, financial profile and verification logs are implemented; live provider calls depend on keys | Partially working |
| Operations and Core Booking Workspace | Central operations view for events/bookings/payment/execution/completion | `EventWorkspace.jsx`, `BookingDetailModal.jsx`, `operations.routes.js`, `CoreBooking.js` are implemented | Completed |
| Financial OS, Escrow and Disputes | Escrow monitoring, settlement eligibility, payout holds, dispute workspace | Settlement/dispute services, finance ledger, invoice accrual, GST/TDS math, and wallet freeze/hold are implemented; live Razorpay Route transfer execution is not enabled | Blocked on live keys |
| Outbox Automation Monitoring | Queue stats, pending/processing/completed/dead-letter view, manual retry | `automation.routes.js`, admin automation table, atomic worker locking, stale-lock recovery, and dead-letter audit are implemented | Completed |
| Business Audit and Compliance | Admin and business audit logs with actor, state transition, source and authority | `AdminAuditLog.js`, `BusinessAuditLog.js`, admin audit UI, finance/dispute/outbox audit writes are implemented | Completed |
| Policy Engine and Settings | Dynamic policy resolver for radius/SLA/fees/coupons | `CorePolicy.js`, policy routes, coupon routes, resolver, and route RBAC are present | Completed |
| API Load Testing Workbench | Admin shell load dashboard and controllable test runner | Dev workbench exists and is gated behind explicit dev tooling flags; production exposure is disabled by default | Completed for dev/QA |

## Recent Hardening

- Admin operations, disputes, and policy routes now enforce granular permissions.
- QA payment bypass is removed from normal customer UI and only mounts when explicitly enabled outside production.
- `/api/test/echo`, `/testAuth`, and standalone test pages are gated behind dev-tool flags.
- The outbox worker now claims events atomically and records dead-letter transitions.
- Opportunity SLA expiry, reservation expiry, and outbox processing run in Core workers.
- `/metrics` exposes basic Prometheus-style process, request, worker, and business counters.

## Remaining Blockers

- Live Razorpay Route vendor transfer execution requires production Razorpay credentials and transfer-account configuration.
- Live PAN/bank KYC providers such as Signzy/Protean/Cashfree require production credentials and compliance review.
- Production load testing should run in a staging environment with representative traffic and safe rate limits.

## Current Completion Score

Estimated admin panel completion: 92 percent.

The remaining work is mostly provider activation, production credential wiring, staging validation, and operational runbook rehearsal rather than missing Admin Shell structure.
