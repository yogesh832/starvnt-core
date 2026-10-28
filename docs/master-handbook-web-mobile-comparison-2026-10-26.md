# STARVNT master handbook vs current web and mobile

Audit date: 26 October 2026. Read-only product comparison; no application changes, production actions or deployment.

## Result

The current local product implements a substantial part of the handbook's shared Core, dashboard, activation, scheduling and notification foundations. **Neither web nor native mobile can be marked fully compliant or release-ready against the entire handbook.** Detailed commercial terms, portfolio integrity, historical service safety, analytics, legal navigation and release evidence remain incomplete. Mobile generally consumes the same backend and therefore inherits its business-rule gaps even where its screens are better guarded.

No completion percentage is assigned: the handbook has no weighted acceptance model, and code presence is different from proven end-to-end behavior.

## Baselines and evidence boundaries

- Reference: `C:/Users/Hp/Downloads/main (4) (1).pdf`, all 42 supplied pages. Cover visually rendered; all page text extracted and reviewed. Page references below are PDF page numbers.
- Primary current code: `D:/starvnt-core`, branch `customer`, HEAD `3af5800`, **including its existing uncommitted/untracked implementation**. These local changes are not evidence of a deployed release.
- Browser preview: `localhost:5178` / `127.0.0.1:5179` runs the **different** worktree `D:/starvnt-privacy-main`, branch `codex/vendor-customer-e2e`, HEAD `76ab380`. It contains the recent local booking fixes, Privacy Policy work and Aura appearance changes, but does not contain all the newer unified product work in `customer`.
- Native app: `D:/starvnt-core/mobile`, source and automated checks; no physical Android/iOS device was exercised in this audit.
- AWS production, installed app binaries, live payment/settlement providers, Google login, OTP delivery and push delivery were not certified. Earlier simulated payment screenshots belong to the isolated preview and do not prove native or live-payment readiness.
- Earlier audit/implementation notes were consulted as pointers, then checked against current source and fresh tests. Their completion claims were not adopted automatically.

Status: **Implemented/tested** = relevant code plus specific passing local tests; **Partial** = real functionality exists with explicit gaps; **Missing** = no required implementation found in inspected paths; **Unverified** = deployment/device/provider evidence is still needed. A row marked implemented/tested is not a claim that every appendix acceptance criterion has passed.

## Fresh validation

| Check | Result | Evidence |
| --- | --- | --- |
| Current server's two test files | 32 passed, 0 failed | `tmp/pdfs/audit-backend-tests.txt` |
| Web tests | 24 passed, 0 failed | `tmp/pdfs/audit-web-tests.txt` |
| Native mobile tests | 99 passed, 0 failed | `tmp/pdfs/audit-mobile-tests.txt` |
| Native TypeScript | Passed | `tmp/pdfs/audit-mobile-types.txt` |
| Current web production build | Passed; existing large-bundle warning | `tmp/pdfs/audit-web-build.txt` |

Backend tests directly exercise activation approval/denials, schedule/resource conflicts, ownership, concurrency, reported external commitments, Admin personal-data redaction, notification dedupe/quiet hours, reminder retries, inferred-requirement confirmation and financial deduplication. They do not cover every detailed quote, portfolio, review, execution, refund or production-auth requirement. The 262-test result from the earlier isolated worktree is **not** the test count of this current checkout.

## Complete module comparison

| Handbook / PDF pages | Current web | Native app | Shared backend / remaining requirement |
| --- | --- | --- | --- |
| Customer event dashboard, pp. 6–8 | Implemented/tested foundation: saved event, countdown, lifecycle, pending decisions, financial summary and refresh. | Event dashboard reads shared experience/financial truth; explicit Aura confirmation and reminders integrated. | Owned dashboard and real-change/denial tests pass. Full next-action/deep-link and lifecycle matrix still needs UI/device E2E. |
| Readiness and budget, pp. 7–8 | Shared `FinancialOverview` and persisted requirement readiness used. | Shared financial summary and proposed-requirement confirmation used. | Tested exclusion of inferred work, unverified payments and duplicate/cancelled contracts. Full refunds/adjustments reconciliation not established by current suite. |
| Aura planning and provenance, pp. 7–8, 24, 37 | Customer/vendor chat, saved sessions, explicit confirmation, current context and workflow links exist. | Native text/voice/history plus live context refresh implemented; unit tests pass. | Inferred requirements remain separate until explicit confirmation. Live model behavior, multilingual edge cases and every consequential-action guard require additional E2E. |
| Lifecycle and progress, pp. 8, 14 | Backend projection displayed; real milestones and no-action state supported. | Same projection consumed. | `dashboardPolicy.js` also selects Event Day from today's date for non-draft events; compare carefully with actual execution state. Not every lifecycle transition is proven. |
| Notifications, pp. 8, 14–15 | Inbox, preferences, quiet hours, reminders and feedback integrated. | Preferences/reminders plus native push handling integrated. | Dedupe, timezone quiet-hours policy, retries and reminder ownership tests pass. Live provider/background delivery remains unverified. Supported delivery is inbox + configured push, not automatically SMS/email/WhatsApp. |
| Block and external booking forms, pp. 8–10, 38–42 | Full/partial/multi-day forms, scope, edit/cancel, external details, conflict feedback and idempotency exist. | `VendorCalendar` supports the same payload, revision, resource/service scope and edit/cancel flows. | Shared commitment service persists reported external commitments, validates ownership/conflicts and retains history. Relevant API tests pass. |
| Resource/capacity conflicts, pp. 9–10, 30–32, 41–42 | Resource configuration and scoped commitment UI available. | Service resources and calendar assignment UI available. | Shared service dependencies, resource capacity, travel/setup and holds integrated; concurrency tests pass. Exact service duration/teardown, operating-window semantics and lead-time enforcement remain incomplete (F08). |
| Admin availability, pp. 10–11, 14–15 | Dedicated Availability & External Commitments screen with filters/history/cancellation. | Dedicated `AdminAvailability` screen with fewer filters. | Same records, permission-protected contact details and audited access/cancellation; tested. Native date/resource/conflict filtering is behind web (F12). |
| Activation governance, pp. 12–15, 23 | Backend status panel, blockers, submission and Admin review integrated. | Vendor support/status and Admin activation actions integrated. | Readiness no longer grants approval; authorized Admin transition required. Suspension, permission denial and read-only readiness tests pass. Cutover/legacy ACTIVE inventory not deployed. |
| Profile support, pp. 12–15 | Shared configured WhatsApp/call URLs and state-specific status UI. | Uses same number with `Linking`. | Exact `+919403891095` contract tested. Device dialler/WhatsApp handoff and real delivery/response remain unverified. |
| Public landing and prompts, pp. 16–20 | Existing landing, prompt/auth continuation and responsive layouts present. Hardcoded trust claims and no-op footer items remain (F01–02). | Native landing, planning intent and navigation exist. Legal access is not established in native screen/navigation source. | Complete 320/360/375/390/430/768/1024/1366 viewport and keyboard/refresh checks not performed in this audit. |
| Privacy/Terms, pp. 17, 20–22 | **Missing in current customer checkout:** footer renders spans and `App.jsx` has no public policy routes. Isolated preview has separate Privacy Policy work. | No complete public legal-page navigation found in inspected native auth/landing/App paths. | Approved Terms content, public routes and deployed refresh behavior remain dependencies. Do not treat a fix in another branch as shipped. |
| Authentication, pp. 20–22 | Email OTP/password, phone OTP, Google and role-aware UI/API exist. QA pages remain in router. | Native auth, session transport, Google/OTP integration and intent preservation exist; relevant unit tests pass. | Rate limiting and server verification exist. Production QA exposure is configuration-dependent, not an unconditional production ban (F03). Live delivery/redirect/account-linking E2E still needed. |
| Vendor dashboard, pp. 22–25 | Real backend activation, setup checklist, financial overview, enquiries, quotes and calendar. Still long/repetitive and contains fabricated auto-fill path (F04). | Native dashboard consumes readiness and business records with status/support. | Counts/financial truth shared. One highest-priority action, empty/error presentation and complete responsive acceptance remain partial. |
| Enquiries, pp. 25–26 | Owned enquiries, readiness and contextual actions available. Full specified blocked/empty/error-state matrix not proven. | Enquiry detail/respond/quote actions and ownership-aware API consumption available. | Activation gate tested; tenant checks present. Naming still mixes Leads/Enquiries in places; all assignment/status-audit cases not covered. |
| Quotes and negotiations, pp. 26–27 | Draft/send/counter/revise/accept/payment UI exists. | Native quote and customer negotiation/payment actions exist. | Acceptance no longer itself confirms booking in current backend; schedule/activation checks integrated. Fixed advance, missing versioned commercial snapshots and incomplete line-item terms are P0 gaps (F05–06). |
| Bookings and execution, pp. 27–28 | Booking list, start, evidence and Core status present. Some fallback labels, generic checklist and console-only load errors remain. | Native booking detail guards payment+confirmed state and supports evidence/communication. | Payment/execution/settlement service boundaries exist. Category-specific templates and explicit PASS/REVIEW/FAIL lifecycle are incomplete (F10); full completion→settlement E2E missing. |
| Portfolio/projects, pp. 28–29 | Multi-media projects, covers, upload and project management exist. Quick Auto-Fill invents public showcase content. | Native portfolio upload/projects and browsing exist. | Ownership/Cloudinary integration exists. Rights confirmation, actual-content validation, safe publication and category-aware requirements incomplete (F04/F09). |
| Services/capabilities, pp. 29–30 | Multiple services, pricing/capability/coverage/resources and setup buffers exist. | Native service/resource configuration exists. | Historical service safety fails handbook: DELETE hard-removes service/capability/coverage without reference checks (F07). Structured inclusions/exclusions/terms and category constraints are partial. |
| Travel pricing, pp. 30–32 | Existing policy and cost UI with breakdown. | Native availability/travel settings and cost consumption exist. | One vendor-wide policy, fallback estimates and hardcoded charges; no full per-service/round-trip/crew/day contract snapshot (F08). |
| Payments/settlements, pp. 32–33 | Shared read-only financial truth exists, but web fetch failures can display zero/empty data and payable falls back to gross total (F11). | Native payments distinguishes API errors better; still labels verified amounts as escrow. | Server verification and ledger/reconciliation infrastructure present. Custody, refunds and bank settlement are not proven by a gateway success or these tests. Manual settlement takes a transfer reference; external bank confirmation not verified here. |
| Reviews/Google/ranking, pp. 33–34 | Reviews, distribution, Google link/reply and no-review handling exist. | Native reviews/replies and separate Google data exist. | Vendor self-review creation denied. Full customer eligible-booking submission/moderation, uniqueness and ranking version/confidence rules not established (F13). |
| Vendor analytics, pp. 34–36 | Ratios calculated from aggregate current counts; no properly attributed cohort funnel (F14). | Basic recorded counts and booking totals, not full funnel/time-period/median response implementation. | Admin product metrics is a useful separate foundation, not a substitute for the detailed vendor analytics contract. |
| Messages/action center, pp. 36–37 | Customer message threads, notifications and Aura history exist separately, but not complete four-section unified action center. | Updates, threads and Aura history exist; some navigation separated. | Ownership/live-refresh infrastructure exists. Unified counts/actions/deduped blocker lifecycle and full state freshness evidence remain partial (F15). |
| Accessibility/responsiveness, pp. 16–25, 28 | Responsive utility CSS, labels/focus and reduced-motion support present. | Native safe-area, keyboard, accessibility and reduced-motion mechanisms exist. | Not a completed screen-reader/contrast/keyboard/all-width/device audit. Passing build/types is insufficient. |
| Product metrics, pp. 15–16 | Admin Product outcomes UI and customer feedback present. | Admin outcomes and feedback consumers present. | Shared `productMetrics` has definitions and null empty samples. Longitudinal outcomes/real provider metrics require actual deployed observations. |
| Release proof, pp. 13–16, 20–22 | Local build/tests pass; separate preview evidence exists. | Unit tests/types pass; no native device E2E in this audit. | Contract/index preparation and rollback notes/scripts exist. No staged rollout, migration, provider, security penetration or physical-device acceptance proof supplied. CI coverage does not run all current web tests on AWS deploy (F16). |

## Confirmed gaps and priorities

These are source findings, not claims that a production exploit or live payment loss occurred.

### F01 — P0: public legal links are not implemented in current customer checkout

`web/src/components/PublicFooter.jsx:122` renders Privacy Policy and Terms as styled spans rather than links; `web/src/App.jsx:127` defines no policy routes. Native auth/landing/navigation search did not identify a complete corresponding public legal flow. The isolated preview has Privacy Policy code, but that does not repair `customer` or provide approved Terms content. Add approved public destinations and test direct URL, refresh, footer, login and native opening.

### F02 — P0: hardcoded trust and custody claims

`PublicFooter.jsx:16` hardcodes 10K+ events, 4.8/5, 5K+ verified vendors and 100% secure payments; `:44` states escrow/settlement active. Login and vendor financial screens repeat escrow claims. No production evidence was inspected to substantiate these. Native `VendorInsights.tsx:81` also calls verified collections “In escrow.” Replace or substantiate claims; gateway verification alone is not proof of regulated custody or bank settlement.

### F03 — P0: production QA safety depends on an overrideable flag

`server/src/config.js:153` allows `ENABLE_DEV_TOOLS=true` even when NODE_ENV is production. `/dev-auth` in `auth.routes.js:64` checks that flag and accepts a requested email. QA pages are also routed by the web app. The default is safer, but the handbook requires production bypass to be inaccessible, not merely usually disabled. Verify deployed configuration and add an unconditional production prohibition plus direct-API denial tests. Existing app-review OTP logic is limited to a configured, marked account and freshly requested challenge; those four unit tests passed. It is not proof that all production QA endpoints are disabled.

### F04 — P0: Quick Auto-Fill fabricates business/portfolio facts

`web/src/pages/vendor/pages/DashboardHome.jsx:1034` creates a dummy operating origin, then `:1063` publishes a Grand Taj Ballroom showcase with stock media and a delivered-project description. This path exists in the current customer checkout; the preview removed the dummy origin but not the full fabricated publication behavior. `portfolio.routes.js:283` also supplies stock-cover defaults. These records can count toward portfolio readiness. Use clearly identified development fixtures or vendor-provided draft facts; do not publish invented claims. Mobile shares the resulting records even if it does not show this button.

### F05 — P0: quote advances are still fixed, with no accepted policy version

`server/src/external/routes/transaction.routes.js:30` sets ADVANCE_PERCENTAGE=30 and uses it across quotation/payment paths. `Quote.js:70` defaults to 30. Customer cart holds consult `minimumReservationPercent`, so commercial paths are not one consistent policy contract. The Quote schema does not persist the applicable payment-policy version and accepted milestone schedule. This affects both clients. A mathematically correct 30% calculation is insufficient under handbook §18.

### F06 — P0: commercial versioning and terms are incomplete

Quote schema stores a price breakdown, free-text notes, status and transition history, but not a complete immutable/versioned line-item/inclusion/exclusion/tax/cancellation/payment-term snapshot. Revision updates in `transaction.routes.js` do not establish a customer-supplied expected quotation revision. A status history is not a full versioned commercial offer. Add explicit accepted-version checks and immutable submitted terms; test stale counteroffer/acceptance, expiry/rejection and duplicate submission.

### F07 — P0: service deletion can break historical references

`server/src/external/routes/vendor.routes.js:385` hard-deletes the owned service and then its capabilities and coverage. No check for Quote/CoreBooking/customer history references is performed there. Native/web delete actions inherit this behavior. Use archive/deactivation for referenced services and preserve historical contracts; test referenced deletion and category/resource constraints.

### F08 — P0: operational feasibility and travel policy contract incomplete

- `leadTimeDays` is stored/edited, but no enforcement was found in matching/booking paths searched.
- `durationMinutes` is stored, but confirmed quote checks commonly request all-day availability; full event duration/setup/teardown scheduling is not demonstrated.
- Weekly hours are stored as a mixed object. Readiness accepts text matching `open|full|am|pm|digits` rather than requiring unambiguous normalized operating windows. The Aura prompt intentionally treats office hours differently from event availability; that product distinction needs an explicit handbook mapping, not silent assumptions.
- `TravelPolicy.js` is vendor-wide/unique per vendor, without full service overrides, round-trip semantics or crew/day allowance units.
- `totalCost.service.js:57` uses a default 10km estimate without an origin; `:83` hardcodes a 300 toll/parking estimate. Such estimates need explicit uncertainty, reproducible units and accepted-quote snapshots.

The shared conflict/resource/locking foundation is working and tested; this finding does not negate those tests.

### F09 — P0: portfolio publication and media safeguards incomplete

`portfolio.routes.js:3` limits multipart size, but upload handling relies on supplied media type/filename and Cloudinary auto detection without the full required application-level actual-content/provider policy. Project create defaults to PUBLISHED, accepts generic Wedding/Cinematic/Mumbai details and a stock cover, and does not require a saved media-rights confirmation or completed media-processing state. UI/native upload success is not proof of these safeguards. Add ownership/rights/publication validation and failure/partial-upload tests.

### F10 — P0/P1: execution templates and validation outcomes incomplete

Native `VendorBooking.tsx:52` and web booking UI use a generic execution checklist. `executionSettlement.service.js:238` validates with approved/rejected state/notes rather than a complete category-aware PASS/REVIEW/FAIL outcome model. Vendor execution and settlement are permission-gated, but comprehensive evidence metadata/retention, category requirements, duplicate transitions and completion→settlement journeys are not covered by current tests. Prove real financial release separately from manual reference recording.

### F11 — P0: web financial failures may look like valid zero balances

`InsightPages.jsx:30` catches financial-truth failure to null and only logs overall failure. Cards still derive empty-booking zeros and “no overdue receivables.” The helper near `:14` can treat gross booking total as vendor payable when payable is absent. This violates missing-vs-zero and payable separation requirements. Native shows more explicit fetch errors, but still needs confirmed custody language and complete refund/settlement-state coverage. Show unavailable/stale with retry and never infer payable from gross.

### F12 — P1: native Admin availability filters lag web

`mobile/src/screens/AdminAvailability.tsx:9` exposes vendor/type/status/page; it lacks the full web date range/resource/conflict filter set. It does show same records, conflicts, history, permission-redacted contacts and authorized cancellation. Add missing filters and device-friendly selectors; retain server privacy tests.

### F13 — P0/P1: review acquisition/moderation/ranking acceptance is not established

Vendor review creation is correctly rejected (`vendor.routes.js:990`). Reading/replying to published reviews and separate Google display exist. However, no complete customer eligible-booking submission and moderation journey was found in the inspected current customer routes/services. `VendorReview.js` allows nullable booking/customer, defaults verified/published, and lacks a unique eligible-booking review index. Establish the authoritative writer, duplicate and ineligible-booking protections, moderation/audit rules and ranking version/confidence policy before claiming full compliance. Missing/failed Google retrieval also needs an explicit state distinct from no linked data.

### F14 — P0/P1: vendor analytics is not the required cohort funnel

`web/.../InsightPages.jsx:667` divides current total quotes by enquiries and bookings by quotes; these are not linked eligible cohorts with a consistent attribution window. Native `VendorInsights.tsx:29` supplies basic counts and totals rather than the specified funnel, reporting periods, median response and sample sizes. Define central cohort membership, dedupe, periods/timezones, cancellations/refunds and test exclusions. No-denominator handling is partly present but does not fix attribution.

### F15 — P1: unified action center incomplete

Web `Messages.jsx` is primarily customer threads; native `Conversations.tsx` has updates/threads and a separate Aura history screen. They do not fully implement one four-section Notifications / Customer Messages / Aura Conversations / Action Required surface with defined counts, stale-state presentation and backend-resolved blocker actions. Existing conversation history and ownership should be reused.

### F16 — P1/release gate: evidence, test coverage and branches need reconciliation

AWS CI runs server tests and web build; the inspected deploy workflow does not run the current web unit-test command. Mobile CI exists, but shared unified modules are not all covered by its path trigger list. The current server retains only two test files; earlier preview regressions live in another worktree. Consolidate relevant tests/contracts before rollout. Existing unified changes include many uncommitted files, and visual/booking fixes remain separately committed in the preview. Do not deploy either partial branch under the assumption it contains everything.

## Shared architecture and reusable pieces

| Concern | Current reusable authority | Main consumers |
| --- | --- | --- |
| Customer event/requirements/readiness | CustomerEvent/EventRequirement; dashboardPolicy/understanding/events services | Web HomePage; native Customer; Aura context |
| Money | Customer Payment/Booking + CoreBooking; shared financialTruth; gateway verification/ledger services | Customer budget, vendor payments, Admin, Aura |
| Schedule | VendorBlockout/VendorBookingSlot/CoreBooking/holds; availability, commitments and scheduleLock services | Vendor calendar, Admin availability, matching and confirmation |
| Activation | VendorOrganization activationReview/history; activationDecision and Admin review service | Vendor ProfileStatus, native VendorHome, Admin review and matching |
| Notifications | Existing inbox collections; NotificationPreference, CustomerReminder, push jobs/policy | Web updates/preferences, native push/preferences, workers |
| Support | shared/vendorSupport.js | Web ProfileStatus and native dashboards |
| Media | Existing Cloudinary/portfolio endpoints and PortfolioItem | Web portfolio, native portfolio, messaging/evidence |
| Metrics | productObservability/productMetrics; existing source records | Admin outcomes; should inform future vendor funnel without parallel ledgers |

## Web vs native parity in plain terms

Native is not just a copy of the web layout: it uses React Native/Expo and shared APIs. It already has Core-backed event planning, vendor work, calendar, portfolio, messages/voice, notification preferences, activation/support and Admin screens. Its unit tests/type-check pass. Its remaining gaps include public legal access, full vendor analytics/action-center contract, complete Admin filtering, category-specific execution, publication safeguards and device/provider evidence. Shared backend P0 issues apply to both clients.

The browser being viewed now is a separate local test build, not the current customer checkout or a native binary. Recent logo/chat-bubble and booking QA changes must be deliberately integrated with the newer customer implementation; a wholesale merge without conflict review risks undoing activation/schedule governance. No merge is performed in this audit.

## Handbook dependencies and ambiguities

1. **Truncated source:** page 42 ends mid-item, “Travel time between localiti”. Requirements after that cutoff cannot be audited from this file. Obtain the remaining pages if any.
2. **External customer details:** the main text (p.9) lists name/phone, while the detailed calendar section (p.41) explicitly makes them optional unless an operational requirement is documented. Current backend requires both. Resolve policy before changing validation or claiming conformity.
3. **Duplicate analytics:** sections 25 and 26 repeat the analytics requirements; counted once here. Page 35 also includes a broken acceptance fragment.
4. **Recurrence:** explicitly conditional/separately scoped in the handbook. No recurrence engine was found; this is an optional extension, not automatically a release blocker.
5. Approved Terms text, evidence supporting market/escrow/statistical claims and applicable payment-policy versions must come from the product/business owners; they cannot be invented by implementation.

## Recommended sequence, without implementing changes

1. Consolidate current customer implementation, preview fixes and meaningful regression tests in a reviewable integration branch.
2. Address P0 authentication, legal/trust, fabricated publication, quote policy/versioning and archive safety.
3. Complete operational/financial contracts: lead time, durations, category evidence, travel terms, safe unavailable states and review provenance.
4. Finish web/native parity: action center, vendor cohort analytics, Admin filters and clear next-action/error states.
5. Run isolated API/permission/concurrency tests, all specified browser widths and physical Android/iOS journeys. Prove configured OTP/Google, deep links, push quiet-hours delivery, payment/refund/reconciliation and support app opening in staging.
6. Prepare additive indexes/legacy activation review, staging cutover and rollback. Deploy only after recording actual acceptance evidence.

No application code was changed for this comparison. The report and test/build logs are local artifacts; no production readiness or live provider success is implied.
