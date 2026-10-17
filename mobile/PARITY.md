# Web-to-native parity and QA record

Audited from the repository's web routes, auth providers, API clients, customer controllers/services, Vendor OS routes, Core routes and shared notification logic. The existing web implementation includes placeholder content in some admin event-workspace views; mobile must use real API data rather than copy fabricated checklist/service entries.

“Implemented” means a native screen and API wiring exist. It does **not** mean the entire flow passed against live credentials on Android and iOS. No production writes, OTP messages, payment transactions, user provisioning or deployment were performed during this implementation.

## Implemented

| Area | Native implementation | Verification boundary |
| --- | --- | --- |
| Identity | Customer/vendor email verification then password login/register, password set/reset, direct phone OTP, surface switching, isolated admin sign-in with MFA code | Session transport and rotation/revocation tested through real HTTP routers with mocked persistence; real email/SMS and both device keychains still need QA |
| Google | Native Google ID token submitted to existing `/auth/google` | Public platform clients/fingerprints not registered yet; cannot verify sign-in |
| Navigation/UI | Native stacks and role-specific tabs, back navigation, safe areas, keyboard handling, large touch targets, light/dark palette, scalable text, responsive bounded layouts | Browser sign-in reviewed at 390 × 844; native keyboards, gestures, font scaling, tablets and lifecycle still need QA |
| Customer home/events | Active events, attention signals, search, create/edit event, draft confirmation, event workspace | API contracts inspected; signed-in device QA pending |
| Customer planning | Requirements/status, service-specific forms from backend plan-options, discovery, details, portfolio/reviews, comparison, selection and favorites | Custom per-service venue/pickup/drop editing remains to be ported |
| Customer commerce | Plan quotes, vendor quote requests, vendor offers/negotiation, quote acceptance, reservations, booking/payment views, coupon entry, native checkout, cancellation and completion verification | SDK callback stays processing; checkout, webhook, expiry, balance/coupon cases need device E2E |
| Customer collaboration | Event Circle and vendor-thread messages, focused message refresh, updates/read state, Aura chat and event-plan handoff | Voice and previous Aura conversation browsing remain to be ported |
| Customer account/library | Profile editing, contract upload, authenticated PDF download/share, favorites/remove | Native file providers/sharing and protected redirected downloads need device QA |
| Vendor dashboard | Real badges, activation status, enquiries, quotes, bookings, messages/updates | Counts and setup views use backend state; full native E2E pending |
| Vendor business setup | Profile/hub, services, capabilities/team capacity, resources, operating locations with backend place search, coverage radius, travel policy, working hours and all-day blockouts | Advanced category attributes, slot/partial-day availability and rich calendar remain to be ported |
| Vendor sales/execution | Enquiry quote creation/revision, booking start, thread opening, evidence upload/completion submission, financial metrics, reviews/replies | Additional pricing components and evidence checklist editor remain to be ported |
| Vendor portfolio/KYC | Single media upload/publish and document submission, plus existing review states | Bulk projects/media organization, editing/deletion and detailed verification tools remain to be ported |
| Vendor Aura | Stateful chat, stored history for current session, explicit confirmation of proposed setup changes | Voice, full conversation library and action-link navigation remain to be ported |
| Admin home/modules | Permission-filtered customer/vendor/event/booking/finance/approval/report/automation/coupon/staff/audit/settings views; server pagination where supported | Advanced filtering, audit cursor pagination and CSV export remain to be ported |
| Admin actions | Flag records, review vendor documents, payment-reference/completion verification, request refund/settlement, vendor failure reporting, approval/rejection, automation retry, setting/coupon edits, staff creation and role/permission editing | Approved finance execution UI, rich booking evidence inspection, customer/vendor editing/restrictions, expanded coupons and admin MFA enrollment remain to be ported |
| Admin notifications | Reuses the web's existing permission-aware loader; partial-source failure display and local read state | Local read state is currently in memory; native notification delivery is separate work |

## Additional work before claiming full parity

1. Finish the remaining interactions identified in the table, prioritizing complete customer location/logistics requirements, native calendar/availability, evidence review, finance approval execution, and administration edits.
2. Complete native voice UX only after choosing the existing backend's supported speech input contract; do not expose AI provider keys to the app or invent an unauthenticated transcription endpoint.
3. Implement and test deep-link routing, universal/app links, notification tap routing and native push registration/delivery. A URL scheme alone is not a complete linking implementation.
4. Add signed-in interaction/E2E coverage on isolated QA data for every role, including limited staff and super admin. No developer-auth bypass is present in the app.
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

- TypeScript strict check and native client/session/permission tests.
- Backend suite including native HTTP transport and real-router rotation/domain/replay/revocation coverage with mocked persistence.
- Existing Vite production build.
- Android and iOS Metro/Hermes bundle export.
- Android native project prebuild/config generation.
- Browser sign-in layout, vendor registration fields, admin MFA fields and local invalid-email validation. This was an unsigned preview; it did not exercise Google, payment, SecureStore or signed-in dashboards.

APK/IPA compilation, simulator/device execution, live provider E2E, and full parity approval have **not** been completed.
