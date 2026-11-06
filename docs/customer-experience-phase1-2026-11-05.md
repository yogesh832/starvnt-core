# Customer experience — phase 1 development record

Date: 5 November 2026 (Asia/Calcutta). Development authorised by the Founder's instruction to continue after the audit/design pack. Status: implemented locally; staging/release acceptance remains open.

## Changes

- Replaced the public entry with scoped ivory/charcoal styling, a clear planning CTA, editorial service exploration, occasion categories, Aura entry and a configurable Partner handoff. Existing brand marks and customer authentication remain in use. No unverified photography, project claims or testimonials were added.
- Guest planning type/location/date become the existing pending planning prompt. The sign-in dialog supports focus containment, Escape, focus restoration and scroll locking. The existing same-browser/session intent mechanism remains; durable cross-device drafts are phase 2.
- Kept the five mobile destinations. Desktop now leads with Home, Events, Aura+, Updates and Account, with existing tools still reachable. Event switching is visible on desktop and mobile, even for one event.
- Event URLs, including Aura event links, determine shell context. Inaccessible event URLs cannot silently fall back to another event. Browser event preferences are account-scoped. Refresh results use a latest-request gate, and the provider remounts on account changes.
- Customer Home prioritises pending decisions and event-specific proposals. It retains existing plan, recommendations, comparison, booking/payment, financial truth, requirement confirmation, timeline and conversation tools. Background dashboard failure retains the last records with a warning and retry.
- Added separate no-event and completed/cancelled-event Home presentations. Removed unfinished Shop promotion from Home, and moved the existing preferences entry out of the main operational hierarchy. Existing Account notification preferences remain available.
- Customer sign-in return URLs retain bookmark fragments. Partner links reuse configured deployment URLs; this work does not cut over production domains.

## Verification

- Web test suite: **55 passed, 0 failed**. Includes 11 added checks for account-scoped preferences, nested/Aura context, unavailable event isolation, late refresh invalidation, proposal scoping, next-action precedence, unsafe destinations and configured Partner handoff.
- Customer production build: passed.
- Partner production build: passed.
- Local Chromium: **18 checks passed**, with isolated mocked APIs and zero page runtime errors in the final run. Public and Home layouts at 1440/768/390/320px, guest intent, keyboard dismissal, event switching, account preference storage, direct event links, stale refresh, empty/past-event states. Screenshots visually reviewed.
- Build output includes Vite bundle-size warnings; code splitting/performance remains release work.
- Browser fixtures are not backend permission, payment/provider, production, screen-reader or native-device proof. No customer business writes were submitted by those checks.
- Native code and backend services were not changed. Previously recorded Expo dependency/typecheck failures remain unresolved; no native release claim is made.

Evidence is under `C:/Users/Hp/.codex/visualizations/2026/11/05/01a1aa05-b9ee-72e0-91b8-268175f49f33/phase1-dev/`: `web-tests.txt`, `customer-build.txt`, `partner-build.txt`, `browser-qa.cjs`, `browser-checks.json`, screenshots, preservation report and pre-development working diff.

## Remaining phase/release gates

1. Staging customer/vendor/admin journeys, real permission denial, browser session/cookie behaviour and provider evidence are unverified. No deployment, domain/DNS/cookie migration, seed or database migration was performed.
2. Shared draft save/resume, explicit venue-arrangement semantics, guided manual/Aura continuity and approved timezone/readiness contracts remain phase 2. The existing venue-name inference is not changed by phase 1 presentation work.
3. Vault, Collections, Gallery/membership permissions and post-event media delivery remain later phases; Home links to existing records, not proposed capabilities.
4. The approved Vendor Partnership Agreement & Compliance Engine remains a separate active dependency. No new agreement, fee, payment, reward, tax or settlement policy was introduced.
5. Ticketing remains excluded. Existing Experience QR feedback and non-ticket event execution remain intact.

The existing dirty working tree was retained. No commit or production release was made. This record does not mark the complete Customer OS programme finished.
