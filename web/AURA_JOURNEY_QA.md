# Aura customer → vendor browser review — 20 October 2026

## Revised event-day policy

The user clarified that Sundays are normal event-service days. Removed weekly office-hours closure as an enquiry availability restriction. Aura's generated guidance also explicitly follows this rule, including when older chat mentions a Sunday exception. Actual dated calendar blockouts still produce a calendar warning; an enquiry still does not confirm availability or a booking. Bank/KYC requirements remain unchanged. Regression coverage checks English, Hindi and Hinglish plus actual blockouts.

The earlier Sunday-exception messages below describe historical testing, not the current policy.

## Follow-up fixes requested after the review

Rechecked the earlier fixes, then corrected the remaining enquiry-answer gaps. Vendor Aura now joins quotes and bookings to the exact owned enquiry rather than treating recent/global business totals as that enquiry's result. It reports unknown when a scoped result is unavailable, rejects unmatched named-customer requests instead of showing another customer's enquiries, and handles invalid dates without crashing. Calendar blockouts and closed working days are surfaced with a working calendar action. Incomplete activation now lists the actual missing requirements and links to business setup.

Browser verification showed the saved birthday timing and Sunday conflict, **0 quotes / 0 bookings for this enquiry**, and the real pending requirements: PAN/GST/KYC identity verification and bank account verification. The setup action opened Vendor Profile & Business Hub, and Documents & KYC opened the verification workflow. No fields, documents, availability settings or verification flags were changed. The enquiry remains pending the vendor's Sunday exception decision.

Validation: 120 server tests and 22 web tests passed. Logs: `../tmp/qa/aura-fix-followup-server.log`, `../tmp/qa/aura-fix-followup-web.log`. Screenshot: `../tmp/qa/web-review/aura-fixes-profile-guidance.png`.

Ran the real Vite web app at localhost:5173 with its local API. The in-app browser was visible during the customer and vendor journeys. Used the existing One-Click Auth accounts; did not reseed or reset accounts.

## Journey and saved result

Started as Ananya (`customer@starvnt.com`) with **“mujhe ek event krwana h”**, then described a brother's birthday in natural Roman Hindi: 15 November 2026, Kapkote, 50 guests, ₹30,000 budget, home venue, catering/decor handled by the customer, photography/video needed. Answered the area question and marked cake as self-arranged. Confirmed the event plan through the on-screen action.

- Event: `6ad7823a756f87b7f2de1f30` — My birthday, planning.
- Selected the ₹18,000 Birthday Party Candid & 4K Reel Package from Kumaon Candid & Birthday Reel Stories (`photo2@starvnt.com`, present in One-Click Auth).
- Enquiry: `6ad785df19949ed1a6f8af88` — **NEW**, exactly one enquiry for the test event.
- Verified the vendor dashboard received the enquiry and Aura's activity card reported one new enquiry.
- Asked vendor Aura for the actual customer, date, guests, place, brief and availability. The final answer included the amended original wording: candid photography and a short video, at home, **shaam 6 se 9 baje**.
- The date is a Sunday and this vendor's saved Sunday hours are closed. Asked the user which business step to take. They selected **keep pending and ask the vendor to confirm a Sunday exception**.
- Sent that customer question in the actual enquiry chat, and verified the exact message on the vendor side. Thread: `6ad7885f4171c3a473aca696`. The vendor notification counter increased from one to two; opening the message marked its notification read while the enquiry remained NEW.
- Final database read: **1 enquiry, 0 quotes, 0 bookings, 0 payments**. No vendor availability exception was approved, no vendor reply was sent, and no quote/contract/payment was created.

## Bugs found and fixed during the journey

1. Empty model extraction lost the event type, causing Aura to ask for the event type again after a full requirement. Added conservative literal event-type extraction and catalogue-backed lowercase city handling for planning statements.
2. Self-arranged catering/decor were still recommended. Added multi-service self-arranged extraction and filtering, preserving the explicitly requested service.
3. A four-word Roman Hindi area answer switched the language to English. Language continuity now survives factual fragments; explicit English requests still switch language.
4. Each Gemini fallback could restart a full timeout. Added one overall model budget. Literal planning facts now continue without waiting for generation; complex questions still use the model. The browser allows time for context and writes, uses a friendly timeout message and reconciles a late saved reply without leaving a duplicate draft/error.
5. “Enquiry bhejni hai” was mistaken for reading old enquiries. Corrected Roman Hindi action routing and added actionable enquiry guidance. The real service selection control is labelled **Select & enquire**, making its existing enquiry side effect clear.
6. Named package searches could broaden to unrelated services when the requested package disappeared from the current catalogue. They now return no current match instead of unrelated cards. Package matching also narrows a vendor's multiple packages.
7. Customer operational snapshots omitted sent enquiries until a quote existed. They now expose only enquiries owned by that customer and exact event; enquiry/quote questions explicitly state when no vendor quote has arrived.
8. Detailed vendor enquiry questions returned only a title/status. Added read-only analysis from this vendor's saved scoped context, including date, guests, place, original brief, working-hours conflict and commercial counts.
9. Service timing could be lost between chat and enquiry. Explicit service wording is saved in preferences and synced to the same unanswered NEW/VIEWED enquiry. This does not change answered quotes, contracts or prices.
10. Vendor leads displayed “Eligible slot verified” without verification. Replaced unsupported availability, coverage and free-travel claims with recorded/confirmation wording.

Original failed replies remain in the test conversation as evidence; they were not erased. Some requirements were repeated during regression testing after fixes.

## Checks and limitations

The full server suite passed 117 tests; the web suite passed 22 tests; the web production build passed with its existing bundle-size advisory. Final focused enquiry-analysis tests also passed after the last display refinement. Logs: `../tmp/qa/aura-journey-server-tests.log`, `aura-journey-web-tests.log`, `aura-journey-web-build.log`. The scoped final state is in `../tmp/qa/aura-journey-state.json`.

The live provider probe returned a valid extraction in about 18 seconds. This was a text browser review, not an audible voice or native-mobile test. Complex model responses remain subject to provider latency; no model/account credentials were changed.

The chosen test vendor's dashboard reports incomplete profile readiness; the package later left the live commercially-active catalogue. Existing enquiry/message records stayed available. No manual activation or verification override was applied. The vendor must resolve readiness and confirm actual date/time availability before this can be treated as a bookable production arrangement. A Sunday exception is not required under the revised policy.

Evidence in `../tmp/qa/web-review/`: `aura-journey-enquiry-sent.png`, `aura-journey-sunday-request.png`, `aura-journey-vendor-message.png`, `aura-journey-vendor-analysis.png`, and `aura-journey-vendor-final.png`.

The separate native UI transfer was interrupted for this web test and remains partly implemented; this report does not mark it complete.
