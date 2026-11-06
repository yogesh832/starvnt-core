# Private Gallery — integration review and implementation gates

Date: 5 November 2026. This is a proposed integration contract, not an implemented Gallery or storage approval. It follows B07/D14/D15 in the approved customer audit. Account and retained event records can ship independently after their own release checks.

## Existing capabilities inspected

| Source | Implemented behaviour | Reuse boundary |
| --- | --- | --- |
| `server/src/external/routes/portfolio.routes.js`, `/media/upload` | Authenticated chat uploads use the configured Cloudinary provider and return a `secure_url`, thumbnail, public ID and resource type | Provider plumbing is reusable. An HTTPS URL is not proof of event-private access. The route lacks album assignment, publication approval, Gallery grants and revocation semantics |
| Vendor portfolio routes/models | Portfolio media supports service discovery and intended public presentation | Public portfolios must not become private event deliveries by matching a vendor, name or contact |
| `server/src/experience/routes.js` and `models.js` | Feedback uploads require feedback proof and photo permission; authenticated provider storage and review records are separate from general chat | Preserve Experience QR feedback. Feedback permission does not authorise publication into an event album; claims/identity must not be inferred from matching contact data |
| `server/src/proposals/models.js`, `routes.js` | Proposal visuals carry rights/source metadata; private bytes are authorised through proposal roles and frozen PDF checks | Reuse the authorisation/integrity pattern. Proposal assets are not automatically event memories or vendor deliveries |
| Customer Documents | Owned external contract links and generated/frozen record downloads | A saved external link does not create private media hosting, uploader identity or STARVNT revocation controls |
| Foundation privacy/identity and Core bookings | Verified identities, consent decisions, retention review and owned event/booking relationships exist | Reuse identity and ownership. A booking is evidence for reviewing an assignment, not unconditional permission to publish media |

No general customer album, active media-delivery assignment, per-asset visibility grant or Gallery publication/revocation contract was found. Existing service-completion evidence is commercial evidence and must retain its original permissions and retention rules.

## Proposed records and authority

Keep three explicit sources: CUSTOMER_UPLOAD, ASSIGNED_VENDOR_DELIVERY and AUTHORISED_STARVNT_MEDIA. Each asset needs immutable source/uploader identity, an owned event, provider reference, content hash, media type, validation/processing state, rights reference, publication decision and audit/revision fields. Reuse provider access helpers rather than storing public URLs as private capabilities.

An initial owner-only Gallery is the recommended first release. Family/collaborator access must wait for the separate Event Circle membership role/grant/revocation contract. Do not infer membership from customer name, phone, household, past booking or vendor contact lists.

Vendor uploads require an explicit active assignment for the event and allowed delivery scope, checked again on finalisation/publication. STARVNT uploads require the corresponding staff permission and recorded rights. Customer uploads require event ownership. Withdrawal/revocation must stop new publication and read access without silently deleting retained commercial evidence.

## Proposed API workflow (not available today)

1. Initiate an owned/assigned event upload with an idempotency key and declared type/size. Enforce the approved quota before issuing a provider capability.
2. Complete the upload with the original request key and provider reference. Validate actual bytes, type, size, hash, image safety and privacy metadata. Keep processing/quarantine assets private and inaccessible as published assets.
3. Review publication with a revision and recorded rights/approval reference. The exact publisher/approver matrix remains a product/security decision. Upload completion must not publish or notify by itself.
4. Read album metadata through event/source grants. Deliver bytes through an authenticated proxy or another revocable mechanism that rechecks the current grant. Signed URLs alone do not promise immediate revocation after issuance; cache/expiry behaviour must be explicitly accepted before choosing them.
5. Revoke/archive/remove under the approved permission and retention rules. Finalisation, publication and notification need independent replay keys so retrying cannot duplicate assets or send another notification.

Customer agreement acceptance, privacy consent, media rights and payment authorisation remain distinct. A media publication approval cannot imply any of the other decisions.

## Decisions needed before implementation/release

- Provider/account configuration and private delivery capability; byte validation/quarantine and processing ownership.
- Allowed formats, per-file/event/account quotas, rate limits, upload expiry and abandoned-upload cleanup.
- Rights evidence, source attribution and the customer/vendor/staff publication authority matrix.
- Original/derivative retention, export/deletion/revocation timing, backups and commercial/legal holds.
- Native offline caching, signed URL expiry or proxy revocation behaviour, and access logging.
- Support ownership for revoked assignments, disputed rights, failed processing and missing deliveries.

These are contract inputs, not proposed live benefits or inferred consent. No arbitrary quota, retention period or entitlement has been activated.

## Acceptance and rollback

Use isolated fixtures for two unrelated customers, an assigned and an unassigned vendor, and limited staff. Verify cross-event/source denial; revoked assignment after initiation; mismatched bytes/MIME/hash; processing failure; duplicate finalisation/publication/notification; rights withdrawal; customer deletion/retention hold; direct provider URL access; expired capabilities; browser/native cache and revocation. Confirm that matching names/contacts never expands access and that existing feedback, proposal visuals and execution evidence remain isolated.

Rollback disables initiation/publication/delivery, retains originals privately according to the approved retention decision, and does not convert existing assets to public URLs. No Gallery records, uploads, migrations or provider requests were created by the current Account development work.
