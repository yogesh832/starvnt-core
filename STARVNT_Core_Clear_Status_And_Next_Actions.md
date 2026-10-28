# STARVNT Core - Clear Platform Status and Next Actions

This document summarizes the current platform state in plain language. It separates implemented work from remaining work and avoids marking anything as fully verified unless there is test or DB evidence.

## 1. Current Architecture

STARVNT is structured as one Core platform with three main portals:

- Customer Portal: event planning, Aura+, bookings, payments, event execution, profile, messages.
- Vendor Portal: onboarding, KYC, services, enquiries, quotes, bookings, execution, portfolio.
- Admin Control Tower: dashboard, users, vendors, customers, events, bookings, payments, automation, reports, coupons, audit, settings.

Core remains the source of truth for:

- Events and requirements.
- Vendor verification, activation, matching eligibility, and availability.
- Quotes, bookings, payments, payment verification, ledger, refunds, settlement, and disputes.
- Audit logs, admin roles, and platform settings.

## 2. Customer Portal

### Implemented

- Phone/OTP based authentication and session handling.
- Aura+ chat planning with extraction guards and context building.
- Manual event creation flow.
- Event requirements and service browsing.
- Booking payment page and Razorpay integration foundation.
- Budget and cost breakdown pages.
- Event day and execution screens.
- Customer Home Page "StarVnt Shop - Coming Soon" card with no fake catalog or checkout.
- Documents page backed by real paid/verified payments and CoreBooking records.
- PDF receipt/invoice download endpoints generated from platform records.
- Customer contract document records and download routing for uploaded contract URLs.
- Favorites page backed by saved customer favorites and selected event options.

### Implemented But Needs Verification

- Payment and booking state reconciliation.
- Aura+ fallback behavior when streaming or LLM output fails.
- Category-specific requirement validation for uncommon event/service types.
- Event day live updates, especially vendor status changes.

### Remaining

- Google Auth backend polish.
- Offline payment proof upload and manual verification flow for NEFT, RTGS, cash receipt, etc.
- Push notifications or WebSocket-style live updates for vendor execution changes.
- Binary contract upload still depends on the existing media storage upload path; customer documents now store and download contract URLs.

## 3. Vendor Portal

### Implemented

- Dynamic vendor category workspace.
- Vendor KYC foundation: GSTIN, PAN, and bank verification services.
- Vendor KYC manual-review fallback for provider failures, mismatch cases, and admin review assignment/status.
- Enquiries and matching opportunity flow.
- Quote creation and quote state machine.
- Vendor bookings and calendar.
- Execution and payout-related service layer.
- Portfolio/media pages and service.

### Implemented But Needs Verification

- Vendor state separation: profile completion, KYC, activation, eligibility, availability.
- Server-side validation for vendor approval and matching eligibility.
- KYC fallback behavior when third-party verification APIs fail.
- Quote expiry and payment milestone handling.

### Remaining

- Stronger category-specific vendor signup validation.
- Bank-verification-specific manual review escalation parity with GST/PAN document fallback.
- Reusable quote template library.
- Two-way Google Calendar sync.
- Vendor mobile direct photo upload for on-site completion proof.
- Cloudinary/S3 image compression pipeline.

## 4. Admin Control Tower

### Implemented

- Admin authentication, rate limiting, token validation, and role-based permissions.
- Super Admin role assignment to non-super admin role presets.
- Users & Access panel with role presets.
- Vendor KYC review modal and approval gating.
- Customer/vendor soft deactivation instead of destructive deletion.
- Booking detail modal with real payment/settlement reference requirements.
- Dashboard fixes for event status counts and booking chart labels.
- Coupons validation, expiry enforcement, soft deactivate, and audit.
- Settings API, persistence, audit, and edit UI.
- Reports summary API and CSV export.
- Automation outbox list, stats, retry, worker health, and queue visibility.
- DB audit and safe remediation scripts.
- Super Admin MFA/TOTP enforcement path, with setup and enable endpoints.
- Maker-checker settlement release workflow: request, approve/reject, then release with an approved request.
- Maker-checker refund workflow: request, approve/reject, then ledger-post with an approved request.
- Pending finance approvals tab in the Payments & Settlements panel.
- DB backup command using `mongodump` for external and admin databases.
- Production request logging with request IDs, status, duration, method, and path.

### DB Remediation Already Applied

- Demoted `automation@starvnt.com` from Super Admin to Operations Admin.
- Deactivated expired coupons `NEW10` and `HEY20`.
- Reset unsupported financial truth on `BK-3927` from verified/completed/eligible back to pending/not started/not eligible.
- Soft-deactivated unlinked test-looking customer records.
- Soft-cancelled duplicate-looking events only where there were no payments or Core bookings.

### Remaining

- Automated payout batch generation through NEFT/Razorpay Route or another provider.
- Deeper investigation of old destructive audit logs with blank reason/request ID.
- Direct API negative tests for privileged permissions.

## 5. Core Services and Infrastructure

### Implemented

- Request IDs on admin API requests.
- Admin audit request correlation.
- Core booking payment verification now requires authoritative payment evidence.
- Settlement release now requires a real transaction reference.
- Customer event creation idempotency support.
- Coupon redemption safety improvements.
- Outbox automation and worker health visibility.
- Root `npm test` command wired to the server Node test runner.

### Implemented But Needs Verification

- Razorpay webhook idempotency under concurrent retries.
- Payment to booking to ledger reconciliation under all payment states.
- Settlement hold behavior under disputes.
- Super Admin MFA setup on a real production account.
- Settlement maker-checker with two real admin identities and audit review.
- Worker retry and dead-letter lifecycle.
- Queue empty state versus infrastructure failure.

### Remaining

- Broader automated regression tests beyond the current PDF/MFA utility smoke tests.
- Production DB backup cron.
- Centralized hosted logging/monitoring integration.
- Provider-level SMS/WhatsApp notification gateway integration.

## 6. Highest Priority Next Actions

### P0 - Business Truth and Security

1. Reconcile duplicate-looking event groups that still have payment rows attached.
2. Reconcile active duplicate phone users before any merge/deactivation.
3. Run direct API negative tests for privileged admin routes.
4. Verify Razorpay webhook idempotency and payment retry safety.
5. Verify settlement release cannot bypass disputes, missing completion evidence, or maker-checker approval.

### P1 - Product Reliability

1. Add critical-path tests for customer documents, favorites, admin permissions, and payment verification.
2. Strengthen vendor onboarding validation and manual KYC review fallback.
3. Verify reports, automation, settings, coupons, and dashboard reconciliation using DB-backed tests.
4. Add direct binary contract upload widget on top of existing media storage if customers should upload from this page.
5. Add optional Shop waitlist only if consent storage is implemented.

### P2 - UX and Growth

1. Improve customer and vendor empty/error states.
2. Add report filters and richer exports.
3. Add accessibility and responsive QA pass.
4. Polish public homepage claims and SEO.
5. Add Shop catalog only after inventory, pricing, payment, and fulfillment ownership are defined.

## 7. Clear Definition of Done

A feature should only be called Verified when:

- The source of truth is identified.
- Server-side rules are enforced.
- DB state and UI state reconcile.
- Authorized and unauthorized API behavior is tested.
- Audit logs include actor, target, before/after state, reason, and request ID where applicable.
- Relevant regression tests pass.
- No fake records, fake metrics, fake payments, or hard deletes were used to force success.

