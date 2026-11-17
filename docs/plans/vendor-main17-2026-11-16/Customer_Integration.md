# Customer product integration handoff - specification only

No Customer screens are changed by this Vendor planning task. Work must follow its existing customer-dev line and independent approval; shared contracts must remain compatible until a coordinated release is authorized.

| Findings | Required Customer-side integration | Vendor/shared prerequisite | Acceptance |
| --- | --- | --- | --- |
| V03/V04/V07 | Stable identity/event membership, current consent/withdrawal/privacy controls | Canonical adapters and scoped grants | Revoked identity/member cannot access new private data |
| V26/V28 | Explicit external relationship link acceptance/withdrawal; distinct purpose/channel/vendor/media rights | Versioned consent and link evidence | No name/phone merge; linking does not subscribe marketing |
| V41/V42 | Event/service QR entry, required OTP, optional account, dimensions/feedback/photos/support and separate consents | Approved eligible token/expiry/rate/rights policy | No PII in URL, no account requirement unless policy requires, no marketing bundle |
| V49/V53/V61/V71 | Actual immutable terms/work-order/quote diff, exact amount/currency authorization, reacceptance and accepted document retrieval | Approved legal templates/applicability/quote versions | Old acceptance cannot authorize changed amount/version; completion acknowledgement is distinct |
| V55/V57 | Owned enquiry creation; requested/authorized radius, expansion approval/rejection/status | Canonical enquiry and consent guard | Rejected radius cannot trigger wider matching |
| V60-V63 | Up-to-five qualified quote comparison, scope/terms/validity/reasons/uncertainty and explicit selection | Atomic admission and immutable submitted versions | No sixth active option; no automatic AI selection or confirmed booking claim |
| V68/V69 | Assigned media delivery/review/download/revocation and agreement documents | Existing private storage/version/grant/access log | Removed member/withdrawn rights cannot fetch new content |
| V73-V79 | Source-labelled payment/refund/approval/exception transparency | Reconciled Core/provider evidence | Processing/authorized/internal hold never shown as provider captured or bank paid |

Deployment of Vendor-side agreement enforcement must wait for coordinated Customer acceptance readiness and approved historical-booking rollout. Additive fields/adapters can be prepared with enforcement disabled; do not break already-working customer checkout merely to display a completed Vendor checkbox.

Batch18 shared compatibility review: keyed quote creation keeps an internal pending-effect source and uses the existing in-app quote notification/thread paths with the existing `quote` message type, `Quote Received:` prefix and Customer quote-review destination. The legacy message helper contract remains the default; strict atomic persistence is opt-in for the Core handler. Snapshot/command/context keys stay out of ordinary quote/thread projections, including authorized-contact views. No Customer screen/authentication rewrite, payment verification or automatic external channel activation is included. Coordinated Customer signed-in/native and staging worker/restore acceptance is still required.
