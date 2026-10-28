# STARVNT unified product requirements comparison

This is the pre-implementation baseline. See [the implementation and verification notes](unified-product-implementation.md) for the subsequent changes.

Audit date: 24 October 2026. Baseline: the user's attached Unified Product Engineering Specification and Profile Status screenshot.

## Scope and evidence limits

This report compares the current local working tree, including existing uncommitted changes, against the supplied requirements. It is a source-code audit with local automated checks, not certification of a deployed environment. No application behavior was changed. Existing modifications to CalendarPage.jsx and untracked ProfileStatus.jsx/support configuration were present before the audit and were preserved.

Status meanings: **Partial** means useful implementation exists but requirements remain unmet; **Missing** means no corresponding implementation was found in the inspected application paths; **Unverified** means runtime/device/permission evidence is still needed. No percentage-complete estimate is assigned: the specification does not define weighted requirements.

## Overall assessment

The repository has reusable customer planning, commerce, financial summaries, vendor onboarding, availability models, Admin KYC review, notifications and mobile push infrastructure. It does not yet satisfy the unified specification end to end. The most consequential gaps are activation governance, conflict enforcement, separate external-commitment classification, consistent availability rules, notification preferences/quiet hours and integration of the requested support component.

## Requirement matrix

| Spec | Area | Current evidence | Assessment / gap |
| --- | --- | --- | --- |
| 1–3 | Customer event dashboard | web/src/pages/customer/HomePage.jsx; CustomerEventSummary.jsx; server/src/customer/services/events.service.js:550 | Partial. Reads owned event, requirements, bookings, payments, summary, attention and history. Date/location/readiness and event links exist. No countdown found in the inspected dashboard components. Full decisions, upcoming booking schedule and change-risk presentation are incomplete. |
| 3B, 6 | Defined progress | server/src/customer/services/understanding.js:147 | Partial. Explicit essentials-handled / essentials formula uses stored requirements. This is plan coverage, not complete event operational readiness; expand/document the distinction and verify it with business tests. |
| 3C | Budget health | server/src/common/financialTruth.service.js; services/summary.js; HomePage.jsx:316 | Partial. Shared financial truth is returned by the dashboard API, but HomePage budget visualization consumes summary.budget rather than financialTruth. Estimate/commitment and verified-paid display exist; reconcile the two calculation contracts and expose variance/risk clearly. |
| 4 | Aura+ | server/src/customer/aura/coreClient.js, extractionWriter.js, vendorTruth.js; web/src/pages/customer/AuraChat.jsx | Partial. Core-backed context, guarded writes, factual vendor responses and inferred date/tentative notes exist. Full confirmation/provenance guarantees for inferred requirements need journey-level tests. Proactive risk recommendations are not established for all specified changes. |
| 5 | Notifications | server/src/notifications/notification.service.js; push.service.js; push.models.js; push.contract.js | Partial. Real workflow callers, unique dedupe indexes, push job leases, retry backoff and receipts exist. No quiet-hours or notification-type/channel preference implementation found in server/web/mobile source search. No complete user reminder workflow established. |
| 7 | Lifecycle | server/src/customer/services/summary.js:eventSteps | Partial. Existing labels are Planning/Vendors/Booking/Payment/Execution/Completed; map these to the requested lifecycle instead of creating a second state machine. Payment step currently derives from event booking status, not independently verified payment records. |
| 8 | Vendor blocks | server/src/external/models/VendorBlockout.js; routes/vendor.routes.js:749; web CalendarPage.jsx; mobile VendorCalendar.tsx | Partial. Single-date full-day/partial-day persistence exists. Mobile exposes partial times; web creation is full-day only. No multi-day model, block update route or recurrence implementation found. Recurrence may remain a separately scoped extension under the spec. |
| 9 | Resource scope | VendorResource.js; VendorBookingSlot.js; availability.service.js | Partial. Slots can assign resources and capability limits exist. Blockouts have no service/team/equipment scope and disable the vendor for a date in customer discovery. |
| 10–11 | External commitments | VendorBookingSlot.js; vendor.routes.js:801–839; mobile VendorCalendar.tsx | Missing required contract. Vendor-entered commitments exist as slots, but lack EXTERNAL_COMMITMENT type, separate verification state, external customer name/phone/event/reference fields and explicit reported status. They are created with status CONFIRMED; this is not evidence of a STARVNT booking. |
| 12 | Conflict enforcement | availability.service.js; vendor.routes.js:758, 801 | Partial calculator, missing enforcement on these writes. Blocks/slots are created without invoking conflict validation. No transaction/idempotency/concurrency protection found on these routes. Block cancellation hard-deletes instead of retaining a cancellation record. |
| 13–14 | Admin availability tower | server/src/admin/routes; web/src/pages/admin | Missing dedicated Availability & External Commitments view/API/filter and conflict-resolution workflow in inspected paths. Existing Admin table/RBAC/audit patterns are reusable. External-customer access protections cannot be claimed for an unimplemented data contract. |
| 15–16 | Shared authoritative state | customer catalog, external matching, commerce, CoreBooking, financialTruth | Partial. One backend and shared models/services exist, but there are distinct availability implementations and booking representations with incomplete operational reconciliation. Do not equate one server with one rule implementation. |
| 17 | Synchronisation | HomePage.jsx:415; customerUi.jsx:476; currentEvent.jsx | Partial. Initial/dependency-based fetches and manual/action refresh exist. Dashboard loading hook has no periodic/focus/realtime refresh; external state changes while the dashboard stays open are not guaranteed to appear. Other polling features do not establish dashboard reconciliation. |
| 18 | Audit/idempotency | admin/utils/audit.js; notification indexes; commerce.service.js | Partial. Useful audit helpers, payment webhook dedupe and notification dedupe exist. Block writes and automatic activation saves do not use those protections. Audit helpers log and swallow persistence failures, so audit completeness is not guaranteed. |
| 19–22 | Profile Status + support | web/src/components/ProfileStatus.jsx; web/src/config/support.js | Unintegrated local work. Correct support number and labelled actions exist in source, but component has no screen callers, broken relative imports and incorrect endpoint/response assumptions. No last-update/outstanding-requirement display. Screenshot layout is not implemented by this component. |
| 20, 23–24 | Activation governance | VendorOrganization.js; vendorActivation.service.js; admin/routes/external-users.routes.js:674 | Partial, significant mismatch. Admin manual-review permissions and audit exist; evaluator derives ACTIVE from readiness without requiring manual approval or preserving rejected/suspended/restricted governance state. Status and activationState enums differ. |
| 25–27 | Audit/contracts/incremental implementation | Existing repository modules; this report | This report supplies an initial audit/reuse/backlog artifact. Approved UX, agreed API transition contracts and a complete acceptance test plan remain outstanding. |
| 28–34 | Acceptance and release evidence | server/test; web/test; local build | Unverified end to end. Existing automated checks pass, but required customer change, notification quiet-hours/dedupe, conflict/concurrency, Vendor-to-Admin and permission-denial journeys have not been demonstrated. |
| H | Success metrics | server/src/metrics.js and existing operational infrastructure | Unverified against the specified product metric set. Define events/formulas and evidence for each required metric before claiming coverage. |

## Priority findings

### P0 — Activation evaluation can overwrite governance decisions

In server/src/external/services/vendorActivation.service.js, matchingEligible is computed from financial verification plus commercial readiness. targetState is then assigned to both vendor.activationState and vendor.status and saved. The evaluator does not consult manualReview, isRestricted, REJECTED or SUSPENDED. It runs from GET /vendor/activation-status, profile updates and matching; reading status can therefore change business state. A complete/verified vendor can be assigned ACTIVE without an authorised activation decision, and status can disagree with governance restrictions. Authentication middleware does not establish the missing evaluator guard.

Required: separate readiness evaluation from activation transitions, preserve terminal/restricted governance state, gate eligibility on the authoritative authorised state, and record validated transitions with actor/before/after/reason/idempotency. Explicitly decide how legacy VERIFIED/ELIGIBLE/REGISTERED states map to the specification.

### P0 — Conflict prevention is not applied when records are created

POST /vendor/availability/blockouts only requires date before inserting. POST /vendor/availability/bookings checks service/resource ownership but directly inserts a CONFIRMED slot. Neither invokes the availability calculator. The web calendar now calls POST /vendor/availability/validateBlockout, but no such route was found, so its create flow is blocked by an unmatched request. Adding only a client-side preflight would still leave direct API calls and concurrent requests unprotected.

Required: enforce conflicts inside the authoritative mutation with suitable concurrency control; validate dates/times/ranges and ownership; preserve existing bookings; return authorised conflict details. Reuse the same rule service for matching and creation.

### P0 — Availability has competing rules and incomplete booking inputs

external/services/availability.service.js checks time/capacity/travel over VendorBookingSlot and uses findOne for blockouts. Multiple partial blocks on one date can therefore be missed. It only loads same-date records, leaving overnight boundary cases unresolved. Resource collisions are checked across same-day bookings even when times do not overlap. Customer discovery instead uses repositories/catalog.repo.js:vendorCommitments and services/catalog.service.js:withAvailability, treating any block/slot on the date as vendor-wide unavailability regardless of partial time or resource.

The source search found VendorBookingSlot writes in vendor.routes.js, but no slot creation/reconciliation in the inspected customer commerce or external transaction paths. Prove that confirmed STARVNT bookings enter the availability decision; the current slot calculator alone does not establish that guarantee.

Required: one interval/resource-aware contract over authoritative commitments and bookings; tests for multiple partial blocks, adjacent dates, concurrent capacity and unrelated resources.

### P1 — Profile Status source exists but cannot deliver the feature

web/src/components/ProfileStatus.jsx imports ../../components/Icon.jsx and ../../config/support.js, resolving outside web/src to paths that do not match the existing files. It calls /vendor/${vendorId}/profile; the existing routes are /vendor/profile and /vendor/activation-status. The latter returns {ok, status: <readiness object>}, not the assumed flat status string. The component is not imported by a screen, so successful Vite compilation does not validate it. The actual vendor dashboard uses its own readiness presentation.

Required: integrate into the existing dashboard with correct imports/API mapping, retain familiar layout, use backend status/review feedback/update timestamp and centrally configured support links. Add actual device verification for WhatsApp/dialler. The configured WhatsApp URL contains 919403891095 and the tel URL contains the same requested number; link syntax is not device verification.

### P1 — Customer truth presentation has specific inconsistencies

summary.js:eventSteps marks payment done whenever event.status is booked/in_progress/completed. This couples payment and booking state contrary to the financial-state distinction in the specification. HomePage.jsx's no-alert branch says all services are confirmed and on schedule when no items meet its missing/pending-without-vendor filter; selected-but-unconfirmed items can escape that filter. The statement is stronger than the evidence used to render it. The dashboard API returns financialTruth, but its budget panel uses the separate summary budget calculation.

Required: derive the payment milestone from verified payments and the exact payment obligation; derive the no-action message from authoritative decisions/bookings/risks; choose and document one budget calculation contract.

### P1 — Notification infrastructure lacks required delivery policy

Notification dedupe and push retries are real reusable infrastructure. No quiet-hour/timezone preference policy was found. notification.service.js marks records DELIVERED with sentAt/deliveredAt for every accepted channel, although this function itself does not dispatch to an SMS/WhatsApp/email provider. Current in-app creation must not establish successful external delivery.

Required: enforce preferences, quiet hours and priority before channel delivery; distinguish logical creation, channel queue/send/delivery/read states; use state/version-specific dedupe keys and retain attempt evidence. Test duplicate event processing and meaningful repeat changes.

## Existing architecture and reuse plan

| Surface / domain | Reuse | Required integration |
| --- | --- | --- |
| Customer web/mobile | Existing event context, dashboard API, loading/error states, event/requirement links, history | Unified budget/readiness/lifecycle/risks contract and reliable refresh |
| Aura+ | Core client, context builder, extraction guards, inferred context notes, vendor truth formatter | Explicit inferred-versus-confirmed acceptance tests; contextual actions grounded in real records |
| Vendor OS | Vendor context auth, resources, capabilities, blockouts, calendar and operating locations | Extend models/routes, not a second calendar store; web/mobile parity |
| Matching/discovery | Existing matching service and catalog consumers | Replace divergent availability decisions with one shared interval/resource service |
| Commerce/Core | Verified payment workflow, signed webhooks, CoreBooking linkage, financial truth service | Prove booking-to-operational-availability reconciliation and remove UI payment assumptions |
| Admin | requirePermission, KYC review, audit helpers, module table patterns | Availability/commitment review and explicit profile activation governance |
| Notifications | notifyCustomer/notifyVendor, unique keys, push jobs/leases/receipts/backoff | Preference/timezone policy, reminder triggers and accurate per-channel delivery state |

Target state ownership: Core owns booking/payment/activation truth; vendor records own declared unavailability and reported external commitments; a shared availability service evaluates both; Admin/Vendor/customer/Aura consume the same validated result. Notifications consume real state transitions, and frontend cards never independently grant eligibility.

## Proposed contracts and UX work before implementation

1. Map existing profile states; define permitted transitions and whether review approval is mandatory for legacy vendors. Readiness remains a calculation, activation a separately authorised decision.
2. Extend availability records with distinct record type, operational status, verification status, timezone-aware interval and explicit resource scope. Keep external customer data permission-protected and expose redacted representations to other consumers.
3. Extend existing routes for update/cancel and transactional validation; do not build a standalone validate endpoint as the only safety gate. Specify idempotency and conflict error contracts.
4. Define Admin list/filter/detail/actions and vendor create/edit/cancel flows, including clear conflict feedback and optional external-customer fields. Never label vendor-reported commitments as verified bookings.
5. Define dashboard next-action ordering, budget formula, readiness formula and lifecycle mapping, including loading/error/empty/no-action states and exact destinations.
6. Define notification event/version keys, channel preferences, quiet-hour timezone behavior, retries and delivery state ownership.

## Prioritised implementation order

1. P0: correct activation governance and prevent evaluator reads from silently changing authorised state.
2. P0: consolidate interval/resource availability, reconcile authoritative bookings and enforce conflict checks atomically on writes.
3. P1: extend external commitments and cancellation history; add permission-protected Admin visibility using the same records.
4. P1: integrate Profile Status/support through the existing API and dashboard, including rejected/suspended feedback.
5. P1: reconcile dashboard financial/lifecycle/no-action calculations and add state-change refresh/recovery.
6. P1: add notification preferences/quiet hours and accurate delivery policies; complete contextual Aura triggers.
7. Verify Journeys A–E with integration/E2E evidence, permission denials, duplicates/concurrency, device links and rollback/reconciliation procedures.

## Checks performed

- npm run test -w server: PASS, 4/4 tests. Existing suite covers app-review OTP behavior, not the specification's business journeys.
- npm run test -w web: PASS, 24/24 tests. Includes customer saved-fact/verified-payment rendering and milestone checks; does not prove full business integration.
- npm run build -w web: PASS. Vite reports a bundle-size warning. Unused ProfileStatus.jsx is outside the imported build graph.
- No database-backed E2E journeys, deployed-environment audit, mobile-device support-link checks or notification-provider delivery checks were performed.

Passing current checks is baseline evidence only; the unified specification is not yet met.
