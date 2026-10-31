# Production portal blank page — 1 November 2026

The live frontend identified itself as `e4a901f6b991d0f1aec0ba6f40040a4edec3769a` through `https://vendor.starvnt.com/deployment.json`. Backend health was HTTP 200. HTML and its JavaScript/CSS assets also loaded successfully.

The production router placed ordinary customer, vendor and admin routes inside `import.meta.env.DEV`. Vite removes those routes in production. An authenticated user visiting `/customer` or `/vendor` then reached the wildcard redirect back to that same missing route, yielding an empty root rather than a dashboard. HTTP health checks and successful compilation did not detect the problem.

The routing and dashboard corrections had previously been published to `customer` while only backend changes went to `main`, per the earlier branch instruction. The AWS production deployment uses `main`; `customer` does not deploy this site. The user explicitly authorized publishing the web fixes to main on 1 November 2026.

## Correction

- Ordinary portals are always registered and retain their existing session and role guards.
- Only actual developer/test routes remain inside the development-only guard.
- The existing render error boundary now wraps application routes, providing a recoverable error screen rather than another empty root if a component fails.
- The previously tested web Vendor OS business panels, financial/analytics/review states and exact-record links are included in the production frontend.
- The web navigation fixes hide closed mobile navigation from focus and remove a call to a nonexistent badge persistence helper.
- Mobile source remains on customer. No mobile, payment, eligibility, database or financial-lifecycle changes are part of this release.

## Verification

Local production Vite compilation: PASS. Web unit tests: 24 passed, zero failed.

`server/scripts/verify-vendor-business-dashboard.js` passed **41 browser/API checks** against the production build and ephemeral local MongoDB. It exercises actual API-authenticated vendor and customer sessions, vendor-to-customer route correction, guest customer/vendor/admin sign-in destinations, disabled production developer shortcuts, goal persistence/progress, dashboard reconciliation, authorized record links, responsive layout, and network error recovery. The customer workspace and vendor dashboard render without JavaScript errors. These tests use synthetic fixtures and do not certify OTP/payment providers or real customer records.

Deployment CI now installs Playwright as an isolated verification tool, builds a separate production test bundle pointing at the ephemeral local API, and runs these browser checks before container deployment. It uses the repository's existing Node test framework and application workflows. The separate QA bundle is never shipped as the production frontend.

Local evidence is under `tmp/qa/blank-page-2026-11-01/` and `tmp/qa/vendor-business-dashboard/`. No generated bundles, tokens, screenshots or fixture data are committed.

## Rollout and recovery

Push the reviewed web/QA correction to main and follow the existing AWS deployment workflow. Confirm checks and deployment succeed, then verify the public deployment revision matches the release commit and protected routes reach visible sign-in pages. An already signed-in user can refresh the existing customer/vendor page to mount the restored authorized portal. A fresh browser smoke test does not impersonate or access that user's session.

If deployment fails, use the existing release rollback in `deploy/aws/README.md`. There is no database migration or financial state to reverse.
