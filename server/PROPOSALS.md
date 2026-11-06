# Proposal Studio — local implementation, 4 November 2026

## Entry points

- Customer build: `npm run dev -w web`; customer tab `/customer/proposals`.
- Vendor build: `npm run dev:vendor -w web`; vendor tab `/vendor/proposals`.
- Core workspace: `/admin/proposals`, available to staff with `proposals.read`.
- Build outputs: `npm run build -w web` → `web/dist`; `npm run build:vendor -w web` → `web/dist-vendor`.
- The main AWS web Dockerfile builds the vendor surface. The separate customer Dockerfile keeps the customer build. This change does not deploy either surface.

## Authority and lifecycle

1. Staff creates a version from a real active saved customer event. The manifest contains the saved event title/type/date/city/guest count/venue/notes and confirmed requirements, never inferred Aura memory or a sample client's details. Every confirmed requirement needs a linked scope line or a reasoned explicit exclusion; including and excluding the same requirement is rejected. Brief changes require another draft save/version.
2. `proposals.manage` edits draft scope, internal procurement costs, customer prices, tax/charges, payment milestones, terms, exclusions and event-specific sections. Every save resets applicable vendor agreements. Serialized writes, revisions and request keys protect against lost updates and duplicate mutations.
3. A vendor owner sees only their assigned scopes, procurement unit costs and nonidentifying event logistics. They approve/decline the exact current scope with a validity date and reason. No other supplier's prices, customer selling prices, contact details or staff history are returned.
4. `proposals.approve` freezes reconciled scope and commercial terms only after all applicable vendor approvals are valid. Supplier service, commercial activation and the approving owner's active identity are checked again at freeze, PDF generation, quality approval, send and customer approval. Internal fulfilment requires commercial approval but no external supplier signature. Event changes require another draft save. Approval stores an immutable version snapshot/hash.
5. `proposals.manage` renders the frozen snapshot to a private, server-stored PDF. Customer amounts and payment totals reconcile in integer paise. Internal costs and approval history are omitted. The PDF's content hash is recorded; generation cannot overwrite an approved/sent version.
6. `proposals.approve` reviews the exact PDF/hash and records quality approval. `proposals.send` publishes it to the owner's customer tab; no email, WhatsApp or SMS is sent. Event changes or expired agreements prevent sending.
7. Customer downloads require ownership and SENT state. Approve/decline/change requests apply to the exact snapshot and PDF hash. Older sent versions cannot receive a new response after a newer version is sent. A response is immutable; staff can create a revised version. Approval never creates/confirms a booking, changes event status or takes payment.

Separate admin permissions are in the existing permission catalog. Existing staff roles are not automatically granted new permissions. API checks remain authoritative even if someone visits a tab directly.

## Version discussions

The existing customer/vendor proposal tabs now contain a discussion panel with replies, refresh and cursor pagination (50 messages per page). Staff uses `proposals.discuss` to select customer discussion, a specific assigned vendor discussion, or internal notes. Customer discussion becomes available only after the version is SENT. Vendors can discuss their assigned version before publication; only that vendor and authorized staff can read it. Customer and vendor API requests cannot choose another audience, access internal notes, reply across audiences/versions or impersonate a staff author. Public message DTOs omit staff/account identifiers and idempotency keys.

Messages are append-only and scoped to the exact proposal version. A question can be answered without consuming the customer's immutable approve/decline/change response. Discussion does not modify the approved scope, PDF, booking or payment. Mutations use actor-scoped request keys; browser retries reuse the same key for the same unsent message. The server caps message length, rate and total messages per version. There is no automatic email/WhatsApp/SMS/push delivery in this flow.

## Operations handover

`proposals.handover` allows authorized staff to prepare and release an internal coordination packet. The assignee must be active and hold `proposals.read`, `proposals.handover` and an existing execution/operations permission (or be SUPER_ADMIN). This does not create vendor team roles or grant staff new access automatically.

The packet records the approved snapshot/PDF hashes, named operations owner, internal notes, checklist tasks, booking bindings and revisioned audit history. Its states are PREPARED → RELEASED → ACCEPTED → COMPLETED. The assignee discovers their work through the paginated **My operations handovers** list, can open an older proposal outside the recent-proposals list, and personally accepts ownership. Only that active assignee can update OPEN/DONE/BLOCKED task status or complete the checklist. Every mutation requires a reason, current revision and request key.

Preparation requires the latest sent, customer-approved exact version, an intact final PDF and unchanged saved event/confirmed brief. Release requires one distinct authoritative Core booking per scope, belonging to the same customer/event/date, CONFIRMED and PAYMENT_VERIFIED. Vendor scopes match vendor and saved service IDs; internal scopes require the exact approved service name. Core total must equal approved scope amount plus its explicitly allocated tax/additional charges; allocations must sum to the proposal's complete charges amount. Paise reconciliation is mandatory. PAYMENT_VERIFIED is the Core contract status; the handover does not assert that every future payment milestone is already paid.

Acceptance, task changes and checklist completion recheck the authoritative booking bindings and current version/brief. A cancelled/unverified/mismatched booking, disabled assignee or superseding sent proposal stops progression. Proposal send, customer response and handover decisions share event/version locks to prevent simultaneous decisions across versions. Completing this coordination checklist never writes Core booking, payment, execution-completion or settlement status.

Current binding contract is one Core booking per proposal scope; grouped/split-booking allocations require a separate explicit design. Live staff/customer/vendor acceptance, operational escalation and notification delivery remain release work. New collections/indexes must be provisioned and verified during staging rollout before traffic.

## References and PDF content

Staff may attach up to 12 explicitly authorized private JPEG/PNG/WebP references, 5 MB each. The server decodes/re-encodes image bytes, caps decoded pixels, removes metadata and stores their content hashes. Source/attribution and rights confirmation are mandatory. Source choices are vendor portfolio, customer reference, licensed work and AI concept. A frozen version keeps its own visual manifest; revised versions can reuse the stored authorized references. Removed assets remain retained for version evidence; there is no public asset URL.

AI concepts carry a visible concept disclaimer. Upload is not automatic AI image generation, license verification or biometric review. Staff must inspect permissions and customer identity before quality approval. The PDF has dynamic scope/section pages; it does not copy the sample's fixed 12-page length. Draft previews are marked preliminary on every page. English, Hindi and Bengali font coverage is bundled; other scripts need additional fonts/QA.

## Acceptance evidence

`server/test/proposals.test.js` covers real Mongo-backed routing, admin permissions, vendor ownership, customer isolation, approval gates, request replay, stale writes, changed event truth, expired supplier agreements, price/payment reconciliation, private reference authorization, frozen visual protection, exact PDF hashes and customer approval without booking changes. Discussion checks cover audience isolation, replies, request replay, cursor pages and unchanged approved hashes. Handover checks cover approval and assignee gates, authoritative booking/customer/amount/tax reconciliation, cancellation and disabled accounts, stale revisions/versions, assignment discovery and preservation of Core booking truth.

Mobile-width browser checks cover staff editing, vendor agreement, commercial freeze, PDF quality approval, send, customer response, separate vendor/customer/internal discussions, threaded replies, assigned handover discovery and checklist completion using mocked transport. PDF render inspection uses a synthetic acceptance event and visual, not a real customer proposal. Full provider/device, Docker and production checks are separate release evidence.

## Remaining handbook scope

This delivers the core proposal approval/PDF workflow, confirmed requirement-to-scope/exclusion traceability, version discussions and gated operations handover. It is not completion of every handbook clause. Still required: richer designer-to-manifest integration, agreement documents/e-signatures where required, configurable template catalogue, production retention/backups and full role/device/provider acceptance. Native proposal screens are not added by this web-tab change. Multi-user vendor-team RBAC and subscription billing remain separate unfinished modules. See `docs/remaining-requirements-2026-11-04.md` for dependencies across the supplied requirements.
