# STARVNT Vendor Growth and Governance implementation

This handoff records the local implementation after the review package. Release sequencing follows the current project boundary. Vendor Growth and non-ticketing governance are Phase 1. Event ticketing is Phase 2. The [Founder handoff](founder-inputs-phase1.md) lists the approved decisions and materials needed for rollout.

Keep Phase 2 ticketing out of the Vendor OS Phase 1 rollout on `vendor-dev`. This covers event ticketing and booking, ticket QR generation and scanning, ticket orders and payments, ticket refunds and settlements, and all ticketing-specific workflows and modules. Vendor profile QR and Experience QR are also deferred to Phase 2. The [QR release switch](../server/src/common/vendorQrRelease.js) keeps QR controls, issuance and Experience feedback access disabled for this rollout.

The Vendor OS development branch integrates portfolio privacy, vendor identity and profile sharing, Academy, Growth Meetings, and versioned signup acceptance in Core and Vendor web. The earlier implementation contains the Partnership routes and the customer and native signup screens. The Partnership routes belong on the Customer OS release line. Keep the signup bundle unset until all supported clients are ready to submit acceptance. Use the test evidence for each target branch and artifact when approving a release.

| Area | Implemented locally | Remaining |
| --- | --- | --- |
| Portfolio privacy | The anonymous portfolio query requires public visibility and a published status regardless of caller filters. It sends `Cache-Control: no-store`. The owner view keeps access to its own private and unlisted items. Vendor edits cannot transfer ownership or assign Core verification or booking-proven status. | Inspect existing provider originals, thumbnails and public URLs on approved staging data. Previously distributed Cloudinary URLs require provider-side controls or migration. Complete per-use sharing, download, organic, paid and third-party media rights and revocation follow-up. |
| Vendor identity | Vendor owners manage, hide or remove validated social links on the canonical organization. Revision checks prevent stale saves. An opt-in, approved active profile exposes only business name, category and validated public links. A suspended account or unpublished profile stops resolving immediately through the Core route. | Confirm platform URL coverage on devices. Public links use accessible platform names and the existing link icon pending approved platform marks. This profile slice excludes services, packages, project media and offers. |
| Share Your Business | The standalone sharing page is deferred to Phase 2. | Review the page, profile link sharing and QR controls for the Phase 2 release. |
| Public acquisition | Customer web development mode includes `/partners` and `/partners/demo`. The demo renders 13 fixture modules without mounting external auth or the marketing tracker. Sign-up hands off to the configured Partner portal with a fixed Partner dashboard destination. | Approve route ownership, final copy, Founder footage, portrait/landscape video and captions, legal publication and commercial terms. Confirm public-host direct navigation and asset delivery before enabling the production build flag. |
| Signup governance | Core serves effective, configured customer/vendor terms and privacy text verbatim. When configured, all four account-creation routes require affirmation of the current role-specific version and hash. The evidence is stored with the new account. Existing sign-in and optional marketing consent remain separate. Web and native display the approved documents before signup. | Receive approved text, entity and statutory details, version, approver and effective date. Stage across real auth providers and supported native builds. The separate master partnership agreement/compliance and booking-specific acceptance require their own approved documents and workflows. |
| Financial governance | Existing two-person policy approvals and immutable quote terms continue to provide the foundation. | Confirm provider configuration, approved advance/refund/settlement rules and exact booking payment authorization. Complete signed Razorpay sandbox, refunds and settlement reconciliation evidence before live activation. |
| Partner Academy | Staff can create and edit drafts and approve scheduled or immediate publication with a recorded rights reference. Withdrawals and expiry block new access. Vendors can search and filter, read lesson and resource notes, view captioned videos through a short-lived grant, and keep progress per lesson version. | Load approved content, assign staff permissions and verify real video playback and seeking through the configured Cloudinary account. Add richer resources, recommendations, staff reporting and native surfaces as needed. |
| Growth Meetings | Staff can schedule a manually created Meet for approved active vendors or a selected invite list, reschedule, cancel, record attendance and publish summary notes. Vendors can see their next eligible meeting, RSVP, join within the access window and submit private post-meeting feedback after attendance is recorded. | Confirm Workspace host and admission settings, agree invitation and reminder policy, run staging with actual eligible accounts and add recording consent before any recordings are shared. |
| Remaining Phase 1 product work | Reuse and dependencies are mapped in the [Founder review package](vendor-growth-phase1-founder-review-2026-11-07.md). | Community and recognition, subscription, company marketing operations, broader media rights and extended Aura+ remain outstanding. Family Experience has a separate programme decision. |

## Approved configuration

Set `STARVNT_SIGNUP_DOCUMENTS_FILE` to an absolute path to the UTF-8 JSON bundle supplied through the approved release process. The file requires top-level `CUSTOMER` and `VENDOR` objects. Each has `terms` and `privacy` entries, each with the fields below. The application hashes the exact `body`, calculates the effective instant from `effectiveFrom` and starts enforcing the effective bundle for new accounts when this configuration is present. Preserve historical bundles in the approval archive, and keep all server instances on the same bundle during rollout. The client signup changes must reach supported web and native surfaces before this gate is enabled. An incomplete or invalid configured file fails server startup. A valid bundle with documents that are yet to take effect blocks new signup until both applicable documents are effective.

```json
{
  "version": "<approved document version>",
  "body": "<exact approved document text>",
  "approvedBy": "<recorded approval owner>",
  "effectiveFrom": "<ISO-8601 timestamp with timezone>"
}
```

Set `STARVNT_VENDOR_PUBLIC_ORIGIN` only after the approved host serves `/vendors/:vendorId` with the web artifact and supports direct route refresh. The server otherwise keeps public profile publication unavailable. Set `VITE_PARTNERSHIP_PUBLIC_ENABLED=true` for the customer web build once the Partnership route and content are approved. The existing configured Partner origin controls the CTA destination. The sample demo does not need a server flag or provider account.

Disabling profile publication causes existing profile URLs and QRs to resolve as unavailable. The server keeps the saved social identity and revision. For signup rollback follow the approved legal and release process and retain the acceptance evidence already recorded. Code and configuration should be promoted as a compatible set. This implementation has no production migration or deployment record.

## Academy staging setup

Assign `academy.read`, `academy.edit` and `academy.publish` using existing Admin permissions. Use text-only lessons or an authenticated MP4 provisioned under `starvnt_private/academy/` in the existing Cloudinary account. A video draft needs WebVTT captions and duration. A publisher supplies a recorded rights reference and any applicable expiry. Progress and completion are learning records and are never business verification or award evidence.

The playback endpoint checks publication and expiry, verifies the asset type and gives a signed URL with up to five minutes of remaining access. Rights withdrawal blocks new grants. A previously issued provider link can be used until expiry, and the application cannot retract a copy already received. Verify browser Range behavior, expiry and signed delivery cost using the actual provider account before rollout. [Cloudinary authenticated media and time-limited access](https://cloudinary.com/documentation/control_access_to_media#restrictive_delivery_types)

## Growth Meetings staging setup

Assign `growthMeetings.read`, `growthMeetings.schedule` and `growthMeetings.run` through Admin permissions. A scheduling staff member supplies a direct link for a Meet created in Workspace. The API holds the link until 15 minutes before the meeting and stops serving it at cancellation or end. Rescheduling versions the slot and requires a fresh RSVP. Staff attendance and feedback are private to assigned operators and the relevant vendor can see their own records.

The host controls admission once a URL has been released. For invite-only meetings, configure the corresponding guest list and restricted access in Google Meet. When cancelling or replacing a link that participants already received, also update access on the Workspace side. Calendar automation, outbound invitations, reminders and recordings are separate release items. [Google Meet host access controls](https://support.google.com/meet/answer/9302870)

## Local verification

- Growth Meetings passed the 32-test readiness integration suite. The meeting test covers staff permissions, audience isolation, schedule revisions, RSVP, cancellation, link access, attendance and feedback. The web suite passed 87 tests, and both web builds passed. Chromium exercised scheduling and vendor RSVP at 390px with mocked API responses.
- Academy follow-up passed all 31 readiness integration tests and both focused tests after adding signed playback coverage. The provider responses were mocked. All 87 web tests and both web builds passed. Chromium exercised vendor completion and staff publication at 390px with mocked API responses.

- The serial backend suite passed 201 tests, including anonymous portfolio privacy, owner-scoped social links, QR eligibility and acceptance on password, Google, phone OTP and widget signup paths. Provider-specific signup tests use local fixtures.
- All 87 web tests passed. Customer and vendor web builds passed with the existing bundle-size warning.
- Chromium verified the Partnership page and demo at 390px and 1366px. The demo sent no app API, identity-provider or tracking requests. The app's existing font stylesheet is a separate static resource.
- Chromium verified the signup document preview, exact public profile destination and vendor link editor and QR journey at 390px with mocked API responses.
- The changed native files passed TypeScript syntax transpilation. Native tests passed 113 of 115. The Metro and voice-upload suites still fail on missing Expo files, and full typecheck still cannot resolve `expo/tsconfig.base`. Supported device and provider acceptance remains open.
