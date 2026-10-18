# Web-to-native comparison

Reviewed against the checked-out web routes and backend contracts on 2026-10-18. A mapped route means native UI and API wiring exist; it does not certify every interaction or physical-device behavior. The web and mobile apps share the existing backend and web brand assets/tokens.

## Customer

| Web route / interaction | Native destination | Current boundary |
| --- | --- | --- |
| Home, events, manual plan, event workspace | Home, Events, NewEvent, Event | Implemented; actual sign-in and saved-data device QA pending |
| Requirements and draft edits | EventSection, EditEvent | Service schemas and location text/coordinates preserved; interactive map/pin picking pending |
| Service discovery | EventSection → services | Recommended/budget/premium sorting, match explanation, availability, selection and demo labels |
| Service details | Service | Pricing/cancellation, capabilities, resources, portfolio and reviews; media launches require device QA |
| Comparison | Compare | Up to three options, horizontal comparison, selection/removal and Aura question draft |
| Quotes, bookings, payments | EventSection, VendorOffers, Checkout | Existing acceptance, negotiation, holds, coupons and reconciliation; real payment/provider E2E pending |
| Completion approval | CustomerBooking | Fresh booking/evidence review, notes and explicit acknowledgement; server enforces customer ownership and Core linkage |
| My vendors | EventSection → vendors | Booked and selected-but-unbooked vendors, booking conversations and quote navigation |
| Event Circle | Circle → Chat | Whole-event, requirement and booking contexts; text, attachments and quote-review navigation |
| Budget | EventSection → financial-truth | Target/range, committed/estimated costs, missing estimates, payment truth and Aura draft |
| Event day, history | EventSection | Actual backend timeline/status; fabricated web placeholder data is not reproduced |
| Aura | Chat, AuraHistory | Saved-plan review/edit/confirm, structured answer values, session restore; voice and interactive location selection pending |
| Updates, documents, favorites, settings, account | Updates, Library, Favorites, Profile, NotificationSettings | Implemented; native sharing/providers, permission and session lifecycle QA pending |

## Vendor

| Web route / interaction | Native destination | Current boundary |
| --- | --- | --- |
| Dashboard | VendorHome | Live badges, readiness blockers, enquiry/quote pipeline, upcoming bookings and payment follow-ups |
| Enquiries, quotes | VendorModule, VendorForm | Detail/history, draft submission, pipeline filtering, context conversations, full pricing/revisions and editable Aura proposals |
| Bookings | VendorBooking | Start, evidence uploads/checklists and submission; Core retains verification/settlement authority |
| Calendar, availability | VendorCalendar, VendorSetup | Slots, resources, full/partial-day blockouts |
| Updates, messages | Updates, Chat | Scoped threads, attachments and reviewed Aura drafts |
| Portfolio | VendorPortfolio | Projects/media, review/published states, edit/delete |
| Services, profile | VendorSetup, Profile | Pricing/capabilities/coverage/locations/resources/hours/travel; business photo and Google/map listing search/link/unlink are implemented |
| Payments | VendorPayments | Receivables, due dates, aging, overdue bookings and settlement states from actual backend fields |
| Reviews | VendorReviews | STARVNT/Google sources, distribution, reply editing and contextual Aura drafts; Google public text normalized |
| Analytics | VendorAnalytics | Counts and booking-derived amounts; no invented charts |
| Documents | VendorModule → documents, VendorFinancial | Upload, file link, review details, removal, PAN/GST/bank verification |
| Settings | Profile, NotificationSettings | Native preferences and account controls; device QA pending |
| Aura | Chat, AuraHistory | History, confirmation and supported action destinations; contextual booking-note drafting implemented; native voice pending |

## Admin / Core

| Web area | Native destination | Current boundary |
| --- | --- | --- |
| Dashboard and notifications | AdminHome, AdminNotifications | Permission-filtered real sources; inbox read state currently memory-only |
| Customers and vendors | AdminModule, AdminEntity | Edits, restrictions, soft deactivation and permission checks |
| Events | AdminModule | Actual requirements, selected vendors, history and linked bookings with separate booking-read permission |
| Bookings and operations | AdminModule, AdminBooking | Filters, evidence/finance review and server-authorized actions |
| Payments and approvals | AdminModule, AdminActions | Request/approve/execute flow, maker separation and retained approval payload |
| Reports and automation | AdminModule | CSV sharing, worker/queue health, cursor/filter support and retries |
| Coupons, staff, audit, settings | AdminModule, AdminForm | Server permissions, advanced coupon fields, staff roles and audit pagination |

Admin MFA sign-in exists. Enrollment is an additional enhancement, rather than a completed web parity requirement: no web enrollment UI was identified in this comparison.

## Release and verification gates

- Native Google auth requires a development/production build. Android EAS signing and public client configuration are recorded; iOS OAuth configuration and successful device sign-ins remain pending.
- Push registration/queue/tap handling exist. Firebase FCM V1, APNs and physical-device background/terminated delivery remain pending. See [PUSH.md](PUSH.md).
- General universal/app links and native voice remain pending.
- A route mapping is not full feature parity. Remaining interaction audits include provider-backed actions and signed-in layouts/accessibility for all roles.
- Existing backend test/mock Google-token handling needs a production security review before public release; a public OAuth client ID alone does not resolve it.
- Tests and exports are recorded in [PARITY.md](PARITY.md). No production transactions, notification deliveries or provider calls are implied by passing them.
