# Verification evidence and limits

Latest checkpoint: 17 November 2026. The table below retains the original plan baseline, not current acceptance. Full backend after Batch13: 308 passed, zero failed; subsequent meeting changes in Batches14–15 pass all 35 affected external/readiness regressions plus a focused concurrent-command check. Latest web build and mobile TypeScript passed. Ten signed-in synthetic browser checks passed, including private PDF bytes, Academy resource-version review, meeting failure isolation and meeting summary history at 390px. Mobile's 114 tests last passed after Batch14. Evidence logs are in `tmp/vendor-main17-implementation/`; see Required_Output_Comparison.md and batch records for commit provenance and limits. Human/native, complete accessibility, provider/legal and production-operational acceptance remain open. Original wording below must not be read as a claim that later browser checks were unexecuted.

Date: 16 November 2026 (Asia/Kolkata). Source: current dirty vendor-dev worktree. Provider calls in automated tests use isolated fixtures; databases use MongoMemoryServer. NODE_ENV=test and STARVNT_ENV_FILE=D:/starvnt-core/server/.env.test.example explicitly avoid loading live environment credentials.

| Command | Result | Evidence |
| --- | --- | --- |
| `node --test --test-concurrency=1 --test-reporter=spec server/test/*.test.js` | 211 passed; 0 failed | tmp/vendor-main17-plan/backend-tests.log |
| `npm run test -w web` | 30 passed; 0 failed | tmp/vendor-main17-plan/web-tests.log |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false -p mobile/tsconfig.json` | Exit 0, no diagnostics | tmp/vendor-main17-plan/mobile-typecheck.log |
| `node node_modules/vite/bin/vite.js build --outDir D:/starvnt-core/tmp/vendor-main17-plan/web-build` (cwd web) | Passed; existing bundle-size warning | tmp/vendor-main17-plan/web-build.log |
| Signed-in desktop/mobile/accessibility acceptance | NOT EXECUTED for Main17 plan | Planned per batch; no screenshots fabricated |
| Production identity/data/provider/restore/legal/tax acceptance | NOT EXECUTED / NOT AUTHORIZED | Requires recorded decisions and later permissions |

Useful retained-invariant tests in the current passing backend log include: directory tenant isolation and no name/mobile linking; verified explicit claim/current ecosystem consent; campaign global frequency and withdrawal; external booking tenant isolation/provenance/cent arithmetic; invalid/incomplete QR eligibility and consent revocation; strict capture/order/amount/currency/replay; dashboard unavailable-source and incomplete-cohort handling. These are narrow automated invariants. They do not close full V04/V19/V25/V29/V41/V74 modules or establish live provider success.

`Code_Anchor_Revalidation.csv` checks all supplied anchors against present file bytes and records relocated line numbers. `Referenced_Source_Inventory.csv` fingerprints referenced working files and distinguishes COMMITTED/MODIFIED/UNTRACKED. `Preexisting_Worktree_Changes.csv` preserves modified/deleted/untracked ownership boundaries. These artifacts do not contain environment secret values or actual identity records.

Per-batch evidence must record: exact item/source clause; baseline and eventual commit; meaningful new invariant tests; regression command/results; manual actor/device/state; redacted screenshot/demo if applicable; provider/decision limitations; migration rehearsal and rollback; reviewer/owner. Source blocks and passing old tests must never be converted into a percentage complete.
