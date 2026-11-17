# Later release and rollback

Prepared 12 November 2026. No push, deployment, production database migration or live money movement was performed for this implementation.

## Branch and artifact mapping

Work is in `D:/starvnt-core`, `vendor-dev`. Vendor production is `main`, served at the Vendor domain (`vendor.starvnt.com`); `partner.starvnt` is not the production target. Customer development/production remain `customer-dev`/`customer` in the existing Customer worktree. Preserve their respective authentication, entry points and navigation. Do not merge whole worktrees across product lines. The current AWS workflow is triggered by `main` and a manual dispatch; it is production infrastructure. The branch-role table in `docs/branch-workflow.md` does not prove staging exists. Do not dispatch that workflow for a development push.

Vendor web uses the Vite build from `web/`. Mobile uses the existing Expo project and product profile; do not replace preexisting mobile/signing/config changes. Both deployment artifacts must point to the same approved backend contract for their environment. Customer work was coordinated through its existing chat and selective shared-file transfer, not a cross-product merge. All original uncommitted changes remain in place.

## Before any approved staging release

1. Review the task file manifest and current diff, separating preexisting local work. Save a reproducible commit/artifact only when authorized. Run the backend tests, web build/tests, mobile type checks/tests and the local browser verifier from the matrix.
2. Provision or positively identify separate staging backend, web origin, databases, private storage, provider test account and webhook subscription. Confirm database names and origins without exposing secrets. Keep provider execution off.
3. Back up both identity databases. Run the read-only audit against the selected environment. Inventory legacy quotes without confirmed snapshots, bookings without approved completion terms, public evidence and unresolved cases/finance. Business owners must approve migration choices; do not backfill delivery/payment facts or category requirements automatically.
4. Review/create indexes without dropping existing indexes: unique Opportunity.crmSourceKey (partial string), staff FollowUp requirement/requestKey (partial STAFF), VendorActivity.requestKey (partial string), existing IdempotencyKey.key and existing event/media/member request indexes. New arrays/fields are additive. Do not use an indiscriminate `syncIndexes()` against production.
5. Apply the same shared Core model/services/policy/provider contracts to both product backends before enabling new clients. Customer keeps its own routes/screens and guarded commerce/ops wrappers. Do not restore Proposal Studio or ticketing artifacts.
6. Configure actual approved category policy revisions through maker/checker. Validate private Cloudinary authenticated storage, byte proxy authorization, raw-body webhook HMAC and worker/outbox monitoring. PAN/GST provider credentials must return real explicit verification; missing/unrecognized status stays unverified. Google Places links identify public listings, not ownership. Academy needs authorized private media; Meet links are manually scheduled unless a real provisioning integration exists.
7. Exercise acceptance A–F on synthetic staging records, including multiple staff identities, PDF/image/video evidence, private file reads, revoked media, provider timeout, duplicate/out-of-order callbacks, partial payouts and replacement requirements. Perform physical Android/iOS camera/document/share/download and push/deep-link checks. Build/export checks do not establish physical-device behavior.

## Later approved production promotion

Obtain the separate release instruction. Promote reviewed Vendor changes to `main` and matching Customer shared changes to `customer`, preserving product-specific entry points. Use their own production deployment pipelines. Coordinate compatibility and workers across both backends; monitor missing policy responses and pending financial intents. Enable live provider money movement only under a separate explicit finance release instruction and after test-account reconciliation passes.

## Rollback

Disable provider execution first; stop operational writers and workers if consistency is in question. Preserve payment receipts, confirmed operations, private evidence, permanent bank-reference claims and ledger/audit/outbox records. Record the deployed artifact IDs and provider operations already initiated.

An older backend contains reference-only settlement/completion paths and may not understand new states. Rolling application code back while leaving these write endpoints exposed is unsafe. Keep affected write paths closed, preserve read access, and restore a previously reviewed compatible artifact or fix forward. Do not reverse confirmed money by changing a status or deleting a ledger entry. Reconcile provider/bank truth and use separately authorized compensating operations where required.

The additive schema generally permits retained data, but rollback must preserve `CHECKED_IN`, workflow versions, policy/commercial snapshots and evidence references. Restore a database snapshot only under an approved recovery plan after reconciling all external money movement since that snapshot. Reopening a write path requires reconciling pending provider markers, workflow intents and stale schedule leases first.
