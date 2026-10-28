# Web-to-native parity and QA record/

Audited from the repository's web routes, auth providers, API clients, customer controllers/services, Vendor OS routes, Core routes and shared notification logic. The existing web implementation includes placeholder content in some admin event-workspace views; mobile must use real API data rather than copy fabricated checklist/service entries.

“Implemented” means a native screen and API wiring exist. It does **not** mean the entire flow passed against live credentials on Android and iOS. No production writes, OTP messages, payment transactions, user provisioning or deployment were performed during this implementation.

## Implemented

| Area | Native implementation | Verification boundary |
| --- | --- | --- |
| Identity | Customer/vendor email verification then password login/register, password set/reset, direct phone OTP, surface switching, isolated admin sign-in with MFA code | Session transport and rotation/revocation tested through real HTTP routers with mocked persistence; real email/SMS and both device keychains still need QA |
| Google | Native Google ID token submitted to existing `/auth/google` | Android EAS signing fingerprint and public web client configured; iOS OAuth setup and actual development-build sign-in still pending |
| Navigation/UI | Native stacks and role-specific tabs, back navigation, safe areas, keyboard handling, large touch targets, light/dark palette, scalable text, responsive bounded layouts | Browser sign-in reviewed at 390 × 844; native keyboards, gestures, font scaling, tablets and lifecycle still need QA |
| Customer home/events | Active events, attention signals, search, create/edit event, draft confirmation, event workspace | API contracts inspected; signed-in device QA pending |
| Customer planning | Full manual event creation, backend event types and service fields, per-service venue/pickup/drop and event-location selection, draft edits, requirements/status, discovery, portfolio/reviews, comparison and favorites | Changed-only edits preserve budget ranges and saved map coordinates; interactive map picking remains to be ported |
| Customer commerce | Plan quotes, vendor quote requests, vendor offers/negotiation, quote acceptance, reservations, booking/payment views, coupon entry, native checkout, cancellation and completion verification | SDK callback stays processing; checkout, webhook, expiry, balance/coupon cases need device E2E |
| Customer collaboration | Event Circle and vendor-thread messages, file attachments and shared-media links, focused refresh, updates/read state, Aura chat/history/resume, backend answer choices/date picker and event-plan handoff | Saved-plan review/confirmation and structured choices implemented; native voice, interactive map picking and general universal/app links remain pending |
| Customer account/library | Profile editing, contract upload, authenticated PDF download/share, favorites/remove | Native file providers/sharing and protected redirected downloads need device QA |
| Vendor dashboard | Real badges, activation status, enquiries, quotes, bookings, messages/updates | Counts and setup views use backend state; full native E2E pending |
| Vendor business setup | Profile/hub, pricing models/tax/unit/lead time/status, capabilities/team capacity, resources, operating-location search/edit/primary selection, coverage, travel policy, working hours, monthly/day calendar, partial-day blockouts and manual service/resource slots | Backend contracts inspected; switching service editors resets or hydrates their actual capabilities; device interaction QA pending |
| Vendor sales/execution | Quote creation/revision with travel/equipment/setup/additional charges, booking start, messages and Aura-assisted drafts, multiple evidence uploads, checklist/notes submission, financial metrics, reviews/replies | Completion submission does not confer Core verification or settlement authority; provider/file-device E2E pending |
| Vendor portfolio/KYC | Multi-media projects, review/published visibility, media title/description edits, project/media deletion, document submission, PAN/GST/discovery and bank onboarding with verification history | Existing backend services determine all statuses; no real provider verification or bank operation was performed during development |
| Vendor Aura | Server conversation library/resume, scoped session restore, confirmation of proposed changes, native destinations for supported action links | Native voice and unsupported action destinations remain pending |
| Admin home/modules | Permission-filtered role modules, advanced booking/audit/automation filters, audit cursor navigation, report CSV sharing, queue/worker health and server pagination where supported | CSV sharing, signed-in role permissions and refresh behavior need device QA |
| Admin actions | Customer/vendor edits/restrictions/soft deactivation, detailed booking finance/evidence review, payment/completion verification, finance requests and approved execution, failure reporting, approval/rejection, failed-job retry, expanded coupons, staff roles/permissions and settings | Finance execution retains approval payload and requester separation; native role/provider E2E remains pending; MFA enrollment is an additional enhancement with no matching web enrollment UI found |
| Notifications and native push | Existing customer/vendor inboxes and permission-aware Core inbox; foreground refresh, Android/iOS device registration, durable server queue, provider receipts/retries, token refresh/uninstall handling, logout revocation, permission controls and scoped notification tap routing | EAS project/signing are configured; Firebase/Apple credentials remain pending; live background/terminated delivery needs physical-device QA. Core summary read state remains in memory. See PUSH.md |

## Additional work before claiming full parity

1. Finish the remaining interactions identified in the table, including customer map selection, native voice, remaining booking-update drafting affordances, Google place linking, and a signed-in audit against the web. This is an ongoing parity implementation, not full parity approval.
2. Complete native voice UX with an appropriate OS speech implementation or an authenticated backend contract; the web currently uses browser speech APIs. Do not expose AI provider keys to the app or invent an unauthenticated transcription endpoint.
3. General universal/app linking remains pending. Notification-specific tap routing and push registration/delivery are implemented, but require the credential setup and physical-device scenarios in PUSH.md before release approval. A URL scheme alone is not a complete linking implementation.
4. Add signed-in interaction/E2E coverage on isolated QA data for every role, including limited staff and super admin. Development-only test-persona controls are guarded by `__DEV__`; their backend route must also remain server-gated. They are not a substitute for testing the actual authentication flows.
5. Review polished signed-in screen layouts with real data: narrow phones, long names/messages, empty/error states, accessibility font sizes, dark/light mode, keyboard overlap, tablets, back gestures and screen readers.
6. Review the reused web app icon and splash on native devices; prepare store listing assets, final package IDs, signing and distribution configuration. Mobile uses the actual web logo/favicon, Inter font and generated web color tokens; do not introduce an alternate brand/theme.

## Required device scenarios

- Clean install; existing session restore; access expiry; simultaneous expired requests; disabled/revoked user; logout; offline cold start and reconnect; account/domain switching.
- Email login/register/reset and phone OTP including expiry, incorrect code, throttling, provider failure, and account-type resolution. Google cancellation/failure/success on both OSs; admin MFA required/invalid/success.
- Create/edit event; schema-specific requirements for every category/event type; real-vendor search/detail/compare; existing/demo labels; unavailable dates; quote request/negotiation/acceptance; expired hold.
- Razorpay cancellation/failure/success; signed webhook verification; delayed verification; coupon discount; duplicate tap; interrupted checkout; balance payment. Never consider a native callback proof of payment.
- Two real QA identities exchanging messages; correct event/booking/thread scope; forbidden cross-user access; uploads from Android/iOS providers; file sharing.
- Vendor setup to actual server activation; KYC manual review; quote revisions; booking start/evidence; customer completion and Core settlement authority.
- Staff permission presets, hidden modules plus server 403 enforcement, finance maker/checker separation, references, audit reasons and session revocation after disable.

## Verification performed

Dashboard functionality follow-up: strict TypeScript, **50 mobile tests**, **52 backend tests**, and **134 real HTTP workflow checks** passed against isolated QA databases through the native API client. The pass covers all three role workspaces, limited staff permissions, event isolation, quote lifecycle/ownership, booking evidence/completion, Core maker/checker settlement flows, coupon edits and staff management. Financial scenarios use labelled QA fixtures/ledger records. See [DASHBOARD_QA.md](DASHBOARD_QA.md) for the exact coverage, commands and boundaries; no real bank transfer or provider operation is implied.

Fresh Android, iOS and web production bundle exports passed after the final record-state reset and resource refresh changes. Resources now expose data only for their active API/path; refresh returns its actual request promise, and record-specific editors/checkouts/evidence reviews reset when switching records.

2026-10-18 comparison batch: strict TypeScript and **46 mobile tests** passed; **48 backend tests** passed. Changes include discovery sorting/comparison, saved-plan review and structured Aura answers, scoped Circle selection, budget/My Vendors workspaces, completion-evidence review, vendor payments/analytics/reviews and document actions. Completion verification now rejects foreign or Core-unlinked legacy bookings instead of bypassing Core. The route and interaction mapping, including open gaps, is in [WEB_PARITY_MATRIX.md](WEB_PARITY_MATRIX.md).

Fresh Android, iOS and web production bundle exports passed after the final quote-review navigation and editable vendor Aura proposal/reply fields. Aura drafting discards stale responses after a context change or unmount and preserves text edited while generation was in progress. Export logs still include the tooling environment's `NO_COLOR`/`FORCE_COLOR` warning; exports completed successfully. Device/provider E2E and fresh visual QA were not performed in this batch.

Latest parity batch: strict TypeScript check and 34 mobile tests passed; Expo Doctor passed 21/21; clean Android, iOS and web production bundle exports passed. Exports compile the app but do not authenticate users or execute native provider flows.

Subsequent push implementation: 38 mobile tests and 45 backend tests passed; Expo Doctor 21/21, Android prebuild, iOS push-entitlement introspection and fresh Android/iOS/web exports passed. The owner's EAS project is now recorded in app config. Live push delivery still needs Firebase/Apple credentials and device verification; see PUSH.md.

- TypeScript strict check and native client/session/permission tests, plus planning payload preservation, service-location validation against the backend validator, vendor quote/evidence rules, finance approval/coupon rules, admin list filters, message attachments and vendor action destinations.
- Backend suite including native HTTP transport and real-router rotation/domain/replay/revocation coverage with mocked persistence.
- Existing Vite production build.
- Android and iOS Metro/Hermes bundle export.
- Android native project prebuild/config generation.
- Browser sign-in layout, vendor registration fields, admin MFA fields and local invalid-email validation. This was an unsigned preview; it did not exercise Google, payment, SecureStore or signed-in dashboards.

APK/IPA compilation, simulator/device execution, live provider E2E, and full parity approval have **not** been completed.

## SDK 57 upgrade

Expo 57, React Native 0.86.3 and React 19.2.3 are aligned with Expo's bundled dependency versions. Expo Doctor passed 21/21 checks. Android/iOS/web bundle exports and Android prebuild/config generation passed. Use Node 22.13+ within the supported Node 22 line or Node 24.3+; checks used Node 22.23.3. The global Node installation was not changed.

The dependency audit still reports upstream transitive advisories. No forced major downgrades were applied. Passing compilation and Expo Doctor does not establish a vulnerability-free or bug-free production release.

The earlier browser screenshots predate this parity batch. The preview server stopped after dependency changes, and automatic approval review rejected attempts to restart it (reported only as “blocked by policy”). Current layouts require a fresh preview and device review; the agent did not bypass that restriction.
