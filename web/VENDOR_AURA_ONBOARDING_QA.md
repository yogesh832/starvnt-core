# Vendor Aura onboarding review — 20 October 2026

Test account: `vendor-onboarding-test@starvnt.com`, available through **1-Click fresh vendor** on `/auth-test`. First sign-in creates a blank profile; later sign-ins preserve progress. Business used for the scenario: Pahadi Utsav Decor, Kapkote (test data). No real KYC/bank documents or verification flags were supplied.

## Observations so far

| Priority | Observed issue | Reproduction / improvement |
|---|---|---|
| High | Fresh vendor started at 17% due to default working hours | Corrected blank test creation to omit working hours explicitly. Verified 0% in the browser and database before testing. |
| High | Repeated provider timeouts prevent ordinary onboarding | Natural brand/city answer saved category only; even labelled brand/city was lost on retries. A direct live probe succeeded in 24.2 seconds, exceeding the 20-second server budget. Increased vendor default to 40 seconds and browser deadline to 55 seconds. Retry then saved the actual brand/city. Provider latency remains an issue. |
| High | Natural equipment/capacity answer is misclassified | `Ek time pe ek hi event kar paate hain` became equipment. A plain-language correction polluted equipment again. Keep capacity separate and validate extracted equipment against item clauses. |
| Medium | Confirmation with the same amount does not confirm | `haan 8500 mein save kar do` proposes the same service again. Plain `haan` succeeds. Safely recognize a matching amount while treating a changed amount as a revised proposal. |
| Medium | Conversation switches to English | Initial Roman Hindi reply was good, but server-generated save/next-step/confirmation text switches to English even after explicit Roman Hindi preference. Localize server-composed messages too. |
| High | Inconsistent setup progress and activation claims | Dashboard has six steps including KYC; Aura shows five, and its step list omits operating availability. Backend counts six operational steps with availability and treats KYC separately. Use one checklist and do not promise matching from profile percentage alone. |
| Medium | Save confirmation promise is inaccurate | Footer says saves only after confirmation, but brand/category/city save immediately. Make the behavior and copy agree. |
| Medium | Raw network error during confirmation | No service had been written; scoped database read checked before retry. Display a useful retry status and reconcile saved state before users retry a write. |

## Things that worked

- Aura's initial greeting used Roman Hindi and feminine first-person wording.
- Brand and city were saved correctly after the timeout adjustment; profile moved from 0% to 17%.
- First service proposal showed ₹8,000 and waited for confirmation.
- `8000 nahi 8500` correctly replaced the proposal price before saving.
- Plain `haan` saved one service at ₹8,500 and advanced progress to 33%, then asked about team/equipment.

## Evidence and validation

Browser transcript snapshots: `../tmp/qa/vendor-onboarding-browser-notes.json`. Read-only scoped database inspection: `../tmp/qa/vendor-onboarding-read.mjs`, output `../tmp/qa/vendor-onboarding-state.json`. Initial zero-percent screenshot: `../tmp/qa/web-review/vendor-onboarding-zero.png`.

120 server tests passed after the timeout and blank-test-account changes. Web production build passed with its existing bundle-size advisory. These checks do not establish that the conversational issues listed above are fixed.
