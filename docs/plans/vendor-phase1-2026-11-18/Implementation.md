# PDF Phase 1 - Partner command center foundations

Date: 18 November 2026. User confirmed the scope is **PDF 16.15.2**, not every P1-priority finding, the B1 identity batch or Financial Foundation. Work remains on vendor-dev. Baseline production/main/vendor-dev release was b718a05 before these changes.

## Scope

Permission-aware search, dashboard reliability states, canonical readiness, the evidence-based 30-day Launchpad and mobile navigation reconciliation. The mapped items are V10-V13 and V20, plus mobile navigation. Although the older engineering B2 group included V14 onboarding expansion, the PDF places that in Phase 2; it is excluded here.

No new invitation/admission engine, quotation lifecycle, Academy/meeting feature, Customer 360, campaign, banking/provider activation, agreement enforcement, tax, settlement, reward or SOURCE work is included. Later-phase behavior is covered only by retained regression tests. Admin and Aura changes here are limited to canonical readiness labels/count presentation; their operational command/permission policies are unchanged.

## Changes

- Search accepts existing quote, invoice, booking, date/status and payment references through bounded tenant-scoped queries. Mixed Core/quote payment summaries are deduplicated before stable pagination using a fixed bounded window. Caps are explicitly partial; no unbounded source scan or fabricated total. Identity documents stay excluded, identity-shaped text is masked, customer-name matching does not reveal an unverified booking, and ordinary result fields remain minimal.
- Web and native search provide category filters, previous/next pages, unavailable/partial/empty distinctions and real record destinations. Six additive tenant/_id order indexes reuse existing models. No syncIndexes/drop/backfill is run.
- Dashboard sources now isolate synchronous query failures as well as rejected promises. Shared presentation-only widget state records successful syncs, keeps usable historical read-only data explicitly stale, leaves partial results honest, and separates account and measurement-window caches. Bounded/inconsistent data cannot be silently replaced by old values. Readiness never borrows cached eligibility after a source failure. Malformed successful responses are rejected rather than rendered as an empty dashboard.
- Existing detailed record lists keep saved values during failures and show per-source sync/retry status; shape validation and request-generation checks prevent malformed or late responses from being presented as current. Goals do not render a failed request as a genuine empty list.
- Backend onboarding completed/total counts join existing canonical percentages and ten metric definitions. Three-field business-profile completion is labelled separately from six-group onboarding on dashboard, readiness, setup/Aura and Admin review. Native readiness and metric deep links use the same Core source. No eligibility rule or provider status is bypassed or recomputed in the frontend.
- Readiness remains usable when an ancillary operating-base/profile source fails; current eligibility is withheld when readiness itself fails.
- Launchpad preserves evidence/roles/history/deep links and records the latest observed transition into completion. Source event completion time remains unknown where it cannot be proved. Missing legacy timeline/cohort values do not become today's date or an invented membership; elapsed time grants no milestones. Current evidence remains visible if history fails, history output is bounded with explicit truncation, and unknown progress is labelled.
- Existing mobile tabs/workspace are retained. Search/readiness and Launchpad links reach the right existing editors. Responsive web navigation has a labelled mobile dialog, contained keyboard focus, Escape/close focus return and full-width mobile search.

## Validation and limits

Results are recorded after the final run in Verification.md. Tests use isolated MongoMemoryServer, explicit test environment configuration and synthetic identities. Browser acceptance uses real local password authentication, Express and a production Vite bundle. New source failure cases cover all seven dashboard dependencies; search tests cover mixed-source pages, deduplication, references and privacy; shared widget tests cover stale recovery, account/period separation and malformed data. Existing later-phase functionality remains regression coverage, not newly implemented scope.

Responsive browser checks are not physical-native-device or full screen-reader acceptance. These remain explicitly open in Acceptance.csv. No successful live bank validation, live payment, provider payout, campaign delivery, production data correction or new legal approval is asserted.

## Compatibility and rollback

Shared backend changes are additive fields/indexes and read/query failure isolation. Existing Customer authentication/navigation, quote/payment contracts and financial rules are retained. New clients must tolerate unknown metadata; backend eligibility remains authoritative. Reverting UI freshness/index declarations does not erase evidence. Do not delete Launchpad history or perform an automatic production schema/index reset. Any index rollout should add missing indexes without dropping existing ones and monitor build impact.

This task does not promote this new Phase 1 work to main or deploy it. The previous production release remains b718a05 unless a later release is requested. [Acceptance.csv](Acceptance.csv) is scoped to this confirmed phase and makes no complete-PDF claim.
