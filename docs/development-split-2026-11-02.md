# Development work split - 2026-11-02

## Scope

Existing uncommitted work from the original workspace is saved on the appropriate maintained development branch. The original workspace is preserved. Neither `main` nor `customer` is promoted or deployed by this split.

- `vendor-dev`: inherits the already-published vendor web dashboard and backend from main; adds the matching native vendor business dashboard, record-specific navigation, analytics, and vendor agreement review. Customer-only authentication/navigation changes are not copied into this product line.
- `customer-dev`: adds customer location selection/search, event forms, Aura result placement, recommendation/project cards and required backend location dependencies. Customer-only authentication and Proposal Studio are preserved.
- Both development branches: mobile push registration safeguards, action-specific notification controls, unread badges/read-state refresh, Firebase build validation and explicit EAS environment selection. Only the sample server environment file changes; real secrets and deployment settings are untouched.

Older original-workspace App/router, vendor portal and QA-script copies were not reapplied over newer published fixes. Generated APK QR images are excluded from source commits. No new branch is introduced.

## Verification

- Vendor native TypeScript and 106 mobile tests passed.
- Customer native TypeScript and 113 mobile tests passed.
- Customer web: 39 tests and production build passed.
- Customer backend: 83 tests passed, with the opt-in browser case skipped in the unit run.
- The separate browser journey passed all 15 logged checks, including vendor-role URL rejection, saved vendor-session conversion, proposal generation/download/change/approval, and mobile-width layout.
- Android JavaScript/Hermes exports passed for both development branches. This is not a signed mobile release or physical-device verification.

Local evidence is in `tmp/branch-promotion/`; branch scope is recorded in `split-manifest.json`. This change does not enable staging infrastructure or push either production branch. Production promotion remains a separate release action after review.
