# Four-vendor / one-customer end-to-end QA — 21 October 2026

**Status: IN PROGRESS. Account creation, operational onboarding, four event plans, authentication, isolation and verification gates tested. Customer-to-vendor enquiries, quotations, reservations, payment and execution are NOT yet tested for these new accounts.**

The pending user question asks whether clearly labelled synthetic identity/bank verification fixtures may be used in the isolated QA databases to continue. No verification override or payment bypass was applied. No real payment was attempted.

## Environment and identities

- Browser: actual Vite web application at http://localhost:5174; QA API at http://localhost:4100.
- Databases: explicitly configured starvnt_test_external and starvnt_test_admin. Normal development and production data were not reset or seeded.
- The existing locally configured Gemini key was reused in the QA server process for text Aura calls. No key was copied into source, reports or browser code.
- Customer: QA Aditi Rawat, qa-e2e-1792583572601.customer@example.test, ID 6ad8a7959b6b12785d7b4b17.
- Accounts were created through the real public registration API (201), not by inserting users into MongoDB. Browser signup forms were inspected; inbox OTP delivery and third-party Google/mobile OTP flows were not exercised. A developer-only specific-account form supports repeatable UI sign-in for these accounts.
- Vendor setup used real profile/service/capability/location/coverage/availability/portfolio APIs and Aura service proposals/confirmations. Most repeated setup writes were API-driven; browser checks do not claim every field was typed through the UI.
- Showcase content is explicitly labelled synthetic QA material and references an existing local image. No real KYC, bank account or client portfolio was supplied.

## Four distinct journeys

| Event | Date | Guests / budget | New vendor | Test sign-in |
|---|---|---|---|---|
| QA Birthday — Photography | 2026-11-15 | 50 / INR 50000 | QA Pahadi Photography (Photography) | qa-e2e-1792583572601.photo@example.test |
| QA Wedding — Catering | 2026-11-22 | 120 / INR 120000 | QA Kumaon Catering (Catering) | qa-e2e-1792583572601.catering@example.test |
| QA Corporate — Decoration | 2026-11-29 | 80 / INR 75000 | QA Himalayan Decor (Decor & Styling) | qa-e2e-1792583572601.decor@example.test |
| QA Anniversary — DJ | 2026-12-06 | 40 / INR 40000 | QA Valley DJ (DJ & Music) | qa-e2e-1792583572601.music@example.test |

- QA Birthday — Photography: event ID 6ad8aa133ff50c8178a173a2; intended service ID 6ad8a9c43ff50c8178a17243.
- QA Wedding — Catering: event ID 6ad8aa533ff50c8178a17536; intended service ID 6ad8a9923ff50c8178a16f4e.
- QA Corporate — Decoration: event ID 6ad8aa563ff50c8178a175be; intended service ID 6ad8a99c3ff50c8178a16f96.
- QA Anniversary — DJ: event ID 6ad8aa5b3ff50c8178a17653; intended service ID 6ad8a99e3ff50c8178a16fb7.

Each vendor has all six operational steps complete (100%) and remains commercially inactive because identity and bank verification are pending. Attempts to select each unverified service correctly return 400 OPTION_UNAVAILABLE. Each vendor still has 0 enquiries, 0 quotes and 0 bookings; these are intentional verification-gate results, not a successful commerce journey.

## Bugs reproduced and fixed

1. **Language mistaken for location:** “Roman Hindi mein baat karo” produced city “Roman” in all four original briefs. The fallback parser now excludes language instructions, recognises a stated city/state address, and does not treat a short language preference as a city answer. Unit and live unconfirmed-draft checks verify Kapkote and language-only stability.
2. **Self-arranged comma lists lost:** “venue, catering, decoration aur cake maine khud arrange kar liye hain” retained only venue. The parser now carries an explicit arrangement statement across adjacent category-list fragments, without swallowing an explicit need, denial or question. Replayed all four briefs and verified every stated provided category through the API and rendered event detail.
3. **Viewing finance falsely verified identity:** GET financial created default gst.isRegistered=false; activation treated that flag as verified identity. Merely opening the financial page changed identityVerified false → true. A shared verification helper now accepts actual verified PAN/GST or an approved document; opting out of GST is not identity proof. All four fresh vendors remain identity-unverified after financial-page reads.
4. **Contradictory onboarding readiness:** Aura counted five steps, the dashboard counted KYC inside six, and either identity OR bank verification could show the combined verification tile as done. Shared operational-step metadata now counts six, includes availability and capacity/resources, and keeps identity plus bank verification separate. Browser confirmed 6/6 profile steps and KYC pending, with a direct verification action.

The four main events had already been explicitly confirmed before the location bug was found. Confirmed facts correctly refuse silent Aura changes. Their test-only city was corrected through the ordinary authenticated manual Edit API, then rechecked. The fixed draft write path was separately tested using a disposable regression draft and the real draft-delete API; only the four requested events remain.

## Verification

- Server suite: 143 passed, 0 failed.
- Web suite: 22 passed, 0 failed.
- Production web build passed; existing bundle-size advisory remains.
- Five real accounts: password login, role-preserving refresh, access-token revocation on logout, and inability to restore a revoked session passed.
- Vendor/customer dashboard isolation and cross-vendor service-edit denial passed for all four mapped journeys.
- All four final event facts and self-arranged requirements passed live API checks and were reviewed in the browser.
- Customer event list contains exactly four distinct events after temporary draft cleanup.
- Raw reports retain original failures and subsequent retests. Initial helper assertions were corrected to use activation.status and the refresh endpoint’s documented 200/ok:false invalid-session response; those assertion mismatches were not product bugs.

## Evidence and remaining work

Local evidence folder: tmp/qa/four-vendor-run/. report.json omits account passwords/tokens; private-state.json stays ignored and is only for resuming this local run.

- Browser screenshots: screenshots/customer-four-events.png, customer-birthday-plan.png, customer-wedding-plan.png, customer-corporate-plan.png, customer-anniversary-plan.png, and vendor readiness screenshots.
- Logs: tmp/qa/four-vendor-recheck-final.log, four-vendor-auth-recheck-final.log, four-vendor-server-tests-final.log, four-vendor-web-tests.log, four-vendor-web-build.log.

After the verification-fixture choice: activate only the four named synthetic QA vendors, connect one selected vendor to each event, verify all enquiry notifications/messages, send and revise quotes, inspect customer acceptance/reservation and duplicate protection, then check payment/booking/execution using an explicitly supported test path. Do not call signup-only or verification-gate coverage a completed end-to-end commerce test.

This run is web/text/API testing. It does not establish native device, audible ElevenLabs, physical push, bank-provider, KYC-provider or real payment delivery.
