# Customer experience — Phase 4B one-off event reminders

Date: 5 November 2026 (Asia/Calcutta). Status: implemented and verified locally following the instruction to continue. This exposes and hardens the existing one-off reminder capability. Recurring occasion reminders and private Gallery contracts remain separate.

## Customer behaviour

- Added an event reminder manager at `/customer/reminders`, reachable from Account, notification preferences and event records. It supports owned event/status filters, stable cursor pagination, history, review-before-save and explicit cancellation review. The existing five mobile destinations remain intact.
- Reminders are explicitly requested one-off commands. New reminders require an active event; completed/cancelled event reminders are not offered. This matches the existing worker, which rechecks ownership and lifecycle before delivery and cancels a reminder whose event has closed.
- Entry uses the device timezone, displayed next to the form. Review shows the resolved date, time and offset before saving. Invalid calendar values and nonexistent device-local DST times are rejected. For repeated DST wall times, review exposes the browser-selected offset. The database stores an absolute instant; later rendering uses the viewing device's timezone. Quiet-hours timezone remains a separate existing preference.
- A lost creation acknowledgement retains the exact command and request key for retry. Inputs stay locked until the uncertain command resolves, rather than creating another command with a new key. Server replay works after the original due time or status change. Confirmed records remain in reminder history; this is not an offline draft queue or cross-device pending-command store.
- Temporary cancellation failure retains the original review and retry controls. A lost acknowledgement can safely retry the same cancellation. Processing/finished reminders cannot be overwritten as cancelled. Success is announced only after the server acknowledges it.
- `DELIVERED` in the worker model is presented as **Notification created**, because it records hand-off to STARVNT notifications, not proof of SMS/email/push delivery. Processing, cancellation and suppression retain distinct labels. This work adds no external delivery provider or new messaging consent.
- Paging/filter changes remount scoped state and invalidate late requests. Read failures retain previous records with a warning, not an invented empty list. Loading more merges by durable reminder ID. Refresh restarts pagination; the read model is not a historical snapshot under concurrent changes.
- Shared notification preferences now separate loading/error/success, retain failed edits, disable overlapping saves and use the server-validated response. Customer reminder actions link to the manager instead of competing inline reminder lists. Vendor channel, type and quiet-hour controls remain available, with separate owner records.
- Controls have labels, focus styles and 44px targets. Save/cancel review headings receive focus. Mobile fields use the existing Account input styling.

## Existing API extensions and validation

| API | Contract | Permission and effects |
| --- | --- | --- |
| `GET /api/customer/reminders` | Default pending/processing list remains capped at 100 for existing clients. Optional `eventId`, `status=active|all|PENDING|PROCESSING|DELIVERED|CANCELLED|SUPPRESSED`, `limit=1..100`, `cursor`. Web uses 25 per page. Returns `reminders` and `nextCursor` | Customer-owned records only; scoped events reauthorised. Row IDs/event references remain compatible. Adds owned event title/status; omits worker internals |
| `POST /api/customer/reminders` | Only `eventId`, `title`, `dueAt`, `idempotencyKey`; title 1–140 trimmed characters; valid ISO calendar timestamp with seconds and explicit offset/Z; new command due in future | Existing owned event required; terminal events reject new commands. Stores only a PENDING reminder; does not immediately create a notification or commercial record |
| `DELETE /api/customer/reminders/:id` | Atomic PENDING → CANCELLED; repeat CANCELLED succeeds | Owner only. Processing/finished states return 409; missing/inaccessible reminder 404. Worker and cancellation race on the same saved status |
| Existing customer/vendor notification preferences | Routes, policy validation and owner keys unchanged | UI changes only; marketing permission and delivery rules remain separate and unchanged |

Request keys retain existing printable string compatibility up to 160 characters, including the native client's timestamp/random format. Idempotency is scoped to customer+key through the existing unique index. Same key/different command returns `409 IDEMPOTENCY_CONFLICT`; replay does not mutate an existing reminder's date, title or state. Concurrent first saves resolve to one saved row.

Cursors encode the owner/filter scope and final scheduled-time/ID boundary. They are untrusted pagination data, not access grants: customer ownership remains in every query. Malformed, cross-owner or changed-filter cursors return 400. Ordering is scheduled time ascending, then immutable ID. Unknown/inaccessible scoped event IDs return 404. Authentication/account-type checks remain unchanged.

Error examples: `INVALID_REMINDER`/`REMINDER_IN_PAST` (400), `EVENT_NOT_ACTIVE`/`IDEMPOTENCY_CONFLICT`/`REMINDER_ALREADY_DELIVERING` (409), `EVENT_NOT_FOUND`/`REMINDER_NOT_FOUND` (404). Existing response fields used by native clients remain available; native screens were not redesigned. Native timezone review and physical-device acceptance remain unverified.

## Data, worker and rollback impact

Reuses CustomerReminder, NotificationPreference and CustomerEvent. No schema, new index, backfill, recurring schedule, commercial ledger or provider configuration was added. The existing reminder/deadline workers and notification delivery/consent logic were not changed. Event closure can race creation; the existing worker's final lifecycle check remains authoritative before delivery.

Backend logic is now isolated in `server/src/notifications/reminders.service.js`; the existing router delegates to it. The service's clock argument is an internal test seam, not an HTTP input. Browser retries retain the command in the current view; reload clears the form and reads saved records.

Rollback can remove the new web route/links and optional paging filters while retaining all saved reminders, status history and preferences. Do not restore duplicate-creation or processing-overwrite behaviour as a presentation rollback. Keep current ownership, idempotency and lifecycle checks. No data/index downgrade or domain/cookie migration is required.

## Verification

- Web suite: **82 passed, 0 failed**. Covers device-time conversion, invalid calendar input, notification hand-off wording, page merge and earlier phase regressions; reminder URLs participate in existing event-context isolation checks.
- Final server run: **103 passed, 0 failed**, sequentially across reminders, library, foundation, proposals and unified-product suites. Includes owned create/cancel/list, native key compatibility, late replay, concurrent key reuse, invalid input, closed events, cursor scope/ordering, cancellation/worker race, duplicate-notification prevention and separate customer/vendor preference owners.
- A parallel attempt alongside both builds recorded a schedule-lease failure and subsequent fixture failures. Its log is retained as `server-tests-parallel-attempt.txt`. The final sequential run passed without changing scheduling code, lease duration or assertions; release/CI resource and lease behaviour still need their normal acceptance checks.
- Connected Chromium: **26 checks passed** against the actual Express app and disposable MongoDB replica set. Tests inject dropped creation/cancellation acknowledgements, cancellation/read failures and a delayed page response. Verify one saved command, exact stored instant, explicit cancellation, late-response isolation, closed events, preference validation/retry and history pagination. DST checks use a separate New York browser timezone. Zero page runtime errors.
- Responsive checks at 320/768/1440px passed with no horizontal overflow; desktop/mobile screenshots reviewed. Customer and Partner production builds passed; existing Vite bundle-size warnings remain.
- Preservation compared 692 original baseline files: only 35 approved existing files across completed phases changed, with no unrelated changed or missing baseline files. New implementation/tests/records are additional. Existing dirty work was retained; no commit or deployment was made.

Evidence: `C:/Users/Hp/.codex/visualizations/2026/11/05/01a1aa05-b9ee-72e0-91b8-268175f49f33/phase4b-dev/`: pre-development diff, web/server logs, parallel-attempt diagnostics, browser script/results/screenshots, build logs and preservation report. Business records and notifications were disposable local fixtures. No production DB, provider delivery, external outreach or deployment was used.

## Remaining programme scope

Recurring occasion reminders still need the approved recurrence/timezone/consent/materialisation contract. Private Gallery needs the provider/rights/assignment/publication/revocation and retention decisions in the Gallery integration review. Named/typed collections still require the reviewed uniqueness migration and source-data inventory. Native coverage, staging/provider/screen-reader acceptance, domain migration and production release remain open.

Vendor Partnership Agreement & Compliance Engine remains an independent dependency. No new fee, tax, reward, membership, settlement or agreement rule was introduced. Ticketing remains excluded and Experience QR feedback remains preserved. This section does not complete the whole Customer OS programme.
