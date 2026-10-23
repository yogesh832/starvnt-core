# Backend-only production integration — 23 October 2026

Source: latest pushed `customer` commit `1eaf008d5c7212f88b0e0008c0daf854b5a57d2d`.
Target baseline: `main` commit `d28155fe2fce35e2e522d024a8c09a7395cbf8f1`.

This update brings the committed customer backend into main, including the
account/session, demo seed, Aura fallback, category, vendor quote, verification,
and email delivery changes. The two uncommitted vendor Aura source edits in the
customer checkout were left there and are not part of this snapshot.

Frontend, mobile, deployment files, and the root package manifest retain main's
contents. The root lockfile only updates the backend development dependency
declarations and Supertest version. Main's production dev-tools configuration,
serial test runner, and additional regression suites are retained. The customer
test importing `web/src/lib/adminNotifications.js` is excluded from this
backend-only integration.

No AWS deployment, database migration/seed, environment, or DNS changes are
performed as part of this Git update.

Validation: clean `npm ci --ignore-scripts` succeeded. All 240 backend tests
passed with zero failures or skips using `node --test --test-concurrency=4
"test/**/*.test.js"`. The two retained main-only expectations were updated for
separate DJ/sound categories and the six-step vendor setup checklist; their
focused 22-test run also passed. Temporary test databases were placed on D:
after the C: drive ran out of space. `git diff --check` and the frontend/mobile/
deployment scope checks passed.

## Earlier integration — 21 October 2026

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
