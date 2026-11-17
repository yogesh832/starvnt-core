# Verification evidence and limits

Latest checkpoint: 17 November 2026. The table below retains the original plan baseline, not current acceptance. Full backend after Batch20: 320 passed, zero failed. All 33 web and 114 mobile tests last passed in Batch19; later optional source-version forwarding passes current build/TypeScript and thirteen signed-in browser scenarios. These include lost-receipt recovery, private PDF evidence, lesson/meeting archives, meeting/source failure isolation and truthful draft/enquiry states. Dedicated tests cover durable quote effects, authoritative private scope and reviewed source changes. Evidence logs are in `tmp/vendor-main17-implementation/`; see Required_Output_Comparison.md and batch records for provenance/limits. Human/native, full accessibility, provider/legal, general worker/restore/provider delivery and production-operational acceptance remain open. Original wording below must not be read as a claim that later browser checks were unexecuted.

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
