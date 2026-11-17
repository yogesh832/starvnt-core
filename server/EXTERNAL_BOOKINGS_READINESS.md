# External bookings and vendor readiness

Implemented and locally verified on 2026-11-03. This extends the foundation controls in `FOUNDATION_CONTROLS.md`.

## Vendor workflows

- `/vendor/external-bookings`: source and lifecycle filters, intake, service quantities, resource units, event/customer details, setup/teardown/travel buffers, contract value, payment deadline, rescheduling, lifecycle history, reported receipts/refunds and private invoice/receipt uploads.
- `/vendor/readiness`: separate account, profile, verification, activation, operating, matching and marketing decisions; service-specific missing configuration; brand versus verified legal name; marketing consent and operating-base address privacy.
- Unified calendar links external work to its detail view and keeps operational blocks separate. Core confirmed bookings remain authoritative platform commitments.

## Booking authority and API

Owner-authenticated routes are mounted at `/api/vendor/external-bookings`. Collection GET supports cursor pagination and lifecycle/source filters. POST creates; `/:id` GET reads and PATCH edits; `/:id/lifecycle`, `/:id/receipts`, `/:id/refunds` POST record controlled actions. `financial-summary` returns separately labelled external totals. `legacy` retains older VendorBookingSlot records for the calendar.

External records extend VendorBlockout rather than creating a competing booking ledger. Acquisition source is immutable. Commercial edits, reschedules and lifecycle actions use revision checks; create and mutation requests use idempotency keys. Server-owned actors, histories, receipts, refunds and attachment metadata cannot be replaced by client payloads. Reusing a key with different data conflicts.

Lifecycle supports enquiry, negotiation, quote sent, on hold, confirmed, in progress, completed and cancelled. Rescheduling is an audited action, preserving lifecycle. Only confirmed, in-progress and unexpired holds reserve capacity; legacy records without explicit lifecycle reserve conservatively. Hold expiry releases the reservation through the existing audited expiry worker. Confirmation and schedule changes check existing Core/customer commitments, required service resources, quantities and buffers under the vendor schedule lock. Closing work remains possible after historical equipment becomes unavailable.

Money is vendor-reported, in INR with at most two decimals. Receipts cannot exceed the remaining contract amount; refunds cannot exceed net reported receipts. Cancelled work cannot receive a new receipt. Contracted totals exclude pipeline stages, and external money never becomes verified STARVNT revenue or platform settlement truth.

Private documents use `/:id/attachments` POST and `/:id/attachments/:attachmentId/download` GET. Uploads require configured Cloudinary credentials, accept signature-checked PDF/JPEG/PNG/WebP up to 10 MB, and allow at most 20 documents per booking. New assets use authenticated delivery; owner-authorized downloads receive a five-minute signed URL. Public IDs are excluded from response DTOs. Existing legacy public attachment URLs have not been migrated at the provider.

## Readiness decisions

Eligibility is recomputed from persisted facts, rather than trusting an old commercial-active cache. The owner must be an active vendor account. Verification and authorized activation approval remain separate gates. A ready service needs its own active pricing, capacity, coverage and available owned resource dependencies, plus an active operating base with a valid map point and working availability. Configuration from unrelated services cannot satisfy that service's readiness. Exact-service gates apply to catalogue exposure, matching, quotes and checkout.

An old base containing the placeholder map point `0,0`, an inactive base, or explicitly closed hours does not pass readiness. No coordinates are guessed or silently backfilled. Such vendors need to save their actual operating configuration before matching becomes eligible.

Operating bases default to city-only public disclosure. Address, private label and coordinates stay private unless the vendor explicitly chooses exact public visibility. Deletion archives a base and records history. Location writes validate data before changing primary flags; these writes use the schedule lock, but are not a multi-document database transaction.

`PUT /api/vendor/growth-preferences` records reversible, audited marketing opt-in. Marketing eligibility also requires activation, verification, profile completion and published public portfolio. Private portfolio media is excluded from public catalogue responses.

`POST /api/vendor/google-business/sync` refreshes the linked Google place through the configured server key. Provider rating, review count and name are stored as a separate timestamped snapshot. This is not ownership verification, does not overwrite brand/legal identity and does not alter STARVNT ratings. Readiness reads the saved profile without initiating another Google fetch. Travel cost responses label coordinate/table/fallback estimates and require vendor confirmation; they do not expose private base labels.

## Verification and rollout limits

- Final full backend regression: 126/126 passed, including 19 external/readiness integration tests.
- Web regression: 29/29 passed; production build passed (existing large-bundle advisory).
- Mocked Edge browser flows: external intake, lifecycle, receipt, refund, readiness states, marketing preference, address privacy and desktop/mobile overflow checks passed without runtime errors.
- Integration tests use isolated in-memory MongoDB and mocked Google/Cloudinary responses. Live provider delivery, credentials and production deployment have not been verified or changed.
- No live database migration, automatic activation, legacy media migration or production deployment was performed. Existing foundation rollout guidance still applies. Native mobile dependencies have pre-existing verification failures; no native mobile changes were made in this phase.
