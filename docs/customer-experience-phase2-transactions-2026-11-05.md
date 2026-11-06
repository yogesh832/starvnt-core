# Customer experience — Phase 2B transaction linkage

Date: 5 November 2026 (Asia/Calcutta). Status: implemented locally following the instruction to continue to the next section. Staging/provider acceptance remains open.

## Changes and customer behaviour

- Event Quotes now requests the existing event-scoped vendor-offer API. Offers and enquiries use their saved event links; a matching date no longer associates unrelated events. A linked offer remains visible when the event date changes and explains why an updated quote is needed.
- Replaced the UI's invented 30% advance fallback with saved offer/reservation terms. Missing terms display as unspecified, and saved zero amounts stay zero. Server policy resolution, amounts, financial snapshots and settlement rules are unchanged.
- Offer acceptance has an explicit review step naming the event, offer reference, service, date and saved price. Reviewing makes no commercial write. Acceptance continues through the existing Core endpoint. Accepted offers can reopen review of an existing reservation or request renewal through that endpoint; the server retains its availability, eligibility and replay rules.
- Event workspace, Home, Quotes and Bookings connect to event-specific proposals. Proposal links can identify an exact version. The customer library retains scope, exclusions, payment schedule, exact PDF download and original proposal discussion. A newer sent version blocks decision controls on an older version. Approval still submits the exact snapshot/PDF hashes and requires explicit PDF review; backend checks remain authoritative.
- Quotes and Bookings remount their local state when the event ID changes. An old event's offer review or payment sheet cannot remain active in the next event. Quote deep links focus the requested record; unavailable records are explained. Failed offer refreshes are distinguished from empty results.
- Bookings separates a checkout response from verified payment and confirmed booking. A verified or processing payment cannot be hidden by a later failed attempt. Customers can refresh saved status, identify payment references and open the event conversation for reconciliation. Refreshing does not create a payment or claim to contact a provider.
- Expired holds cannot open payment controls. Payment verification without booking confirmation shows a recovery message and does not offer another checkout for that reservation. Unknown booking statuses do not default to confirmed. External source values, if supplied by an existing contract, receive a distinct label; no external booking store or ingestion was added.
- Cancellation and completion-verification failures are visible rather than swallowed. Booking inspection links require exact saved IDs/references. Zero paid amounts are preserved, and saved under-review reasons are displayed.
- Transaction actions have 44px minimum targets, visible keyboard focus and mobile-sized text inputs. Existing non-ticket commerce, proposal discussions and payment workflows remain in use.

## API and data impact

`GET /api/customer/vendor-quotes?eventId=<owned event>` was already implemented. The web client now supplies that scope; other callers can still omit it for the existing account-wide view. No mutation contract changed.

Added optional `eventId` to `GET /api/customer/proposals`. The server validates the ID, verifies customer ownership, and filters existing SENT proposals by customer and event before the existing latest-100 limit. Invalid IDs return 400, inaccessible events 404, unauthenticated callers 401 and vendors 403. Omitting the parameter preserves the existing customer-wide list. DTOs, frozen snapshots, version/hash response checks and download permissions are unchanged. This is a read-only addition, so no idempotency key is needed.

No schema, backfill, migration, storage or competing chat/payment service was introduced. Rollback can restore the customer presentation and remove the optional list filter while keeping existing event, quotation, proposal, reservation, payment and booking records. Do not delete records or alter approved commercial snapshots during rollback.

## Verification

- Web suite: **67 passed, 0 failed**, including event-link isolation, unknown/zero terms, stale offer checks, payment precedence, expired holds, booking labels and scoped proposal destinations.
- Server integration/regression suites: **60 passed, 0 failed** across the new customer transaction-link tests, existing proposals and unified product tests. Includes customer/vendor/session denial, same-day event separation, date-change continuity, cross-event acceptance rejection, exact proposal hashes, existing proposal decisions, financial/provider safeguards and partner/admin preservation checks.
- Connected Chromium: **25 checks passed**, using the actual Express app and disposable MongoDB replica set. One cancellation failure is injected at the browser boundary to verify visible recovery. Checks include explicit acceptance, denied acceptance without mutation, exact/current proposal versions, payment recovery, zero paid amounts, expired holds, refresh without payment initiation, event switching and 320/768/1440px offer/proposal reflow plus 390px payments. Zero page runtime errors. Desktop/mobile screenshots reviewed.
- Customer and Partner production builds passed. Existing Vite bundle-size warnings remain.
- Preservation comparison: 692 original baseline files inspected; only 23 approved existing Phase 1/2 files changed, with no missing or unrelated changed baseline files. Added files are separate. Pre-existing dirty work remains intact; nothing was committed.

Evidence: `C:/Users/Hp/.codex/visualizations/2026/11/05/01a1aa05-b9ee-72e0-91b8-268175f49f33/phase2b-dev/`, including tests, browser script/results/screenshots, build logs, pre-development diff and preservation report. All business fixtures were disposable and local. Browser checks deliberately exercise denied acceptance; they do not prove a successful live charge or booking.

## Remaining acceptance and next phase

Rehearse eligible-supplier acceptance, reservation renewal/replay, provider sandbox debits, delayed webhooks and debit-without-booking reconciliation in staging with approved commercial policy fixtures. Confirm physical/native devices, screen-reader behaviour, customer/partner/admin journeys and operational reconciliation ownership before release. Existing native screens were not redesigned; the optional API parameter is backward compatible. No production DB, provider, deployment, domain/cookie change or live message delivery was used.

Phase 3 is Messages, Documents and Saved Collections. Account/Gallery/post-event and growth gates remain later work. Vendor Partnership Agreement & Compliance Engine remains an independent dependency. Ticketing is excluded; Experience QR feedback remains preserved. This record does not mark the complete Customer OS programme finished.
