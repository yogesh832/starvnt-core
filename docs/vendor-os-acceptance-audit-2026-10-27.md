# Vendor OS acceptance audit

Audit date: 27 October 2026
Reference: `C:/Users/Hp/Downloads/main (4) (1).pdf`, Vendor OS and sign-in acceptance sections (PDF pp. 20-37; availability appendix pp. 38-42).
Scope: current local checkout `D:/starvnt-core`. This is source and automated-test evidence, not deployed or provider certification.

## External booking detail rule

The handbook appendix requires customer name and phone to remain optional and event location only when transit feasibility needs it (PDF p. 42). The current web form and native calendar label name and phone optional and location “when needed.” `normaliseCommitment` accepts an external commitment with no contact details or location, strips phone formatting, and validates an international phone only when one is entered. The API regression test covers missing name/phone and malformed supplied phone. Contact details remain redacted from ordinary Admin availability responses and are tested as protected.

Status: **Implemented and server-unit-tested.** The test covers the no-location payload as well, but it does not exercise browser/native form submission or a travel-policy case that requires a location. Add that end-to-end case when the product defines a machine-readable condition for “needed”; currently the form communicates the condition to the vendor and the shared transit estimator can still use a fallback estimate when destination data is absent.

Evidence: `server/src/common/scheduleRules.js`, `server/src/external/services/commitments.service.js`, `web/src/components/CommitmentForm.jsx`, `mobile/src/screens/VendorCalendar.tsx`, `server/test/unified-product.test.js`.

## Vendor OS acceptance matrix

“Implemented, partial” means meaningful code exists, but one or more handbook acceptance journeys or state cases lack end-to-end proof. Local unit tests do not imply a live provider or device test.

| Requirement area | Current assessment | Evidence and remaining acceptance work |
| --- | --- | --- |
| Sign-in and OTP (PDF pp. 20-22) | **Implemented, provider-unverified** | Web and native support role-aware auth, OTP/password flows and Google sign-in. Production developer-auth bypass is hard-disabled on the server and web/native test controls are development-only. Session and role switching have native tests; server tests direct API denial. Still run staging OTP delivery, expiry/resend/rate limits, Google redirect/account-linking and deep-link return journeys on real web and mobile builds. |
| Dashboard states (pp. 22-25) | **Partial** | Vendor dashboard reads saved activation, enquiry, quote, booking and payment data. It needs a verified state matrix for first login, incomplete/suspended/pending activation, no data, partial API failure, stale data and one clear next action. Existing dashboard-data tests exercise Core admin requests and failures, not the complete Vendor OS dashboard journey. |
| Enquiries (pp. 25-26) | **Partial** | Backend ownership and activation gates exist; unauthorized/unapproved vendors are covered by a server regression test. Verify list/detail/empty/error states, assignment and status history, permitted customer fields, and response-to-quote flow in web and mobile E2E. UI still uses mixed Leads/Enquiries terms in some places. |
| Quotes and negotiation (pp. 26-27) | **Partial; commercial advance fix in place** | Quote approval cannot itself create a confirmed booking or verified payment. New quotes snapshot category advance percentage and policy version; tests cover those invariants. The audit still needs immutable revision history and full accepted commercial terms (line items, travel, inclusions/exclusions, cancellation and validity) proven through submit/counter/revise/accept/checkout, including legacy quotes. |
| Booking evidence and execution (pp. 27-28) | **Partial** | Vendor booking UI and APIs support progress/evidence submission and Core review; customer payment/booking truth is separated. Category-aware evidence requirements, media validation outcomes, rejection/resubmission, and completion-to-settlement lifecycle need explicit tests. A browser/device E2E should confirm authorization and that evidence alone never marks completion or releases settlement. |
| Portfolio safety (pp. 28-29) | **Partial** | Portfolio project tests prevent stock-media substitution, impossible dates and unsupported draft status; actual uploads and backend review status are used. Still verify server-side file content/size/authorization, rights confirmation, upload failure/retry, moderation, and that unpublished or rejected assets never reach public/vendor matching surfaces. |
| Services and capacity (pp. 29-32, 38-42) | **Partial; historical deletion fix in place** | Services referenced by quotes/bookings archive instead of disappearing, covered by a regression test. Scheduling tests cover service/resource scope, concurrent writes, multi-day intervals and holds. Remaining: category-specific required service fields, duration/setup/teardown and lead-time enforcement, working-hour semantics, and travel terms saved to each accepted quote. |
| Payments (pp. 32-33) | **Partial; truth boundaries implemented** | UI is read-only for payment truth; new quote advance terms are policy snapshots; server tests verify policy snapshots and exclude pending/cancelled/duplicate amounts from customer totals. Provider webhook authenticity, idempotent refund/reconciliation, settlement transfer confirmation, stale/error UI and full finance-to-booking E2E need staging/provider evidence. Never infer custody or transfer completion from provider payment verification alone. |
| Reviews and ratings (pp. 33-34) | **Partial** | Vendor cannot create a review through its own review endpoint; customer-visible profile ratings are sourced from STARVNT review data or linked Google Places data. Tests still need to prove one eligible review per completed booking, customer ownership, moderation/dispute behavior, stale/failed Google data, and shared aggregation/ranking rules. |
| Analytics (pp. 34-36) | **Partial** | Backend financial truth and product outcome metrics exist. Vendor acceptance requires cohort-based enquiry→quote→confirmed-booking funnel definitions, dated denominators, response/quote turnaround time, excluded duplicates/cancellations/refunds, and N/A for zero denominators. Current Vendor OS analytics does not establish those cohort metrics end to end. |
| Messages and action center (pp. 36-37) | **Partial** | Customer messages, notifications and Aura history have separate owned APIs/surfaces, and notification dedupe/replay tests pass. The handbook calls for clearly separated Notifications, Customer Messages, Aura Conversations and Action Required, with accurate counts, refresh/stale/error states and contextual actions. Full unified action-center acceptance is not met. |

## Next work in priority order

1. Add a Vendor OS browser E2E suite for sign-in/OTP continuation, dashboard empty/error/suspended states, enquiry-to-quote, quote revisions through payment, booking evidence review, portfolio publication guard, review eligibility, analytics filters and message/action-center updates.
2. Finish quote revision and accepted-terms snapshots, category-specific evidence, server-side portfolio media/rights checks, and operational service duration/lead-time/travel rules.
3. Define and implement review eligibility/moderation and cohort analytics formulas; then add API tests for duplicates, cancellations, refunds and empty periods.
4. Run real staging checks for OTP/Google, payment/refund/settlement callbacks, push delivery, responsive widths and physical Android/iOS flows. Record deployed build/config and rollback evidence separately.

## Local verification snapshot

- Server tests: 36 passed, including optional external booking contacts, malformed supplied phone rejection, contact redaction, quote policy snapshotting, safe service archival and production dev-auth denial.
- Web tests: 24 passed; production build passed.
- Native tests: 99 passed in the preceding priority-fix validation; native TypeScript check passed after the latest shared UI changes.
- `git diff --check` passed; Git emitted only expected line-ending normalization warnings.

No production, OTP, Google, payment, refund, bank-transfer, push-provider or physical-device behavior is certified by these local checks.
