# Backend-only production integration — 21 October 2026

Source: `customer` at `3f56ba0`, including its current tracked and untracked backend work. Target baseline: `main` at `92def6f`. Only `server/` is included. Web, mobile, root manifests/lockfile, and deployment workflows retain main's contents.

A backend-only snapshot was merged using a three-way merge. Main's explicit development-tools configuration and reseed endpoint guard were preserved. Existing main regression tests and test dependencies were retained. A frontend-only notification test that imports `web/src/lib/adminNotifications.js` is excluded from this backend-only release; no frontend code was copied to satisfy it.

The refreshed integration checks cover literal Aura planning without an unnecessary model call, current catalogue visibility, current DJ/sound categorization, hallucination guards, and read-only catalogue helpers. They found and fixed a venue parsing regression: an explicit phrase such as `My venue is Kisan Palace` must save `Kisan Palace`, rather than the whole sentence.

## Validation

- Clean install from the unchanged production root lockfile succeeded.
- All 115 customer-branch backend tests passed (frontend-only test excluded).
- All 86 changed backend JavaScript source files passed syntax checks.
- Final full suite: 209 tests, 198 passed and 11 failed. Failure names exactly match the unchanged main baseline: no additional failing tests. Updated integration contracts pass; existing main regression tests remain present.
- The unchanged main baseline failed 11 of 94 tests before integration. Those failures involve stale fallback copy, refresh/Google/surface expectations, payment-history and quote fixtures, seed idempotency/counts/demo wording, and a bank-verification fixture. They are not represented as passing in this release. Detailed comparison logs are retained in the original workspace's `tmp/qa/backend-main-baseline-tests.log` and `backend-production-final-tests.log`.
- Final scope check requires every changed path to start with `server/` and web/mobile trees to exactly match the original main baseline.

## Deployment boundary

No production database reset, seed, document approval, financial verification, or secret/environment change was performed. Public `/api/health` returned HTTP 200 before the update. This endpoint does not expose a commit/build identifier, so it cannot prove that a particular release has deployed. Main contains no repository deployment workflow; hosting-side deployment must be verified separately.
