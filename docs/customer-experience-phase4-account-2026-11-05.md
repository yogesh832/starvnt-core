# Customer experience — Phase 4A Account and retained event records

Date: 5 November 2026 (Asia/Calcutta). Status: implemented locally following the instruction to continue. Private Gallery implementation, recurring reminder contracts and release acceptance remain open.

## Changes

- Account now leads with profile, event documents, saved items, proposals, conversations, relationships/feedback and privacy/preferences. Existing Customer 360, interests, referrals and approved commercial features remain reachable; no new benefits or membership entitlements were added.
- Profile editing changes only `fullName`. It no longer submits the displayed phone as an unrelated field, so concurrent OTP-controlled contact changes are not overwritten. A successful save refreshes the account identity/header through the existing authenticated `/auth/me` route and existing session-revision guard. Name remains self-reported; phone changes still use existing verification settings.
- Profile and event loading/failure are explicit. Counts remain unknown until saved events load. A failed refresh retains previously loaded records with a warning, rather than inventing zero events. Counts use Core's supported statuses: draft, planning, booked, in_progress, completed and cancelled.
- Account history supports status/search filters and reversible archive/restore. Archive is explicitly a **browser-only, account-scoped view preference**. It affects Account and Events lists, not event status, Home/switcher availability, bookings, payments, documents or conversations. Active/reopened events cannot be hidden by a stale archive preference.
- Preferences use `starvnt_event_archive:<customerId>` in local storage, with validated bounded IDs, storage-failure feedback, same-browser/cross-tab refresh and no anonymous persistence. A failed write does not pretend the archive succeeded. The local limit is 1,000 IDs; reaching it asks the user to restore an entry instead of silently discarding earlier preferences. This is not a cross-device or server archive capability.
- Events cards now render their existing action slot outside the event link. Archive/restore and the existing draft action menu are accessible without nested interactive elements. Deletion still uses the original Core endpoint, remains limited to unconfirmed drafts, and requires the existing explicit confirmation dialog.
- Completed and cancelled events now lead with retained event facts and their actual terminal status. Planning-readiness rings and essentials-progress bars are omitted from terminal event views/cards; no new readiness formula was invented.
- Retained records connect bookings/payments, saved budget, documents, timeline, conversations and existing feedback relationships. Event completion does not verify payment or settle balances; cancellation does not imply a refund. Pending payment verification remains visible. Record counts are labelled as records, not invented commercial totals.
- Records remain independent of Gallery publication. Chat attachments, feedback photos and execution evidence are not automatically imported into an album or made visible by a customer-name/contact match.
- Controls use visible focus, 44px targets and mobile-size fields. Profile edit/cancel and archive actions manage focus. Existing notification preferences, privacy requests, Experience feedback and non-ticket execution remain intact.

## API, permissions and data impact

No backend, schema, index, database migration or new mutation endpoint was added. The web uses existing customer-owned profile/events/dashboard/document/conversation routes. Existing profile validation, contact verification, draft deletion, booking/payment and privacy/consent rules remain authoritative.

The only shared authentication addition is `refreshIdentity()`, a read of the existing authenticated `/auth/me` endpoint followed by the existing portal/session acceptance path. Its captured session revision prevents a response from overwriting a newer login, surface switch or logout.

Archive never calls a business API. Browser storage is a presentation preference and establishes no ownership or permission. All event records still come from customer-authorised APIs. Native screens do not inherit this local browser preference and were not redesigned.

## Verification

- Web suite: **78 passed, 0 failed**. New checks cover account key isolation, malformed preference data, unknown versus empty counts, supported active statuses, reopened events and history filtering, plus previous phase regressions.
- Connected Chromium: **32 checks passed**, using the actual Express application and disposable MongoDB replica set. Tests cover profile failure/retry and name-only payloads, retained phone, archive reload/restore, two authenticated accounts, shared Events archive view, blocked storage, completed/cancelled records, pending payment truth, existing draft confirmation/deletion and no implicit Gallery/media upload. Profile/history failure responses are injected at the browser boundary.
- Account, post-event and Events views verified at 320/768/1440px with no horizontal overflow. Screenshots reviewed and mobile profile layout corrected. Zero page runtime errors in the final run.
- Customer and Partner production builds passed. Existing Vite bundle-size warnings remain.
- Backend services were unchanged in this section. The earlier Phase 3 server run remains **92 passed**; it was not counted as a new server run here. Connected browser checks exercised existing profile, identity, owned event and draft-delete endpoints against isolated records.
- Preservation compared 692 original baseline files: only 33 approved existing files across completed phases changed, with no missing or unrelated changed baseline files. Added files are separate. Existing dirty work remains intact; no commit or deployment was performed.

Evidence: `C:/Users/Hp/.codex/visualizations/2026/11/05/01a1aa05-b9ee-72e0-91b8-268175f49f33/phase4-dev/`, including pre-development diff, web/build logs, browser script/results/screenshots and preservation report. Test accounts, sessions, events and deletion fixtures were disposable and local. No production DB, external media, provider, live outreach or production deployment was used.

## Gallery and remaining programme work

The concrete source inventory, proposed authority/API workflow, acceptance tests and missing provider/rights/retention inputs are in [the Gallery integration review](customer-gallery-integration-review-2026-11-05.md). The existing chat uploader is not a private event album contract. No Gallery feature, upload quota, publication rule, family grant or retention period has been activated.

Remaining work includes reviewed private Gallery assignment/publication/revocation, named/typed collection migration, cross-device archive if approved, recurring occasion reminders after timezone/recurrence/consent rules, native coverage and staging/provider/screen-reader acceptance. Existing optional event interests and one-off notification/reminder capabilities remain unchanged; this work does not enrol customers in reminders or marketing.

Rollback can restore the prior web presentation without data migration. Ignore or remove only the requesting account's local archive key to reset that view; never change event/payment/booking statuses or delete retained records as an archive rollback. Keep existing Core ownership, OTP and deletion checks in place.

The Vendor Partnership Agreement & Compliance Engine remains an independent dependency. Ticketing remains excluded; Experience QR feedback is preserved. This section does not complete the full Customer OS programme or authorise a production release.
