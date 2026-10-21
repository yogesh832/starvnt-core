# Web QA — 20 October 2026

Aura identity update: shared `AuraMark` now supplies the supplied transparent orb in customer/vendor centre navigation and voice mode, and a scalable glass four-point star in Aura cards, replies, headings and actions. STARVNT branding and rating/category icons remain separate. Optimized PNGs are local (96px / 384px), with theme-aware glow and reduced-motion support. Vendor mobile navigation now has Aura in the centre; Calendar remains available from More / Availability and its existing header shortcut. The vendor panel reserves bottom navigation space. Phone-width browser checks verified both customer themes, the vendor tab opening/closing Aura, and More retaining Availability access. Web tests passed 22/22, including mute/playback and event facts/link regressions; production build passed with the existing large-chunk advisory. Evidence: `tmp/qa/aura-brand-regression.log`, `tmp/qa/aura-brand-build.log` and `tmp/qa/web-review/aura-brand-*.png`. This remains a web-only change; native mobile files were not edited for this request.

**Later test-data reset:** At the user's request, customer@starvnt.com (Ananya Sharma) and catering@starvnt.com (Royal Kumaoni Feast & Traditional Catering / Chef Sanjeev Verma) were reset to signup-only state. 835 linked records were removed across both databases, including the customer's accidental vendor organization and its vendor role. A local recovery snapshot was saved before mutation. Identity IDs and existing password hashes were retained; other account identities and events were preserved. Ratings derived from the deleted customer's reviews were recalculated.

Both Dev Auth logins and empty owned-data APIs passed 45 verification checks (`tmp/qa/reset-two-verification.json`), including vendor setup progress at 0% with matching inactive. Browser checks confirmed customer “No events yet” and the empty vendor dashboard. The deleted records include the legacy/Core payment mismatch and old payment outbox jobs discussed in the historical review below. Those fixtures, IDs, screenshots and historical failure counts describe the pre-reset state. The named accounts now have no old business/Aura data. The Dev Auth catering card retains signup details without a fabricated verification badge or price.

Scope: the actual Vite web application at `http://localhost:5173`, backed by the local server on port 4000. This review did not use the Expo web preview and did not extend native app work. Existing mobile changes were preserved.

Customer reference-design update: replaced the plain homepage command block with a photographic wedding hero, responsive heading, glass input, suggestion pills and gradient orbits. Desktop places the hero above the event/budget row; mobile includes a compact Aura shortcut. A shared event summary powers Home and event detail with a party emblem, fact icons, glowing planning steps, venue row, payment/readiness tiles and a gradient Aura panel. Scoped light/dark CSS preserves the brand logo, hamburger and bottom navigation. The local photo is `web/public/images/customer-wedding-hero.jpg` (351,325 bytes), with built-in imagegen prompt/provenance at `web/design-assets/customer-wedding-hero.txt`. It recreates the scene rather than claiming to be the original mockup photograph.

Browser review verified the mobile hero and event card in both themes, and Edit → Cancel without saving data. A separate existing test customer provided a populated event; no new business fixtures were created. Tests verify absent facts stay unset, saved amounts/guests/dates are used, only verified payments contribute to paid amounts, and Aura links retain the event. The full suite passed 127 tests. Evidence: `tmp/qa/customer-design-regression.log`, `tmp/qa/customer-design-build.log`, `tmp/qa/web-review/customer-design-home-dark.png`, `tmp/qa/web-review/customer-design-event-dark.png` and `tmp/qa/web-review/customer-design-event-light.png`. Desktop layout is implemented responsively; the available browser surface provided a phone-width viewport for visual review.

Customer mobile web navigation: added a header hamburger opening the existing sidebar as a drawer with all 13 sections, readable labels, current-page highlighting, a scrollable menu and profile/logout footer. Browser checks at phone width verified every section link, automatic close after navigation, Escape dismissal and focus returning to the opener. Event links resolved to the customer's current birthday draft. No event or commerce data was edited. Production build passed (`tmp/qa/customer-menu-build.log`); the existing bundle-size warning remains. Evidence: `tmp/qa/web-review/customer-mobile-menu.png`.

Customer event actions: each Events card now has a three-dot menu with View, Edit (for editable events) and Delete. Deletion is available only for unconfirmed drafts without commerce commitments, with a permanent-delete confirmation. The backend checks ownership, blocks any related quotes/requests/reservations/payments/bookings and removes draft planning/Aura records in an external-database transaction. The current-event selection refreshes after deletion. Confirmed events remain protected. The user's birthday event was retained during UI checks; only a temporary QA draft was deleted through the real API. Five live API checks passed (ownership, confirmed-event protection, payment protection, complete cleanup, subsequent 404). All 124 server/web regression tests passed. Evidence: `tmp/qa/delete-event-live.json`, `tmp/qa/event-actions-regression.log`, `tmp/qa/web-review/customer-event-actions.png` and `tmp/qa/web-review/customer-event-delete-confirm.png`.

Status: browser review and the fixes below are complete. **This is not a production sign-off.** The remaining checks and unfinished functionality are listed explicitly below.

## Verification

| Check | Result |
| --- | --- |
| Server and web regression suite | 127 passed, 0 failed |
| Local authentication, permissions, refresh and revocation smoke checks | 61 passed, 0 failed |
| Additional authenticated customer, vendor and admin section API reads | 47 passed, 0 failed |
| Final targeted authentication cancellation tests | 4 passed |
| Production web build | Passed; existing large JavaScript chunk warning remains |
| Unbound JSX component scan | No unresolved component references after the location-form fix |
| Live ElevenLabs speech → transcription through authenticated backend APIs | HTTP 200 for both; 39,749 bytes of MPEG audio; exact Hindi sentence recovered |
| Browser live catalogue cards | Guest edit 120 → 121 automatically changed ₹54,000 → ₹54,450 without another chat message; restored to 120 / ₹54,000 |

The ElevenLabs test sentence was “मैं आपकी योजना में मदद कर सकती हूँ।” The audio fixture is `tmp/qa/aura-web-voice.mp3`. The test verifies the real provider integration, not a simulated provider response. Browser microphone capture and audible playback still need a hands-on check.

One initial full test run hit a 15-second child-process startup timeout in the configuration test while other work was running. That test passed in isolation, and the subsequent complete suite passed with concurrency limited to two.

## Browser coverage

| Area | Reviewed |
| --- | --- |
| Public/authentication | Landing page, customer/vendor login modes, email/mobile/Google UI, signup UI, quick sign-in, logout and refresh after logout. No external OAuth account authorization or OTP delivery was performed. |
| Customer planning | Event list and dashboard, manual event form, event-type service choices, map dialog, requirements, catalogue categories, live catering prices, package detail and two-package comparison. |
| Customer commerce | Existing accepted quote, under-review booking, verified ₹6,000 advance, remaining ₹14,000, budget view and timeline. No new order, charge, refund or settlement was submitted. |
| Customer communication/account | Updates, document list, favorites, profile/edit form and booking-specific Event Circle navigation. No outgoing vendor message or contract was submitted. My Vendors' dependencies were checked through the API; its complete rendered state was not separately confirmed. |
| Customer Aura | Real API catalogue results, all-service expansion, manual event switch, correct switched event card, background card repricing and preservation of expanded results. Customer bottom navigation stayed visible while reviewing cards. |
| Vendor | Dashboard, enquiries, status filter and quote-builder defaults; services, portfolio, availability, calendar, quotes, bookings, payments, reviews, analytics and profile/location/settings tabs. Document/KYC tab navigation and its API reads were checked; no verification was submitted. |
| Vendor Aura | Live answer correctly reported three new enquiries from stored business data. |
| Admin | Dashboard, customer/vendor directories, events, bookings, payments, reports, coupons, users/access, audit, settings, automation and the new live Operations page. Notifications' initial UI and notification reader tests were checked; delivery was not triggered. |
| Staff authorization | Super admin, operations, finance and support API permissions, including expected 403 responses, identity-domain isolation, refresh and logout/revocation. |

Opening a page or checking an API is not a test of every possible write action. The regression tests additionally exercise mocked HTTP workflows without modifying real account permissions, leads, bookings or money.

## Fixes made during this web review

1. **Manual planning crash:** imported the missing `Icon` component in shared location fields. Reopened the manual form, event-type choices and map dialog successfully.
2. **Incorrect timeline milestones:** a draft being “started” no longer marks event-day execution as complete. Only recorded execution actions count. Manual event creation also counts as a built plan. Verified advances are labeled “Payments verified,” and decimal amounts are retained.
3. **Malformed quote history:** accepted direct vendor quotes with no item count no longer render “undefined services” or invent a 48-hour hold description.
4. **Incorrect working hours:** customer package details now support the capitalized weekday keys saved by Vendor OS. Missing hours show “Not provided,” rather than incorrectly claiming “Closed.” Rechecked the real detail page.
5. **Vendor enquiry display and workflow:** restored customer/event labels, removed the fabricated default 95% match, added a real status filter and persistent vendor-scoped decline API, and removed invented ₹48,000/₹2,000 quote defaults. Non-positive or invalid quote totals are rejected locally. Decline ownership, retries and non-actionable states are covered by an HTTP test using mocked models; no existing live lead was declined.
6. **Authentication races:** invalidated late refresh responses and stale unauthorized requests when the identity changes. Token clearing blocks further background refresh until another explicit sign-in. Customer/admin logout clears client state promptly and never refreshes a failed logout request. Development quick sign-in now includes cookies and a 20-second timeout. Customer, vendor and admin logout were verified in the browser and stayed signed out after refresh.
7. **Admin Operations placeholder:** replaced it with live worker state, queue counts, recent jobs, errors, refresh and status filtering from existing authorized Core APIs. Historical failed jobs are visible.
8. **Admin misleading controls/status:** expired, scheduled and exhausted coupon states are distinguished from enabled coupons. Removed the inert admin event-creation control and inert category/location filter buttons; existing search and status tabs remain. Report period labels are informational. Event row actions open the workspace, report actions export the summary and automation actions open Operations.
9. **Missing payment event handler:** registered `PAYMENT_CONFIRMED`. It reads the stored payment, rejects unverified or mismatched context, reuses an existing booking without adding an advance twice, and uses the existing booking confirmation service only when a booking is missing. Unit tests cover duplicate delivery, missing-booking recovery and invalid payment truth. No historical financial jobs were replayed.
10. **Aura copy/suggestions:** the vendor dashboard's Hindi self-reference uses the feminine form. An existing event's date question no longer shows unrelated new-event suggestions.

## Additional Aura operational review

Customer and vendor Aura now read an actor-scoped activity view from saved enquiries, quotes, contracts, payments and notifications. Visible workspaces poll after each completed read (normally about two seconds plus request time), with the existing write/scope fences and retry handling. This is polling while the workspace is visible, not guaranteed instant background push.

- Both web Aura workspaces show recent saved records and mark newly observed or changed rows. First load establishes a baseline. Event changes reset that baseline; poll timestamps alone do not create update markers.
- New turns include fresh activity context. Generic operational questions answer directly from saved data without model-generated statuses or requirement writes. Unsupported filtered questions continue through the full context path. Historical replies remain historical; current cards provide fresh status.
- Admin has no separate Aura interface. Admin contract/payment/execution/settlement changes feed customer/vendor snapshots through authoritative CoreBooking reads. Automated fixtures change those records and verify both subsequent snapshots update. No real payment or settlement was approved for this test.
- Customer snapshots enforce event ownership and exact event/quote links, including older opportunities linked through a contract. Customer cards exclude vendor payout status. Mirrored contracts are deduplicated by quote link. Records without reliable event links are not guessed from category.
- Financial reads no longer include a different event because a service category matches. Failed CoreBooking reads propagate errors; unavailable vendor financial/readiness context no longer becomes zero or inactive. Valid zero payable amounts remain zero.
- Vendor live-read errors are visible and retry automatically. Phone-sized web Aura keeps bottom navigation visible; selecting a bottom link closes the panel and navigates correctly.

Browser checks this pass: the customer booking-status answer matched saved contract BK-7628; vendor Aura returned exactly three new enquiries, matching its dashboard and activity count. Cards rendered in both workspaces. The vendor bottom Leads link opened enquiries and closed Aura. Admin dashboard/booking states were reviewed. All 47 authenticated section reads and 61 authentication/permission smoke checks passed again.

The existing customer fixture contains a verified legacy payment alongside a Core contract whose payment status remains pending. Aura displays these distinct saved records. This pass did not reconcile financial data or silently verify the Core contract. Business review is needed before treating this fixture as a consistent end-to-end payment scenario.

Evidence: `tmp/qa/web-review/aura-activity-customer.png` and `tmp/qa/web-review/aura-activity-vendor.png`. Automated coverage includes admin status/quote changes, unread notifications, actor/event isolation, duplicate suppression, stale-history replies, failed reads and UI change markers.

## Remaining before production sign-off

- **Vendor preference switches are unfinished.** `SettingsManager` currently keeps alert and marketplace preferences only in React state and displays a saved message. It does not persist them to the backend or govern notification delivery. These controls must be connected to actual delivery/marketplace behavior before they can be called working preferences.
- **Eleven historical dead-letter payment jobs remain.** Their recorded error is `NO_HANDLER_FOR_EVENT: PAYMENT_CONFIRMED`. The missing handler is now implemented, but historical replay requires reviewing each existing payment/booking outcome first. No charge, booking or settlement was replayed during this review.
- **Google OAuth and OTP delivery:** provider UI loaded, but an actual Google authorization and delivered email/SMS OTP were not completed.
- **Voice hardware path:** real ElevenLabs TTS/STT succeeded; live browser microphone capture, interruption/noise behavior and audible output still need a human audio test. Automated tests cover ElevenLabs-only playback, cancellation, microphone mute preserving Aura speech and stale playback suppression.
- **Checkout/provider verification:** existing stored payment states were reviewed; no fresh Razorpay checkout, charge, refund, KYC/bank verification or settlement was executed.
- **Performance:** the production build still reports a roughly 1.38 MB minified JavaScript bundle. Route splitting remains a performance improvement; the warning was not hidden.
- Customer notification/privacy preferences and the shop are already labeled unavailable/coming soon. They were not turned into completed features by this review.

## Evidence

Local, ignored QA artifacts:

- `tmp/qa/web-final-tests.log`
- `tmp/qa/web-final-smoke.json`
- `tmp/qa/web-section-api.json`
- `tmp/qa/web-final-build.log`
- `tmp/qa/web-voice-qa.log`
- `tmp/qa/web-review/` — browser snapshots and screenshots

The temporary draft guest-count change was restored. QA chat messages and ordinary event-edit history entries remain as test activity. No vendor catalogue reseeding, account permission changes, outgoing vendor messages, new payments or historical automation replay was performed.
