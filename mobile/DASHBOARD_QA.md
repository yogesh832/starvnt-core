# Customer, vendor and Core dashboard QA

The 2026-10-18 dashboard pass tests application functionality independently of physical-device/provider setup. Brand assets and colors continue to come from the web app.

## Changes covered

- Customer home attention items open the relevant event, quote or booking/payment workspace. Vendor offers are filtered by an owned event on the server; each offer has its own negotiation draft, history, expiry and payment state. Accepting an offer opens its reservation/payment destination.
- Vendor home shows live enquiries, quote pipeline, upcoming deliveries, readiness blockers and receivables. Quotes have detail/history, draft submission, revision and contextual messaging. Business profiles support brand name, photo changes/removal, listing search/link/unlink and hub fields. Booking completion notes support reviewed Aura drafts.
- Core home shows permitted totals, attention queues, recent bookings/events and audit activity. Event detail displays actual requirements, selected vendors, notes/history and linked Core bookings. Event-only staff receive no booking records from this endpoint. Counts are displayed as counts rather than currency.
- Event references are persisted on enquiries and Core bookings. Customer booking views use event links or exact legacy booking identifiers, rather than matching every booking belonging to the customer or merging services by category. Unrelated events cannot share booking/evidence rows.
- Quote detail and transitions enforce ownership. Vendors cannot approve their own proposals. Accepting a quote does not mark its advance paid; unpaid/cancelled bookings cannot start or submit completion. Payment-provider verification remains separate.
- Editing coupons with persisted null optional limits works; explicit invalid zero/negative limits still fail.

## Automated verification

- Strict TypeScript and 50 mobile tests passed.
- 52 backend tests passed, including coupon and execution-state regressions.
- 134 real HTTP dashboard/workflow checks passed through the same native API client used by the app. Report: `tmp/qa/mobile-dashboard-report.json`.
- Production bundle export results are recorded in PARITY.md.

The HTTP checks cover customer/vendor/Core read workspaces; operations, finance and support permissions; cross-domain/role denial; customer event creation/editing, service edits and Circle messages; vendor service/blockout/document CRUD; proposal detail/submission/revision/negotiation and tenant denial; event-scoped offers/bookings; reservation handoff; evidence submission/review; completion verification; maker/checker settlement approval/execution/replay denial; coupons; and staff creation/access edits/disable/logout.

The completion/settlement scenario uses a clearly labelled paid-booking fixture in the QA database. It tests dashboard state and approval/ledger behavior. It does not simulate a bank transfer as a real payment or make a payment-provider call. Aura generation, Google Places, media-provider upload and tax/bank verification remain provider-dependent actions; no real provider requests were sent for these tests.

These are HTTP workflow tests and compilation checks, not automated screen-tap or screenshot coverage. Physical-device testing is tracked separately, as requested.

## Re-run locally

Use a supported Node version (22.13+ on the Node 22 line) and the dedicated QA configuration:

```sh
npm run check:qa-env
npm run dev:qa
# In another terminal:
npm run test:dashboards -w mobile
npm run check:mobile
npm test -w server -- --test-concurrency=1
```

The dashboard test refuses database names other than `starvnt_test_external` and `starvnt_test_admin`, and requires local port 4100. It creates labelled QA data and development personas in those databases, logs out every test session, and retains the test rows for inspection. It does not use the development/production databases or reset/delete a database. Keep `server/.env.test.local` private.

Older rows that never saved an event link are not assigned to an event by guesswork. Exact legacy booking links remain supported. Ambiguous historical rows need an explicit data repair using known relationships before they can appear inside a specific event.
