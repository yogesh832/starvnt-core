# Unified product workflows — implementation and verification

Implemented against the specification supplied on 24 October 2026. The earlier requirements audit describes the pre-change baseline. This document describes the implementation, contracts, checks and rollout boundaries.

## Implemented behavior

- Customer dashboard reads owned Core event, requirement, booking, payment, quote and history records. It displays lifecycle/countdown, real pending offers, confirmed bookings, recorded changes, planning readiness, financial health, reminders and feedback. It refreshes every 30 seconds and on focus/reconnection.
- Readiness counts confirmed or customer-arranged essential requirements divided by the event template's essentials. Aura-inferred requirements do not count. The UI celebrates a genuinely completed plan; booking, payment and execution retain separate states.
- Dashboard, budget screens and Aura use the shared Core financial summary. Pending/processing/paid-but-unverified payment rows are excluded from verified money. Linked customer/Core bookings are deduplicated; cancelled Core contracts and expired holds are excluded. Quotes remain estimates; active holds/confirmed contracts remain commitments.
- Aura service statements are labelled `aura_inferred`. Customers explicitly confirm suggestions through the plan confirmation or requirement-confirmation workflow. Tentative requirements remain inferred notes. Vendor Aura calendar writes use the same validated service as the calendar; quote submission uses the same eligibility checks as the API.
- Vendor Calendar supports full/partial days, multi-day and overnight intervals, business/service/resource scope, external customer commitments, editing and cancellation. Resource dependencies and setup buffers can be configured per service. Matching and discovery use the shared interval/capacity/resource/travel calculator.
- External commitments remain `EXTERNAL_COMMITMENT` and `REPORTED`. They do not create Core bookings, verify payments or gain verified status. Legacy operational slots remain reported records, visible in Vendor and Admin, with audited cancellation.
- Admin Availability & External Commitments reads the same records. It provides vendor/date/type/scope/resource/status/conflict filters, audit history and cancellation with a reason. Personal contact fields require `availability.personal.read` or Super Admin. Access to the personal view is audit-recorded before returning it.
- Profile completion, financial verification and activation review are separate. Vendors submit a ready profile; Admin can approve, reject, request information or suspend. Readiness reads do not save activation. New enquiries, offer submission, matching and booking confirmation require authoritative eligibility. Suspended/rejected governance states cannot be cleared by profile completion.
- Profile Status is integrated into the actual dashboard, with state-specific messages, requirements, review feedback and update timestamp. WhatsApp/call URLs use the shared `+919403891095` configuration. There is no fixed 24-hour activation promise.
- In-app and existing mobile push are supported. Preferences include notification types, push opt-out, IANA timezone and quiet hours. Push jobs check current preferences at delivery, retain delivery-attempt records, respect priority and throttle per device. Unsupported outbound channels do not claim delivery.
- Customers can create/cancel owned reminders. Workers claim reminders atomically, retry failures and deduplicate replay. Event reminders are tied to actual outstanding decisions and real expiring holds. Lifecycle notifications use stable domain/content keys rather than request timestamps.
- Admin Product outcomes reports real counts, rates and definitions. Satisfaction/usefulness are voluntary feedback. Empty samples are unavailable, never fabricated. Support metrics distinguish a browser open request from device-reported opening and never claim an answered call or delivered WhatsApp message.

## State ownership and schema

| Concern | Authority / representation |
| --- | --- |
| Activation | `VendorOrganization.activationReview` and embedded `activationHistory`; readiness is a read-only projection |
| Identity/bank verification | Existing financial/document verification records; KYC manual review does not grant activation |
| New blocks/external commitments | Existing `VendorBlockout` collection extended with type, status, reported verification, interval, timezone, scope, optional external details, revision and atomic history |
| Legacy commitments | Existing `VendorBookingSlot`; Admin reads a normalised union, with no copied competing business record |
| Bookings/payments | Existing customer commerce and Core contracts; quote approval alone cannot create a confirmed booking |
| Availability | `availability.service.js`, consuming blocks, legacy commitments, unexpired holds, confirmed customer bookings and Core bookings |
| Notification inbox | Existing customer/vendor notification collections and unique logical keys |
| Push transport | Existing `PushJob`/subscription infrastructure, extended with delivery policy, priority and attempt log |
| Preferences/reminders | `NotificationPreference` and `CustomerReminder` |
| Product observations/feedback | `ProductObservation` and `CustomerFeedback`; no customer phone/name is copied into observations |

Existing `REGISTERED`, `VERIFIED` and `ELIGIBLE` values are accepted by the stored legacy model. The UI consumes the authoritative readiness/review projection instead of inventing another eligibility flag. Ready profiles await submission/review; only an explicit activation approval can make them matchable.

Availability intervals use an inclusive start and exclusive end. Full-day end dates are inclusive in the form and converted to midnight after the final date. Overnight intervals save their actual final date. Existing date-only records are treated conservatively; confirmed contracts without precise times reserve the full event date. Explicit wall-clock times are converted using the supplied timezone; nonexistent or ambiguous DST times are rejected. Travel uses the existing distance/time estimation rules plus the configured service setup buffer.

## API contract

All customer/vendor routes use authenticated tenant ownership from the session; callers cannot select another vendor by passing a vendor ID.

| Route | Contract / permission |
| --- | --- |
| `GET /api/customer/events/:id/dashboard` | Owned real-data dashboard, shared financial truth and experience projection |
| `POST /api/customer/events/:id/requirements/:category/confirm` | Explicitly confirms a proposed requirement; closed events remain locked |
| `GET, PUT /api/customer/notification-preferences` | Customer's own delivery policy |
| `GET, PUT /api/vendor/notification-preferences` | Vendor's own delivery policy |
| `GET, POST /api/customer/reminders` | Owned reminders; creation requires event ID, title, future ISO `dueAt` and idempotency key |
| `DELETE /api/customer/reminders/:id` | Cancels pending owned reminder; already-dispatching reminders return a conflict |
| `POST /api/customer/feedback` | Owned EVENT or NOTIFICATION reference; integer score 1–5 |
| `GET /api/vendor/activation-status` | Read-only authoritative readiness, review feedback and current logical status |
| `POST /api/vendor/activation-review` | Idempotent submission of a complete, verified profile; cannot override rejection/suspension |
| `GET, POST /api/vendor/availability/blockouts` | Lists active records / creates validated block or reported external commitment |
| `PATCH /api/vendor/availability/blockouts/:id` | Full validated edit with current `revision` and idempotency key |
| `DELETE /api/vendor/availability/blockouts/:id` | Audited, idempotent cancellation, not deletion |
| `POST /api/vendor/availability/validateBlockout` | Optional preflight; mutations independently validate under the scheduling lock |
| `GET /api/vendor/availability/bookings` | Existing legacy commitment records |
| `POST /api/vendor/availability/bookings` | Compatibility route into the new validated commitment service; requires full external details and idempotency key |
| `DELETE /api/vendor/availability/bookings/:id` | Audited cancellation of owned legacy commitment |
| `PUT /api/vendor/services/:id/resources` | Owned service dependencies and setup buffer, with change history |
| `POST /api/vendor/support-actions` | Records reported link-opening outcome, not a connected call/message |
| `GET /api/admin/availability` | `vendors.read`; contact data additionally needs `availability.personal.read` |
| `POST /api/admin/availability/:id/cancel` | `vendors.update` plus reason; cannot cancel a Core booking through this route |
| `POST /api/admin/external-users/organizations/:id/activation` | `vendors.approve`; APPROVE/REJECT/REQUEST_INFORMATION/SUSPEND, reason and idempotency key |
| `GET /api/admin/reports/product-metrics` | `analytics.read` or `reports.read` |

Commitment payload: `date`, optional `endDate`, `allDay`, optional `startTime/endTime`, `timezone`, `recordType`, `scope`, optional `vendorService/resourceIds`, `reason`, and an idempotency key. External commitments additionally require customer name, international-format phone, event type and location; notes/reference and structured travel location are optional. Verification status and platform booking status cannot be supplied by the vendor.

## Concurrency, privacy and recovery

Schedule mutations, activation transitions, reservation acceptance and booking confirmation acquire the same per-vendor database lock. Multiple vendors in a customer quote are locked in a stable order. Busy requests return a retryable conflict. Locks are never automatically stolen from a paused/crashed owner; this prevents a resumed writer from committing after a second owner was admitted. Resource/service ownership is validated before writing. Edits enforce revision checks; retries with the same key/payload do not append duplicate history.

Creation/update/cancellation history is stored in the same document mutation as the business change. Personal details are not duplicated in operational snapshots. Activation history is similarly atomic with the authorised transition. Admin personal-data access fails closed if its audit record cannot be saved.

For a crashed schedule owner, stop all server/worker writers first. Run `node server/scripts/recover-schedule-lock.js` to inspect stale owners. Release only the reviewed lock using `--release --writers-stopped --vendor ID --token TOKEN --reason REASON --operator NAME`. The script checks the expected token/expiry, audit-records the recovery and does not delete business records. Reconcile the affected bookings/commitments before restarting writers. Do not clear active locks or automate this release while writers run.

Reminder workers use leases, bounded retry delays and unique logical notification keys. Push workers recheck ownership/permission/preferences, record provider attempts and reconcile tickets/receipts. Disabling `EVENT_REMINDERS_ENABLED` stops new reminder/deadline processing while retaining queued reminders and history. Existing push configuration still controls actual push transport.

## UX and acceptance journeys

1. Customer opens an event, sees actual context and pending actions, changes facts and refreshes/reopens the dashboard. The browser journey additionally confirms a proposed Aura requirement and verifies it stops appearing as unconfirmed.
2. A quote/booking/payment/message state produces a logical notification with the relevant event workflow. Replay is deduplicated. Quiet hours defer push before any provider call; disabling quiet hours lets the same job proceed. Unsupported channels never report successful external delivery.
3. Vendor creates/edits/cancels a scoped interval. The save validates holds/bookings/resources; matching reads that same state. Concurrent overlapping requests cannot both commit. Unrelated declared service resources remain available.
4. Vendor records external customer details. Admin sees the same reported record; an Admin without the personal-data permission receives no customer name/phone/notes. Legacy commitments remain reported. Neither path produces a platform booking.
5. Vendor submits a ready profile. Admin approves through the separate activation action; Vendor status reads reflect that change. Repeated approval is idempotent. Suspension remains effective after readiness reads and locks new enquiry/offer access. Support links use the shared configured contact.

## Verification and evidence

The executable database/API journeys live in `server/test/unified-product.test.js`, using disposable MongoDB databases and authenticated fixture identities. They cover approval versus verification, suspended/rejected states, idempotency, concurrency, all partial/overnight blocks, resource scope/capacity, protected external contact details, legacy records, inferred requirements, financial deduplication, notification quiet hours and reminder retries.

`server/scripts/preview-unified.js` starts an isolated loopback-only preview with disposable data and fixture sessions. It reads no real environment file or external service keys. `server/scripts/check-unified-ui.mjs` runs an isolated headless browser profile against that preview, creates a record through the UI, verifies Vendor-to-Admin visibility, confirms an Aura suggestion, checks support URLs and tests 390px/desktop layouts. Screenshots and its JSON report are written to `tmp/unified-acceptance`.

Validation on 24 October 2026: server 32/32 tests passed, web 24/24 passed, mobile TypeScript check passed and mobile 99/99 tests passed. The web production build completed (Vite reports the existing large JavaScript bundle warning). The isolated browser run passed all eight checks: profile/support status, mobile calendar layout, creating a commitment, Admin visibility, product metrics, explicit customer confirmation, mobile dashboard layout and zero browser runtime exceptions. Its report and screenshots are in [`tmp/unified-acceptance`](../tmp/unified-acceptance/report.json) (generated QA artifacts).

A successful build alone is not treated as integration evidence. The browser run does not verify physical-device dialler/WhatsApp behavior or live push provider delivery.

## Rollout and practical boundaries

- This work changes local code. Production has not been deployed and real customer/vendor records have not been migrated or approved.
- Existing ACTIVE vendors without an explicit activation review are intentionally not grandfathered into eligibility. Inventory them with `node server/scripts/prepare-unified.js`; arrange authorised review before opening customer matching traffic after deployment.
- Prepare additive unique indexes with `node server/scripts/prepare-unified.js --apply-indexes` in the target environment before accepting writes. No automatic approval or destructive data migration is performed. Preserve database backups and deploy backend/web/mobile contracts together; older clients that omit required idempotency/external-detail fields will receive validation errors.
- Deploy first in staging, run the acceptance suite and review the legacy-record inventory. Keep customer matching/booking traffic closed during the activation cutover until required vendor reviews are complete. Monitor lock conflicts, worker health, retries, audit writes and outcome metrics before opening further traffic.
- Roll back application traffic/reminder processing first. Keep new records, audit history, idempotency keys and indexes; do not truncate them. Older code must not resume unsafe writes into the extended collections without reconciliation. Use the lock recovery procedure only with writers stopped.
- Recurrence is a separate extension, as permitted by specification §8; the existing architecture has no recurring availability rule engine. Explicit single/multi-day intervals are implemented.
- Supported automatic delivery remains in-app plus the existing configured push provider. SMS/email/automated WhatsApp transport is not represented as supported delivery. WhatsApp here is the requested user-operated support conversation link.
- Browser URL checks and simulated push-provider tests do not prove physical-device dialler/WhatsApp behavior or live provider delivery. Android/iOS device QA and staged provider delivery checks remain release gates. No support message or call was placed during verification.
