# Phase 1 verification

18 November 2026. Scope: PDF 16.15.2, Partner command center foundations. Baseline: b718a05ec5249106f943e25548bfa6104904190c. Implementation is on vendor-dev; this task does not deploy or promote it.

## Automated evidence

| Check | Result |
| --- | --- |
| Full backend suite | 331 passed, zero failures or skips |
| Final focused integrity/search suite | 17 passed after the final order/payment-alias deduplication adjustment |
| Web unit tests | 36 passed |
| Mobile unit/navigation tests | 115 passed |
| Mobile TypeScript | Passed, no diagnostics |
| Production Vite build | Passed |
| Signed-in Main17 browser scenarios | 20 passed, including five Phase 1 scenarios |
| Whitespace/error check | git diff --check passed |

The full backend run preceded the final covered payment-alias adjustment; the final focused suite covers that adjustment. Counts are separate runs, not an additive unique-test total. Logs are local evidence in tmp/vendor-main17-phase1: backend-tests.log, search-privacy-tests.log, web-tests.log, mobile-tests.log, typecheck.log, web-build.log and browser-tests.log. Browser report: tmp/vendor-main17-implementation/browser/report.json.

Backend tests use synthetic records in isolated MongoMemoryServer. Browser checks use local Express, password authentication and the production frontend bundle. No live provider transaction or production-data mutation is part of these checks.

## Behavior checked

- All seven dashboard dependencies fail independently without turning missing source values into successful zeroes. Shared widget tests cover stale/current transitions, account and period isolation, unavailable readiness, bounded data and malformed successful responses. Browser checks exercise a real synchronous review-query failure, dashboard HTTP failure and retry recovery.
- Search verifies owned records and foreign-tenant exclusion, literal queries, hidden identity documents, masked identity-shaped display text, verified-booking customer-name gating, legacy invoice references, linked payment deduplication and stable pages. Browser checks navigate ten service results across two pages without duplicates or horizontal overflow.
- Business profile and onboarding retain different canonical denominators. Dashboard and readiness agree with the backend; ancillary linked-profile failure leaves readiness usable. Current eligibility is withheld if its source fails.
- Launchpad uses evidence for completion and separates observed transition time from unknown historical source-event time. Legacy missing timeline/cohort and unavailable evidence/history remain explicit.
- Native destinations map search/readiness/Launchpad links to existing screens. Responsive web navigation contains keyboard focus, closes with Escape and restores focus to its toggle.

## Visual and acceptance limits

Reviewed browser captures at tmp/vendor-main17-implementation/browser/phase1-search-mobile-web.png, phase1-dashboard-desktop.png and phase1-readiness-mobile-web.png. Search at 390px fits the viewport and renders the second page's two records; dashboard distinguishes source failure from successful data. Readiness retains canonical metrics under an ancillary source failure.

No native device or emulator was connected. Physical Android/iOS validation and full screen-reader/manual product acceptance remain open; responsive browser tests and TypeScript do not substitute for them. Acceptance.csv records these limits and does not claim completion of later PDF phases. Existing production remains the earlier b718a05 release.
