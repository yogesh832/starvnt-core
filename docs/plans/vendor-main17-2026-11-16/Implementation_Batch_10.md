# Historical identity audit preparation — 17 November 2026

V16.04 preparation uses the existing MongoDB collections through a standalone reader. It imports neither application configuration nor models and performs no index initialization, application startup, provider calls or database mutations. No historical or production records were inspected in this batch.

The aggregation returns allowlisted states, booleans, confidence enums and storage categories. It does not retrieve PAN/GST/bank numbers, legal names, URLs, provider payloads or document bytes. Default reports contain aggregate counts only. Explicit `--include-ids` includes record/vendor identifiers for a controlled review workflow; treat such reports as restricted operational evidence. Missing historical provider proof is a review candidate, not a declaration that an identity is invalid.

Use a separately provisioned MongoDB credential with read-only access to the selected external database. The script performs only reads, but cannot turn a write-capable credential into a read-only credential. Set a task-specific environment variable securely outside shell history. It never loads `.env` or assumes a default database. Example using a credential already provided in `IDENTITY_AUDIT_URI`:

```powershell
node server/scripts/audit-vendor-identity.js --confirm-read-only --uri-env IDENTITY_AUDIT_URI --database SELECTED_EXTERNAL_DATABASE --max-records 10000 --out D:/restricted-audit/new-identity-report.json
```

Select and authorize the actual target before execution. Output must be a new file in an existing restricted directory. POSIX creation mode is 0600; Windows permissions follow the directory ACL, so choose a restricted location there. Existing files are never overwritten. The scan is bounded to 1–100000 records per collection, sorted by immutable ID; a truncated scan reports PARTIAL_LIMIT and is not a complete audit. Interrupted/unavailable sources report UNAVAILABLE_OR_INTERRUPTED, preserve any scanned counts as partial and exit with an incomplete result. Re-running a capped scan is not pagination and cannot establish coverage of the remainder.

Review categories: verified PAN/GST without current exact provider proof, inconsistent settlement eligibility flags, legacy inline/external storage, missing private-content/hash counterpart, and manually/uncertainly verified identity documents. These are triage reasons only. A correction proposal must name affected IDs in restricted evidence, reconcile current provider/legal evidence, assess booking/settlement and Customer impacts, obtain the applicable approval, take a verified backup and define reversal/notification handling. This tool intentionally has no correction mode.

Verification: three meaningful tests in `server/test/vendor-identity-audit.test.js` pass against temporary MongoDB: database documents remain byte-for-byte unchanged, sensitive fixture values never appear in output, healthy exact evidence is not flagged, legacy/private categories are separated, caps report incomplete coverage, unavailable data is explicit, and CLI target/limit arguments are required. Run: `node --test server/test/vendor-identity-audit.test.js`. No full backend re-run required for these isolated modules after the preceding 297-test regression; application runtime files are unchanged in this batch.

Rollback: remove the standalone script and helper if needed; no database migration or reversal required. Preserve restricted reports according to approved retention rules. Production audit execution, approval of corrections and subsequent corrections remain unperformed.
