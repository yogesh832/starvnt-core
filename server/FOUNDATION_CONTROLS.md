# Data, identity, permissions and booking truth

Implemented against the foundation scope in handbook pages 7–10, especially sections 1.3 and 2.2. This is an additive extension of the existing two-database architecture. It does not introduce a second booking, external CRM, authentication or revenue system.

## Record ownership and canonical identifiers

| Record | Authority / ID | Relationship |
| --- | --- | --- |
| Customer account | ExternalUser._id | Provider-verified contact evidence is separate from self-reported profile fields. |
| Vendor business | VendorOrganization._id | Owner key is unique for new registrations; legacy duplicate owners block migration. Staff access is denied until an explicit membership model exists. |
| Event | CustomerEvent._id | Owned by its customer; category or most-recent event is never an identity link. |
| Platform contract | CoreBooking._id | Authoritative commercial, execution and settlement state. |
| Customer booking view | CustomerBooking._id | Explicit coreBooking, reservation, vendor and payment links. Core has unique customerBookingId and reservationId indexes. |
| External booking | Existing VendorBlockout._id with EXTERNAL_COMMITMENT | Vendor-private source; reported lifecycle and receipts; never Core revenue. Existing VendorBookingSlot records stay readable. |
| Service / review | Existing VendorService._id / VendorReview._id | Existing ownership remains in force. QR/review verification is a separate handbook phase. |
| Consent | CustomerConsent._id plus customer/scope/purpose/channel | One current decision with revision and an embedded server-attributed decision ledger. |
| Identity link | IdentityLink._id | Both accounts prove ownership (current sessions or mobile OTP) and have verified mobiles, both consent, then an authorized admin reviews. No document or ownership merge occurs. |
| Privacy request | PrivacyRequest._id | Customer-owned request, audited hold/processing/retention decisions. |

Future interests, QR experiences and proposals must reference these IDs. Their product features are not implemented by creating empty parallel entities here.

New account acquisition attribution is set by the authentication handler, not a client actor/source field. Unknown historical acquisition remains unknown. External acquisition channels are DIRECT, WHATSAPP, INSTAGRAM, FACEBOOK, WEBSITE, REFERRAL, REPEAT, OTHER and LEGACY_UNKNOWN. Source changes cannot convert an external record into a platform booking. Referral reward/conversion attribution belongs to the later growth phase.

## Booking and money invariants

- Cancellation preserves the contract, receipts, actor, reason and history. Refund state is REVIEW_REQUIRED; cancellation does not manufacture a refund or change verified receipts. In-progress/verified-complete/settled contracts require review.
- Core cancellation uses conditional state writes and stores a pending projection flag. A failed customer-view update can be recovered without undoing the canonical cancellation.
- A real customer confirmation persists its Core snapshot/sync intent with the booking view. Until Core succeeds it remains pending; its capacity remains reserved even if the original hold expires. Core sync failure is propagated, not swallowed.
- Real catalogue bookings also create Core contracts. Reconciliation updates receipt totals and explicit links without resetting approved pricing, execution, settlement or refunds. An ambiguous legacy Core link stops for review.
- Payment retries recompute verified receipts rather than incrementing an accumulated amount. Linked Core/customer views are counted once by availability, booking display and customer financial truth.
- Webhook events move through PENDING / PROCESSING / COMPLETED / FAILED with a bounded processing lease. Failures retry, active deliveries return a retryable error, completed deliveries deduplicate, and event-ID content changes conflict. Historical webhook rows without processing state are treated as already consumed.
- Critical audit failures propagate. New consent, link, external lifecycle and cancellation workflows embed audit evidence with their state write. Existing legacy cross-database operations still require retry/reconciliation; they are not claimed to be distributed transactions.
- The booking reconciliation worker runs every 30 seconds with worker-health reporting; manual recovery is also available in Core.

External lifecycle: ENQUIRY → ON_HOLD / CONFIRMED → IN_PROGRESS → COMPLETED, with controlled cancellation. Schedule edits preserve identity and have revision/history checks. Only confirmed/in-progress records and unexpired holds consume capacity; expired holds cease blocking immediately. External receipts are vendor-reported, keyed, audited and never provider-verified platform payments. External amounts have a separate financial-summary API.

## Customer identity and optional use

Names are SELF_REPORTED. A verified mobile/email means a provider challenge was verified for that exact contact; it is not a KYC claim. No customer Aadhaar/PAN collection was added.

Phone, Google subject and vendor-owner keys enforce uniqueness for new writes without trying to build unique indexes over unreviewed historical duplicates. Phone sign-in fails closed for ambiguous old records. Verified claims use HMAC digests and one owner per identity. Optional IDENTITY_DIGEST_SECRET can provide a stable dedicated key; otherwise JWT_EXTERNAL_SECRET is used. Rotating the digest key requires a separately planned proof/key migration; do not silently change it.

Contact changes require customer OTP verification. Admin profile editing cannot silently change login contacts. Account links are reviewable/revocable and do not authorize cross-account or cross-vendor reads.

Consent is separate from terms, profile completion and notification toggles. Optional use defaults off. The notice is versioned and server-owned. Marketing needs a decision for each channel; personalization and ecosystem linking have their own decisions. A notification preference can additionally stop delivery. Existing transactional service messages remain available. Push rechecks optional-use consent at delivery, so queued marketing is stopped after withdrawal. EMAIL/SMS/WHATSAPP preferences do not add a new marketing delivery provider.

## Permissions

| Actor | Authority |
| --- | --- |
| Customer | Own profile, OTP contact proof, own consent/history, own 360 view, own deletion/link request. A body customer ID never selects the owner. |
| Vendor owner | Own vendor-private commitments, resources, lifecycle and external receipts. Cannot assert platform payment truth or consent on a customer's behalf. |
| Vendor staff / other tenant | Denied until explicit delegated membership exists. |
| Admin with customers.read | Customer directory with contact fields removed. |
| Admin with customerContacts.read | Customer directory contact access. Sensitive reads are audited. |
| Admin with privacy.read / privacy.manage | Read requests / process or hold deletion and record retention decisions. |
| Admin with identity.read / identity.link | Read account-link review queue / decide or revoke links. |
| Admin with bookings.reconcile | Trigger pending booking reconciliation. |
| Internal ops | Production requires an authenticated admin and the action's permission. Client operator labels cannot supply actor identity. Shared-key compatibility is development-only and records a fixed service identity. |
| Super admin | Existing explicit allow-all role; decisions still carry identity and history. |

Both identity middleware layers check that the session belongs to the JWT subject. Existing audit, finance and vendor permissions remain server-enforced. New privacy/link powers are not silently added to existing admin presets; assign them explicitly in Users & Access.

## Retention and deletion

1. Customer requests deletion. The durable PrivacyRequest immediately blocks optional uses, including if updating its profile mirror fails.
2. Authorized privacy admin checks active obligations, records retention reason and a future review date, and may place/release a documented hold.
3. Processing disables the account, revokes sessions, cancels reminders, removes push bindings/jobs, removes AI sessions/messages/context, favorites and customer notifications, withdraws consents, revokes links and anonymizes login/profile fields.
4. Contracts, financial snapshots, business history, provider media, backups and identity tombstones remain explicitly retained categories. This endpoint is account anonymization with retained records, not a claim of complete physical erasure of all copies. Provider-storage/backup erasure requires the applicable storage inventory and retention policy.
5. Core exposes due retention reviews separately. An admin records the next decision/reason/date. Review dates are not database TTLs that delete financial contracts.

No universal retention duration or automatic commercial-record deletion was invented. The deployment owner must select applicable retention periods and provider/backup handling. Tests exercise the implemented request, denial, hold, anonymization and opt-out behavior.

## APIs and screens

Customer UI: `/customer/settings` (privacy notice, purpose/channel decisions, OTP mobile changes and deletion request) and `/customer/me` (profile link). Customer builds set `VITE_PORTAL_SURFACE=CUSTOMER`; the existing default remains VENDOR so this change does not switch the vendor sign-in surface.

Core UI: `/admin/foundation` (permission-aware deletion/retention reviews, account-link reviews and booking recovery).

Customer APIs:

- GET `/api/customer/privacy/notice`, GET/PUT `/api/customer/privacy/consents`.
- GET/POST `/api/customer/privacy/deletion`.
- POST `/api/customer/identity/mobile/verify` after the existing mobile OTP request.
- GET `/api/customer/customer-360` (own records only, 200-row cap per collection, no private vendor contact import).
- GET/POST `/api/customer/identity/link-requests`, POST `/api/customer/identity/link-requests/:id/revoke`.

Core APIs under `/api/admin/foundation`:

- GET `/privacy/requests`, POST `/privacy/requests/:id/process`, POST `/privacy/requests/:id/hold`.
- GET `/privacy/retention-due`, POST `/privacy/requests/:id/retention-review`.
- GET `/identity/link-requests`, POST `/identity/link-requests/:id/decision`.
- GET `/customers/export?reason=...&after=...` (audited, 100-row cursor pages; requires customer read, contact read and contact export permissions).
- POST `/bookings/reconcile`.

External APIs under `/api/vendor`:

- Existing POST/PATCH `/availability/blockouts` accepts external commitments; creation can include `externalBooking` with acquisitionChannel, lifecycle, totalAmount and holdExpiresAt.
- POST `/external-bookings/:id/lifecycle`, POST `/external-bookings/:id/receipts`.
- GET `/external-bookings/financial-summary` (separate VENDOR_REPORTED amounts).

Consent writes require current noticeVersion, expected revision and idempotencyKey. Link requests require the other account's mobile OTP or current access token as proof; neither OTP nor token is persisted in the link. Development provider proof cannot authorize ecosystem linking. History actors and timestamps are generated on the server. Lifecycle/receipt writes require request keys; state edits require revision where applicable.

## Migration and rollout

The repository changes and tests do not modify production databases.

1. Back up both databases using the existing backup procedure and stop old-version identity/booking writers for migration.
2. Run `node server/scripts/foundation-migration.js` against the intended configured database. Default is read-only, including disabled collection/index auto-creation. Output contains record IDs/counts and fingerprints, not raw contacts.
3. Resolve duplicate phone/Google/vendor owners and ambiguous/missing platform booking links. No name/category merge or automatic reconstruction of an unverified booking is permitted. The migration returns REVIEW_REQUIRED and refuses apply while these remain. Apply attaches legacy projections to their exact Core contract and saves a recovery snapshot; it does not invent new contract truth.
4. Run `node server/scripts/foundation-migration.js --apply` only against the intended backed-up database. It creates partial unique key indexes and performs additive backfill. It never creates historical verification or consent evidence.
5. Run preflight again, inspect explicit links, then deploy the server and relevant frontend build. Assign new permissions deliberately. Production internal clients must use authenticated admin workflows rather than the old shared key.
6. Monitor booking-reconciliation worker health, pending Core snapshots and due privacy reviews. Retry unresolved records through Core; a schedule conflict or ambiguous contract remains under review.

Rollback: stop writers, restore the previous application build, and retain additive columns/collections and preserved cancellation history. Do not drop audit or commercial records. A database restore requires the approved backup/reconciliation procedure because new verified receipts may have arrived since the backup. No destructive down-migration is included.

## Acceptance evidence

Local verification on 2026-11-02:

- Backend: 107/107 tests passed, including 28 foundation integration tests.
- Web: 29/29 tests passed; production build passed. Vite retains its large-bundle advisory.
- Browser: customer desktop/mobile settings, consent grant/withdrawal, deletion request and Core review screen passed with mocked HTTP responses. No browser runtime errors or horizontal overflow at 390px. Actual database behaviors are covered by the separate integration tests, not claimed from these screenshots.
- Native mobile: typecheck could not resolve Expo/base types; unit tests reached 103/105 with two Expo-dependent failures. Local Node 22.12.0 is also below the mobile workspace's supported engine range. No native mobile source files were changed; native release verification remains blocked by that environment.
- Whitespace/diff checks passed. No live database migration, deployment or provider-message test was performed.

The foundation regression suite uses disposable MongoDB databases and covers injected Core/audit outages, retry recovery, canonical links and financial deduplication, cancellation retention, receipt replay, webhook re-delivery/content conflicts, concurrent consent decisions, channel opt-out, identity duplicates, session ownership, permission denials, internal actor spoofing, active-booking deletion denial, privacy holds/anonymization, external revenue isolation, expired holds, account-link review/revocation and read-only/repeatable migration behavior.

Production migration, provider OTP delivery, provider-storage/backup erasure, and production deployment remain NOT VERIFIED by local tests. QR feedback, rewards/campaign execution, vendor staff membership and a full external CRM interface remain separate product phases.
