# Priority fixes and Vendor OS audit follow-up

Date: 27 October 2026
Scope: the P0/P1 issues supplied in the user request, checked against `master-handbook-web-mobile-comparison-2026-10-26.md` and the current `D:/starvnt-core` checkout.

## Implemented in this checkout

- Public Privacy and Terms links now navigate to `/privacy` and `/terms` on web. Native sign-in has equivalent legal notice screens. The pages explicitly say approved text is pending and provide support contact details; they do not invent legal clauses.
- Developer authentication is unconditionally disabled when the server runs with `NODE_ENV=production`, even if `ENABLE_DEV_TOOLS=true`. Web test routes, customer/admin login banners, and the admin auto-fill control are development-only. Native test authentication is compiled only into Expo development builds.
- Vendor quote creation and revision, including Aura-created offers, use the category payment policy and store the applied percentage and policy version with the quote. `CoreBooking` no longer defaults the advance percentage to 30. Super Admin owns policy edits; edits require a reason and are versioned/audited. The existing 30% remains the explicit system fallback until an approved business policy replaces it. Existing quotes with a stored percentage retain their terms.
- Unsubstantiated public statistics, city coverage, escrow custody, money-back, and absolute payment-security statements were removed or rewritten as provider-verification/status language. Aura is instructed not to claim custody or bank transfer without corresponding evidence.
- External booking customer name and phone are optional. A supplied phone is still format-checked, and web/native form labels reflect the optional fields.
- The fabricated Quick Auto-Fill vendor profile/showcase action was removed. Deleting a service referenced by a quote now archives it and preserves capability/coverage history.

## Requirements audit status

The broad findings remain documented in `master-handbook-web-mobile-comparison-2026-10-26.md`. The additional fixes above close or reduce F01–F05 and F07 in that report. This change does not establish full Vendor OS conformance: immutable commercial quote revisions, complete travel/lead-time/duration rules, end-to-end portfolio rights/media validation, category-specific execution evidence, complete customer review acquisition/moderation, vendor cohort analytics, unified action center behavior, full native Admin filters, and device/provider/deployment acceptance still need work and evidence.

The PDF does not provide the approved advance percentage or legal text. The Finance policy is editable by Super Admin; its 30% system fallback preserves current checkout behavior until the business approves a replacement. Production environment configuration still needs deployment-owner review even though the production code cannot override the hard stop.

## Local verification

- Server tests: 36 passed, including direct production `/api/admin/auth/dev-auth` denial with the enable flag set, optional contact validation, quote policy snapshotting, and safe service archival.
- Mobile tests: 99 passed.
- Web production build: passed. Test routes and developer-only login controls are removed from the production bundle.
- `git diff --check`: passed before the latest follow-up edits; rerun as part of final validation.

Local test results do not establish deployed AWS behavior, approved policy/legal content, live provider custody, Google/OTP delivery, or physical-device acceptance.
