# Proposal Studio completion verification

Date: 2026-11-01 (Asia/Calcutta).

## Implemented

Shared structured content vocabulary and server validation; unambiguous menu choices; inventory/capacity caveats; equipment and staffing details; deliverables; venue diagrams; dynamic checklists with mandatory evidence; payment milestones; server-side internal cost/margin review; customer visual preferences requiring staff review; verified portfolio selection; five visual themes; selectable multi-page PDF composition; Gemini snapshot-grounded assistant with protected Core state and monetary/state claim checks; durable image jobs with idempotency, permission and quota failure behavior; explicit source labelling; matching web and native editing/review flows.

Legacy agreements and snapshots remain usable until relevant source content is edited. New structured scopes and visual directions participate in vendor approval fingerprints. Original PDF sample amounts, percentages, client identity and images are not hardcoded as production facts.

## Verification

The full backend suite, web tests, native TypeScript and mobile tests run in isolated worktrees. The extended production browser test runs against ephemeral MongoDB and real Express routes, with explicit image-provider test adapters. Customer/staff/vendor pages are tested through the approval, versioning, content and concept journeys. The deployment workflow repeats this before publication.

Local evidence: tmp/qa/proposal-completion/server-tests.txt, api-tests.txt, web-tests.txt, mobile-tests.txt, browser-tests.txt; tmp/qa/proposal-studio/browser-report.json; rich wedding and corporate sample PDFs and rendered contact sheets. A4/selectable text, every-page content, correct stage amounts, section presence, source labels and absence of source-page-12 overlap are checked. The new renderer does not impose twelve pages on arbitrary events.

## Real provider evidence and external dependencies

The configured local Gemini key successfully listed available models and generated a text answer with gemini-3.5-flash-lite. A real image generation job for gemini-3.1-flash-image failed with HTTP 429 and was recorded as FAILED, without automatic retries. Provider billing/quota must be enabled in the owning Google project to verify a successful live generated image and Cloudinary delivery. Keys are never logged or requested in chat.

No physical device was connected. An internal Android build uses the existing Expo project, production environment and signing credentials; it is not automatically submitted to an app store. Native device-specific verification and any store release remain distinct from source/bundle verification.

## Rollback

Revert the completion release to restore the initial renderer and screens. Preserve proposal versions, generated PDF bytes, agreement/approval evidence, message history and concept-job records. Existing booking/payment/settlement state is never modified by this feature's customer approval or assistant calls.
