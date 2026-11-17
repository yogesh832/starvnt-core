# Booking execution, cases and finance operations

Prepared 12 November 2026. This describes the development implementation, not permission to deploy or move live money.

## Authority and policy preparation

Use Vendor **Service execution** and Admin **Service review** on web, or the booking action workspace on mobile. Both call the same Core commands. Never edit booking status in MongoDB to simulate completion or a financial outcome.

Finance-policy authors prepare a category revision in the existing policy workspace. A different authorized approver approves it. Configure the actual service checklist, milestone identifiers, evidence, check-in, acknowledgement, correction and reopening requirements. Photography coverage/deliverables, catering delivery and decoration dismantling are examples from the source PDFs; this release does not approve business defaults for them. Manual finance and partial outcomes require explicit approved flags. Settlement conditions and delay remain policy controlled.

New quotes and reservations freeze their confirmed commercial version and approved policy. Older offers without a confirmed snapshot must be revised and reviewed by the customer. For a legacy unverified booking, operations may attach an approved completion-only policy using the recorded command; this does not replace its agreed financial terms. A verified/financially executed record cannot have its policy silently rewritten. Legacy records missing agreed terms or private evidence require an operations-led migration decision; they remain readable and do not gain automatic payout eligibility.

## Execution and protection

1. Confirm the service contract and required verified payment. The old payment-match action only matches an existing verified customer receipt in the correct reservation/event; typing a reference cannot manufacture payment verification.
2. Vendor records check-in, actual service start and required milestones. Permitted corrections retain the previous detail, author, timestamp and reason.
3. Upload completion files with purpose `COMPLETION_EVIDENCE`; attach their asset IDs and complete the approved checklist. Submission is a claim awaiting review. Customer acknowledgement is a separate command and applies to that evidence revision.
4. An operations reviewer reads the private evidence and records Core validation or a request for further evidence. Open cases remain held. Completion does not transfer money.
5. Issues have their own stable identities. Customer/Vendor evidence uses `CASE_EVIDENCE`. Assign an active operations reviewer, collect the vendor response, record a proposal, then record its matching decision. Financial remedies require explicit amounts. Reopening requires approved policy. Resolving one case cannot release another case's hold; manual wallet freezes remain in force.
6. For vendor failure, preserve the original contract and original requirement snapshot. Missing original time/duration/capacity/location requires clarification. Alternatives exclude the failed vendor and respect known capacity/deliverables/availability. Only the customer chooses a replacement; it needs a new confirmed quote and normal verified payment. Funds are not silently reassigned.
7. Event closure checks Core services and unresolved protection remedies. A legacy customer projection saying “completed” cannot close an unverified real event. Unknown closure/remedy policy remains a review dependency.

## Manual finance

1. An authorized finance maker requests a refund/payout, amount and reason. Core checks verified collections, earlier outcomes, pending reservations, policy limits, case payout caps, completion, delays and holds as applicable.
2. A different authorized checker approves the request. Approval is permission to proceed; it is not evidence of payment.
3. Carry out the separately authorized bank operation outside this software. Upload debit advice/transfer proof privately with `FINANCE_EVIDENCE`, then record the exact reference. The operation becomes `PROCESSING`. A typed reference alone cannot reach `CONFIRMED`.
4. A reviewer other than both the requester and transfer recorder matches an independent bank statement, the same reference and private reconciliation evidence. `RECONCILE` confirms an actual movement and posts one ledger entry. Two staff identities suffice only when the approver is also the independent reconciler and did not request or record the transfer.
5. `FAIL` before execution marks a request failed. After a recorded attempt, it means `UNDER_REVIEW` and reserves the money. `RECONCILE_FAILED` requires independent bank evidence of no movement before releasing the reservation. Never release a reservation merely because an operator did not receive a response.

Bank references are claimed permanently using the existing unique IdempotencyKey collection (`BANK_TRANSFER_REFERENCE`, `expiresAt:null`). One reference cannot be assigned to two operations/bookings. If a crash occurred after claiming the reference, recover the same operation identity instead of creating another one. Confirmed amounts include existing ledger entries plus new operations without counting their own ledger entries twice. Partial transfers remain partial; a full refund or completed payable requires the corresponding confirmed total. A case opened after execution remains held while bank reconciliation truthfully records money that already moved.

## Razorpay refunds

Provider execution is disabled unless `FINANCE_PROVIDER_EXECUTION_ENABLED=true`. Keep it disabled through development and deployment review. Enabling it for live credentials requires the user's separate release instruction. No payout-provider capability is claimed: settlements use the approved manual process.

After maker/checker approval, `PROCESS_PROVIDER` persists a processing intent and a one-attempt marker before the request. Its stable receipt is `sv-<operation UUID>`. A timeout or crash must never trigger a blind second refund. The worker and `RECONCILE_PROVIDER` discover the receipt through the existing provider's payment-refund API and verify payment ID, currency, amount and current status. A missing refund stays pending review; it is not proof of failure.

The existing raw-body HMAC gate handles `refund.created`, `refund.processed` and `refund.failed`; callbacks initiate REST reconciliation and do not override newer confirmed results. Configure the signed webhook secret and provider-side subscriptions in the selected environment. See [Razorpay's refund webhook specification](https://github.com/razorpay/markdown-docs/blob/master/webhooks/refunds.md). Refund creation and read reconciliation are tested with a simulated provider, not a live transfer.

## Recovery and observability

The Core document saves its version, receipt and audit/outbox intent with the state transition. The booking-reconciliation worker retries ledger posting, customer projection, wallet state, audit and outbox publication. Failure of one booking does not skip all subsequent bookings. The outbox delivers meaningful service/case/refund updates with stable notification identities; internal policy/maker-checker actions do not create customer notifications. Existing completion-based feedback remains behind its release flag.

Monitor booking-reconciliation worker health, outbox retries/dead letters, pending intents, processing refunds and overdue staff follow-ups. An API response may contain an authoritative reconciled outcome before its recoverable ledger/outbox side effect completes; investigate pending intents instead of repeating the transfer.

Read-only inventory: `node server/scripts/audit-booking-workflow.js` after explicitly selecting the intended database environment. It prints IDs/reasons and counts, not contact details or secrets. It does not migrate records or start workers.

The existing durable schedule lease intentionally does not steal a crashed writer's lock automatically. Before any manual lock recovery, stop **all** writers/workers on both product lines, verify no owner can resume, back up both databases and inspect the affected lease and operation. Preserve receipts and finance evidence. Recover only the specific stale owner under the existing scheduling runbook; restarting blindly can leave work blocked. Never delete all idempotency keys, finance ledger entries, provider markers or workflow events to unblock a request.

## Publication and CRM

Completion/case/finance files stay private and cannot become Live/Memory assets. Event uploads require rights, privacy and safety review; only published and currently authorized assets are delivered. Customer publication grants and revocations remain authoritative. Operations readers do not receive moderation authority. Memory curation follows the shared role model; an Admin approval does not grant public sharing.

CRM reuses EventRequirement as demand, Opportunity/Quote as sourcing/offer, FollowUp as staff action and linked Core bookings as conversion. Assign an active sales owner, qualify, source a real eligible service, obtain the vendor's quote, then let the customer decide/pay. Stage gates require actual linked records. Overdue reminders are persisted once. Reported value, current confirmed contract value, verified collections, refunds and payout releases are separate. Recognized revenue remains unavailable until Finance supplies an approved recognition policy; contracted fees are not recognized revenue.
