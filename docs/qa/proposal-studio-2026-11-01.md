# Proposal Studio verification - 2026-11-01

## Environment

Isolated worktree based on tested production main 2fe5b34. Ephemeral MongoDB databases, real Express routes, signed synthetic identity sessions, production Vite build, Chrome headless, synthetic geometric image fixture. No configured production database or AI/payment provider was used. Test image fetch is intercepted at the exact fixture URL. Production code cannot inject image loaders through HTTP.

## Evidence

- Existing backend tests plus nine proposal tests pass. The browser journey is opt-in and runs as a separate production build check.
- Web tests pass with the package's TypeScript stripping option.
- Native TypeScript check and 99 baseline mobile tests pass; seven destination tests (including the two new proposal routes) also pass. Android and iOS Hermes bundle exports succeed with the production HTTPS API base.
- Production browser journey covers staff agreement request, authenticated vendor approval, internal commercial approval, final PDF generation/delivery, customer snapshot guide, authenticated PDF download, 390px layout, change request, new version, exact-version approval and explicit preliminary state. No runtime page errors.
- Generated wedding, birthday and corporate PDFs are rendered with Poppler and inspected. Each one-service fixture has five pages; selectable text is checked with pypdf, every page has substantive text, and non-wedding fixtures contain no wedding-only content. Footer overflow regression is asserted in the backend test. Synthetic samples are evidence only and not real customer proposals.
- API evidence includes unauthenticated/domain/role/ownership denial, pending/rejected/expired/superseded agreement generation denial, missing commercial approval, pricing mismatch, scope changes, source changes, immutable previous versions, idempotent generation, confidential-data projection and booking/payment independence.

Local evidence is under tmp/qa/proposal-studio: api-tests.txt, server-tests.txt, web-tests.txt, mobile-tests.txt, browser-tests.txt, browser-report.json, customer-desktop.png, customer-mobile.png, preliminary-mobile.png, final-contact-sheet.png, wedding.pdf, birthday.pdf and corporate.pdf. Native bundle export logs are android-export.txt and ios-export.txt. The deploy workflow repeats the full production browser journey before deployment.

## Release scope

Web entry points: /customer/go/proposal, /customer/events/:id/proposal, /admin/proposals, /vendor/proposal-agreements. Staff need proposals.read/update/approve/generate as appropriate; Super Admin retains the existing explicit bypass. No other role receives new financial approval power automatically.

Known remaining handbook capabilities and reference limitations are recorded in docs/proposal-studio-audit-2026-11-01.md. Do not describe the full handbook as complete.

## Rollback

Revert the release commit to remove new API/UI entry points. Existing event, vendor quote, booking/payment and settlement records do not require a reverse migration. Retain the additive proposal collections and immutable documents for audit/history.
