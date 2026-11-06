# Customer experience — Phase 2A shared planning

Date: 5 November 2026 (Asia/Calcutta). Status: implemented and verified locally following the instruction to continue development. This delivers the web planning section; staging acceptance and the remaining Customer OS programme are still open.

## Customer behaviour

- Manual planning has six progressive steps: event details, location, budget, services, notes and review. A date and city can remain unknown while saving; existing Core confirmation still requires both.
- Drafts autosave to the customer's account after an occasion is chosen. Reload, Home, event workspace and Aura's Edit plan action resume the same event ID. Switching between manual planning and Aura flushes the manual save first.
- Save & continue later leaves a resumable draft. The form warns before page unload or shell navigation with unsaved changes. Conflicts retain local edits and require an explicit discard/reload; failed saves remain visible and retryable.
- Venue name is a location detail. Arranged-by-customer status requires an explicit declaration. Aura extraction now checks arrangement evidence rather than treating a venue name as a booking. Legacy manual event creation and event patches follow the same corrected rule. Historical requirements and committed services are not backfilled or rewritten.
- Unchanged Aura service suggestions retain their inferred source when editing details. Explicit service confirmation is separate. An unchanged Aura-assumed date/year is labelled and is not silently confirmed by unrelated autosaves. Final plan confirmation keeps Core's existing acceptance behaviour and explains it on review.
- Unknown budgets remain null; existing ranges, location coordinates, service preferences and notes survive resume. Locked requirements cannot be changed through this editor.
- Mobile controls retain 44px minimum targets and 16px input text. Actions follow content without covering the form or review.

## Core contract

All routes use the existing customer authentication and event ownership checks:

| Route | Input | Result |
| --- | --- | --- |
| `POST /api/customer/event-drafts` | `eventType`, `idempotencyKey` | Existing Core draft, requirements, understanding, progress and version |
| `GET /api/customer/events/:id/planning-draft` | Owned event ID | Coherent planning snapshot |
| `PUT /api/customer/events/:id/planning-draft` | `facts`, service changes, `expectedVersion`, `idempotencyKey` | Atomically saved snapshot |

Request keys are 8–120 letters, digits, underscores or hyphens. Versions are server-generated SHA-256 values over serialized event facts and requirements, including timestamps. Saves accept only draft-edit fields; service changes accept category, editable status, provided value, details, location, special requirements and optional boolean `confirmSuggestion`. Untouched services are omitted. Quotation, lead, booking and payment transitions cannot be submitted through this API.

Facts, service updates and the save receipt commit in one transaction. Concurrent edits return `409 DRAFT_CHANGED`; non-drafts return `DRAFT_LOCKED`, committed services `REQUIREMENT_LOCKED`, and key reuse with another payload `IDEMPOTENCY_CONFLICT`. A lost acknowledgement can replay the same request without another history receipt. If another editor changed the event after that save, replay returns a conflict instead of pairing stale form values with a newer version.

The implementation reuses CustomerEvent, EventRequirement, AuraContext and EventHistory. No new schema or database migration is required. **MongoDB must support transactions (a replica set, including Atlas, or a supported sharded deployment).** New snapshot/save endpoints have no non-atomic standalone fallback; confirm this prerequisite before staging rollout.

## Verification

- Planning API/service suite: **13 passed, 0 failed**, including ownership/authentication, invalid fields, concurrent saves, rollback, lost responses, later edits after a lost response, inferred sources, venue semantics and Core confirmation requirements.
- Broader server regression run: **95 passed, 0 failed** (planning, customer foundation, proposals and unified product). This run preceded the final replay-version regression; the final 13-test planning suite was rerun after that change. Counts overlap and must not be added.
- Web suite: **61 passed, 0 failed**.
- Connected Chromium: **18 checks passed**, using the actual Express application and disposable MongoDB replica set. Covers autosave, reload, unsaved navigation, retry, conflicts, both mode switches, explicit venue arrangement, review, mobile overflow/action placement and final confirmation. One event throughout, zero page runtime errors. Desktop and mobile screenshots reviewed.
- Customer and Partner production builds passed; existing Vite bundle-size warnings remain.
- Preservation check compared 692 baseline files: only the 19 approved existing Phase 1/2 files changed; no unrelated baseline files changed or disappeared. New implementation/test/document files are additional. Existing dirty work was retained.

Evidence: `C:/Users/Hp/.codex/visualizations/2026/11/05/01a1aa05-b9ee-72e0-91b8-268175f49f33/phase2-dev/`, including test/build logs, connected browser script/results/screenshots, pre-development diff and preservation report. Tests used no production database or external model/payment provider.

## Remaining release work and rollback

Verify replica-set configuration, customer sessions and end-to-end journeys in staging before rollout. Native screens were not converted to this wizard; existing native endpoints remain available, and the previously recorded Expo dependency/typecheck limitation remains. Provider, production, screen-reader and native-device acceptance are unverified. No deployment, domain/cookie migration, production seed, commit or release was performed.

Rollback should disable the new web entry points/routes while retaining saved Core events and history receipts. Saved drafts remain existing Core records. Do not delete customer drafts or silently restore venue-name inference as a rollback side effect; review that semantic change separately.

Next work remains the approved transaction/readiness journeys and later Vault, Collections, Gallery/membership and post-event media phases. The Vendor Partnership Agreement & Compliance Engine remains an independent dependency. No new legal, fee, tax, payment, reward or settlement policy was introduced. Ticketing stays excluded; existing Experience QR feedback and non-ticket execution remain intact.
