# Vendor business dashboard — implementation and acceptance evidence

Date: 31 October 2026. Scope: local web Vendor OS and its existing backend. This report does not certify deployed services, bank transfers, OTP delivery, or physical devices.

## Architecture audit and reuse

The repository uses React 18/Vite, Express, Mongoose, and separate external/admin MongoDB connections. The existing `/vendor/*` portal and its dashboard, enquiry, quote, booking, service, portfolio, availability, payment, review, analytics, message/update, and profile pages are retained. Existing external authentication resolves the vendor organization from the authenticated user. No client vendor ID selects dashboard data. CoreBooking remains the authoritative booking/execution/settlement snapshot; FinanceLedgerEntry remains the ledger. The activation evaluator remains the sole readiness source. Existing vendor goals, audit history, message threads, quote histories, and scheduling lock are reused.

An additional production routing defect was discovered during browser verification: the normal customer/vendor/admin portals were inside the development-only test-route guard. The guard now encloses only developer test pages. Existing session and role guards still enclose the normal portals; development sign-in shortcuts remain unavailable in production builds.

Existing lifecycles:

- Enquiries: NEW, VIEWED, RESPONDED, DECLINED, EXPIRED.
- Quotes: DRAFT, SUBMITTED, APPROVED, REJECTED, EXPIRED. APPROVED is not booking confirmation.
- Core contracts: CONFIRMED, CANCELLED, FAILED.
- Execution: NOT_STARTED, SERVICE_SCHEDULED, SERVICE_STARTED, COMPLETION_SUBMITTED, COMPLETION_VERIFIED.
- Payments: PENDING, PAYMENT_VERIFIED, REFUNDED.
- Settlements: NOT_ELIGIBLE, SETTLEMENT_ELIGIBLE, SETTLEMENT_HOLD, SETTLED. No distinct initiation lifecycle exists.

## Capability assessment

| Capability | Before | Delivered / remaining limitation |
| --- | --- | --- |
| Business snapshot | PARTIAL | Server-owned actionable enquiry/draft quote/upcoming booking counts; unknown sources return null |
| Action Center | PARTIAL | Priority ordering, actual SLA deadlines, source IDs/status/reasons, linked owned records, dedupe by enquiry/quote/thread relationship; first 20 actions |
| Sales metrics | PARTIAL | Server-calculated mature enquiry cohort, 30-day attribution, one conversion per enquiry, first timestamped response/submission samples |
| Financial summary | PARTIAL | Gross, stored invoiced payable, verified payments, outstanding, eligibility, ledger release/refund/adjustment totals remain separate |
| Reviews | PARTIAL | Dashboard and Reviews use PUBLISHED + isVerified; unverified reviews excluded; no default five-star rating; existing replies retained |
| Readiness | EXISTING | Existing evaluator reused with separate profile, verification, activation, matching, service readiness, availability, coverage, and bank/identity indicators |
| Weekly review | MISSING | Two complete IST Monday–Sunday operational count periods, no invented percentage growth; immature conversion comparisons withheld |
| Goals | Backend EXISTING / UI MISSING | Web create/edit/pause/resume/complete/remove, persisted measurement and progress; max-three-active mutations serialized through the existing vendor lock |
| Improvements | PARTIAL | One recommendation per confirmed missing readiness requirement; source/destination/action included; resolved conditions disappear after refresh |
| Operational reliability | PARTIAL | Actual missing readiness, unresolved Core protection issues and incomplete post-event submissions generate attention; insufficient history is not failure |
| Aura+ | EXISTING | Existing assistant and authorized workflow boundaries retained; no new AI metric verifier or financial actions |
| Notifications | EXISTING / NOT RE-CERTIFIED | Existing transition/event engine and message ownership retained; no dashboard-triggered delivery or new workers |
| Provider and deployment evidence | NOT VERIFIED | Requires stated staging/provider/device environment; no deployment performed |
| Native app parity | IMPLEMENTED IN SOURCE | Native overview, Analytics and Payments now consume the same server dashboard; goal CRUD, source failures, periods, readiness and record destinations match web. Android/iOS JavaScript and Hermes exports pass; physical-device execution remains NOT VERIFIED. |

## Metric registry and time policy

`GET /api/vendor/dashboard?periodDays=7|30|60|90` is the new read-only aggregation contract. Default 30; invalid/repeated periods are rejected. Scope is the authenticated vendor. Responses are `private, no-store` and contain generatedAt, timezone, sourceStates, periods, snapshot, upcomingBookings, sales, financial, quality, readiness, actions, recommendations, weekly. Source failures and safe-limit exhaustion affect only dependent sections. No customer identities, contact details, message bodies, credentials, or bank details appear in the new response.

All dashboard day/week boundaries use Asia/Kolkata. Intervals are start-inclusive/end-exclusive. Selected financial contract period is the last N completed local days. Sales cohort ends 30 completed days earlier to allow a full 30-day conversion attribution window for every enquiry. Goals retain the existing UTC date contract, displayed explicitly in the editor; their configured dates are never silently converted to a different period.

| Metric | Authoritative source / formula | Scope / exclusions | Drill-down |
| --- | --- | --- | --- |
| Enquiries requiring action | Opportunity status NEW or VIEWED | Current all-time state; excludes responded/declined/expired | Enquiries |
| Quotes awaiting action | Quote status DRAFT | Current all-time state; submitted quotes await customer, not vendor | Quotes |
| Upcoming contracts | CoreBooking CONFIRMED, eventDate today or later, execution not COMPLETION_VERIFIED | Current all-time snapshot; dedupe quote-linked contracts | Bookings |
| Cohort enquiries | Distinct owned Opportunity records created in the mature cohort | No invented qualification stage | Enquiries |
| Quoted / accepted enquiries | Distinct cohort enquiries with timestamped SUBMITTED / APPROVED history within 30 days of enquiry creation | Multiple quotes count once; missing history is not inferred | Quotes |
| Converted enquiries | Cohort enquiry linked via quote or opportunity ID to a current Core CONFIRMED contract created within 30 days | Cancelled/failed excluded; multiple contracts count once; creation time is the available confirmation proxy | Bookings |
| Conversion | Converted enquiries / cohort enquiries * 100 | Null for empty or immature cohort; no unrelated current-count ratios | Bookings |
| First response | Earliest valid saved SLA duration, vendor thread message, or submitted quote timestamp, minus enquiry creation | One sample/enquiry; exclude missing, negative, future and outside-window samples; show sample count | Enquiries |
| Quote turnaround | First recorded quote submission minus enquiry creation | One sample/enquiry; no missing timestamp substitution; show sample count | Quotes |
| Declined with reason | Cohort enquiries currently DECLINED with a non-empty stored declineReason | Reasons are not invented or exposed in previews | Enquiries |
| Gross contract value | Sum distinct confirmed Core totalAmount | Current contracts created in selected period; conflicting duplicates suppress values | Payments |
| Vendor contracted amount | Sum taxSummary.vendorPayable only with a stored invoiceNumber and finite non-negative amount | Missing legacy invoice snapshots mean unavailable; never gross fallback | Payments |
| Verified payments | Core paymentSummary.paidAmount only when PAYMENT_VERIFIED | On selected contracts, not cash received in selected dates; repeated payment references/refunded/unknown snapshots suppress value | Payments |
| Outstanding | Contract gross minus verified payments | Null for refunded, overpaid, repeated-reference or known adjusted contracts, or unavailable ledger; not a payment deadline | Payments |
| Settlement eligible | Stored invoiced payable for SETTLEMENT_ELIGIBLE contracts | Current eligibility on selected contracts; not completed payout | Payments |
| Release/refund/adjustment totals | Existing FinanceLedgerEntry amount by type and postedAt | Selected posting period; INR only; adjustments shown separately without invented debit/credit netting | Payments |
| Verified rating/count | Arithmetic mean/count of PUBLISHED + isVerified VendorReview records | All-time; no Google-to-STARVNT rating fallback; empty rating is null | Reviews |
| Completed bookings | Distinct Core COMPLETION_VERIFIED contracts | Current all-time state; does not imply on-time execution | Bookings |
| Weekly counts | Opportunity.createdAt, first SUBMITTED history, Core creation/completion verification, verified review creation | Last complete week and previous equivalent IST week; failed/incomplete sources suppress comparison | Existing source modules |
| Goal progress | Existing metric source within configured UTC dates, capped at current measurement time | Existing count-based metrics only; valid targets 1–1,000,000; maximum 366-day interval; null if source unavailable | Goals panel |

Zero is emitted only for a successfully read, empty qualifying set. Unknown calculations return null and render Unavailable or Insufficient data. Loading, error/retry, partial-source status, explicit refresh and generated timestamp are visible. Changing filters clears old values so one period cannot be mislabeled as another. The old client-count conversion widget and financial gross/payable fallback were removed. Automatic 30-second dashboard polling was removed; existing record lists refresh on focus, new aggregates refresh on demand.

## Security, privacy and lifecycle review

The endpoint uses the existing vendor authentication/organization middleware. Every query carries the session-derived vendor key, including cross-database Core and ledger queries. Client-supplied vendorId is ignored. Read-only serialization excludes private customer fields, payment references, internal ledger accounts and goal audit actor IDs. Browser deep links resolve only against authorized existing module responses; foreign/missing records produce an unavailable/unauthorized notice. Goals retain server ownership predicates, input validation and history; existing scheduling locks serialize cap checks and activation. Completion is rejected when the target has not been reached. No dashboard operation confirms bookings, verifies payments, approves vendors, releases funds, or changes matching eligibility.

The existing review verified flag and moderation workflow are used; this does not implement or certify a complete review acquisition/appeal system. New API tests exercise missing authentication, customer denial, invalid periods, tampered vendor IDs, no foreign private-record leakage, and no-store responses. Existing goal and notification ownership tests remain applicable.

## Performance and reliability

Six vendor-scoped projected source reads execute concurrently, alongside the existing readiness evaluator. Each list query reads at most 5,001 documents; more than 5,000 makes dependent aggregate results unavailable instead of summing a truncated list. Sales joins use maps and sets; no per-enquiry database queries are introduced. Existing vendor/owner indexes are reused. No schema, migration, ledger, event engine, or background worker was added. At larger vendor volumes replace the safe bounded reads with reconciled server aggregation, then justify compound indexes with explain plans. Query plan/load testing at production scale remains NOT VERIFIED.

## Verification artifacts

- `server/test/vendor-dashboard.test.js`: deterministic business-rule tests for timezone boundaries, cohorts, cancellations, duplicates, missing timestamps, financial semantics, refunds, source failures and priorities.
- `server/test/vendor-first-response.test.js`: existing first-response tests, including the corrected null-duration handling.
- `server/test/unified-product.test.js`: API integration/security coverage plus existing goal ownership, validation, notifications and lifecycle tests.
- `server/scripts/verify-vendor-business-dashboard.js`: isolated ephemeral MongoDB, actual API sign-in/session restore, production frontend build, fixture reconciliation and browser interaction. No production records or payment-provider events are created.
- `tmp/qa/vendor-business-all-server-tests.txt`: complete local server test output (69 passed, 0 failed).
- `tmp/qa/vendor-business-web-tests.txt`: web test output (24 passed, 0 failed).
- `tmp/qa/vendor-business-production-build.txt`: successful production web build. Vite reports a large bundle warning (approximately 371 KB gzip JavaScript); this is recorded, not treated as a performance improvement.
- `tmp/qa/vendor-business-dashboard/report.json`: current browser/API reconciliation and performance result. Only report.status PASS counts as a successful browser run.
- `tmp/qa/vendor-business-dashboard/desktop.png`, `mobile.png`, `recoverable-error-mobile.png`: screenshots when those steps complete successfully.

The host's C: temporary disk filled during the initial MongoDB test launch. Re-running with TEMP/TMP on D: allowed the integration suite to run. This is an environment finding, not a test pass for the failed launch. The npm Vite shim is absent in this checkout; direct invocation of the installed Vite binary works.

Final local browser run: **PASS, 31 checks**, with no JavaScript errors or unexpected console errors. The single synthetic-fixture dashboard request measured **53 ms** in this run; this is not a production benchmark. The controlled network-failure test intentionally produces `net::ERR_FAILED`, recorded separately from runtime exceptions. Desktop 1440×1000 and mobile 390×844 screenshots were inspected. The mobile navigation closes without leaving off-screen controls keyboard-focusable; business sections fit the viewport. Goal editor keyboard order, create/reload/pause/resume/edit/complete/remove, enquiry/quote/booking links, displayed finance values and failed-request recovery are exercised against the real local API. Eleven reconciliation rows have zero differences. Goal progress additionally verifies one qualifying Core contract / target two = 50% before editing the target.

For a fresh verification checkout, install the browser automation library into the ignored tools directory (`npm install --prefix tmp/vendor-os-tools playwright --no-save --package-lock=false`), then build from `web` with `VITE_API_URL=http://127.0.0.1:4117` and `node ../node_modules/vite/bin/vite.js build --outDir ../tmp/qa/vendor-business-dashboard/site`. Run `node server/scripts/verify-vendor-business-dashboard.js` from the repository root. The default Chrome executable path is Windows-specific; `CHROME_PATH` may select an installed compatible browser. The browser script uses a separate ephemeral database and ports 4117/5197. It must not be run against an existing service on those ports.

## Acceptance matrix

| Criterion | Result | Evidence / boundary |
| --- | --- | --- |
| Supported metrics use owned authoritative records | VERIFIED locally | API reconciliation, isolation test, displayed finance assertions |
| Existing modules/lifecycles reused | VERIFIED in source | Existing Mongoose models, activation evaluator, quote/booking detail pages and goal service |
| Definitions, periods and drill-downs | VERIFIED for delivered metrics | Registry above; server periods and browser deep links |
| Prioritized deduplicated actions | VERIFIED locally | Business-rule tests and authorized enquiry journey; only actual saved response SLA deadlines |
| Cohort attribution and financial separation | VERIFIED locally | Edge-case tests, invoice/refund/duplicate rules and zero-difference fixture reconciliation |
| Verified service quality and separate readiness | VERIFIED for supported snapshots | Unverified review excluded; no reviews empty state; activation regression tests |
| Weekly comparable periods | VERIFIED for recorded counts | IST boundary test and complete-period table; immature/missing comparisons suppressed |
| Goal persistence/progress/ownership/max-three | VERIFIED locally | API security/concurrency tests and browser goal journey |
| Recommendations have genuine triggers | VERIFIED in source/unit scope | Existing activation evaluator reasons only; no recommendation when readiness is unknown |
| Notifications authorized/deduplicated | Existing regression tests PASS | Existing engine reused; real provider delivery NOT VERIFIED |
| AI cannot change authoritative truth | Existing boundary retained | No AI mutation tools added; complete AI adversarial review NOT VERIFIED |
| Responsive/empty/error/retry/keyboard | VERIFIED for exercised widths/journeys | Seven screenshots, 31 browser checks; exhaustive device/accessibility audit NOT VERIFIED |
| Automated tests and production compilation | PASS | 69 server tests, 24 web tests and production Vite build |
| Deployment/provider/load certification | NOT VERIFIED | No deployment, bank/provider execution, or production-scale load run |

## Changed files

| Files | Purpose |
| --- | --- |
| `server/src/external/services/vendorDashboard.service.js` | Read-only bounded aggregation, period/cohort rules, financial semantics, actions, weekly counts and source failure states |
| `server/src/external/routes/vendor.routes.js` | Authenticated dashboard contract, goal cap serialization, published verified review filter |
| `server/src/external/services/vendorFirstResponseMetrics.service.js` | Reusable earliest-response calculation, null-duration correction and attribution bound |
| `web/src/pages/vendor/VendorBusinessDashboard.jsx` | Responsive business panels and persisted goal editor |
| `web/src/pages/vendor/pages/DashboardHome.jsx` | Integrated panels, removed misleading client funnel/KPIs, explicit legacy-source failures, upcoming filtering and accessible authorized notification links |
| `web/src/pages/vendor/pages/InsightPages.jsx` | Server-based Analytics and Payments summaries; verified-review loading/error/empty behavior |
| `web/src/pages/vendor/pages/Enquiries.jsx`, `Quotes.jsx`, `Bookings.jsx` | Resolve dashboard record deep links against existing authorized responses |
| `web/src/pages/vendor/VendorPortal.jsx` | Remove undefined badge-persistence call that crashed navigation; hide closed mobile navigation from focus |
| `web/src/App.jsx` | Restrict development-only guard to test routes; preserve normal portal session/role guards |
| `server/test/vendor-dashboard.test.js`, `server/test/unified-product.test.js` | Calculation, financial, partial dependency, isolation and concurrent goal limit coverage |
| `server/scripts/verify-vendor-business-dashboard.js` | Reproducible isolated browser/API evidence |
| This report | Audit, gap classification, registry, evidence, limitations and rollout/rollback |

Pre-existing unrelated customer/mobile/deployment edits were left in place; they are not part of this implementation summary.

## Deployment and rollback

1. Run server tests with writable temporary storage; run web tests and a production Vite build using the intended deployment API URL. Do not publish the browser fixture build, which targets localhost:4117.
2. Deploy the backend endpoint before the web bundle. Existing routes remain compatible; old clients require no migration. Existing goal records remain intact.
3. Verify authenticated vendor isolation, correct configured API origin, financial reconciliation, error states and desktop/mobile behavior in staging. Verify providers and production-size query plans separately.
4. Deploy through the existing release mechanism after the environment checks. No deployment is claimed by this implementation.
5. Roll back the web bundle and backend application version together if needed; do not delete goal history, existing locks, Core contracts or ledger records. No database rollback is necessary because this upgrade adds no schema fields.

## Remaining external or unsupported acceptance

NOT VERIFIED: production deployment/build identity, provider webhook/refund/bank reconciliation, OTP/Google sign-in delivery, physical Android/iOS behavior, exhaustive accessibility/contrast audit and large-volume performance. Unsupported from existing authoritative data: actual direct-cost profitability, separate settlement initiation, reliable planned-versus-actual on-time rate, historical service-category approval independent from active service readiness, and comparisons with incomplete/immature history. Those values are unavailable rather than fabricated. Full review acquisition/moderation and physical-device acceptance remain separate work; the supplied specification's complete production acceptance is not claimed.


## Mobile parity and branch publication update

The native VendorHome now uses `VendorBusinessPage`, sharing the server dashboard contract with Analytics and Payments. It includes actions, business health, upcoming bookings, mature cohort sales and response metrics, separate financial semantics, verified review/quality states, readiness dimensions, complete weekly periods, readiness recommendations and persistent goals. Goal forms validate count targets and UTC dates, display server-measured progress, and support editing, pause/resume, completion and removal. Existing Aura, messages, calendar, support and activation-review paths remain available. No additional dashboard polling is introduced.

`vendorDestination` now resolves exact quote/booking IDs into existing detail screens and passes enquiry IDs to the existing owned-record list. Missing/foreign enquiry records show an unavailable notice; destination validation rejects malformed IDs. The native Reviews screen keeps Google and verified STARVNT sources separate, displays honest no-review/loading/error states, and does not offer editing an already-final reply when the backend permits only one reply.

On the proposed customer branch, older client-calculated dashboard widgets are replaced by server-calculated panels. Its existing quotation builder, awaited submission/error handling and request sequence protection are retained. Other customer/admin code and unrelated local work are preserved.

Verification on the proposed customer branch:

- Native TypeScript check: PASS.
- Native tests: 107 passed, 0 failed (`tmp/qa/vendor-business-customer-mobile-tests.txt`).
- Server tests: 61 passed, 0 failed (`tmp/qa/vendor-business-customer-server-tests.txt`); this branch has fewer pre-existing tests than main.
- Web tests: 35 passed, 0 failed (`tmp/qa/vendor-business-customer-web-tests.txt`).
- Production web build: PASS, with the recorded large-bundle warning.
- Actual local web/API browser journey: 31 checks passed against the integrated customer branch. These are web browser checks, not physical native-device tests.
- Android export: PASS, 1,228 modules, 3.1 MB Hermes bundle (`tmp/qa/vendor-business-customer-android-export.txt`).
- iOS export: PASS (`tmp/qa/vendor-business-customer-ios-export.txt`).

The exports validate native bundling. They are not signed APK/IPA builds, store submissions or installations on a phone. No live payment, OTP or bank-transfer certification is claimed. Only the scoped backend runtime and automated tests are selected for main; web/mobile/documentation and the browser verification helper are selected for customer. No credentials, fixture records, generated builds, caches or screenshots are committed.
