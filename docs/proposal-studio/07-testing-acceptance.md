# 07 — Testing Strategy & Acceptance Criteria

**Tooling** (the existing stack):
- `node --test` + supertest + mongodb-memory-server (`server/test/`)
- web tests in `web/test/`, mobile tests in `mobile/test/`
- the smoke runner `server/scripts/portal-smoke.js`
- added: `pdf-parse` to inspect PDF text

New test files follow the `server/test/*.test.js` pattern: `proposal-gate.test.js`, `proposal-versioning.test.js`, `proposal-security.test.js`, `proposal-pdf-qa.test.js`, `proposal-e2e.test.js`.

## 1. Unit and service tests
- **State machines:** valid and invalid transitions for `VendorAgreement`, `CommercialApproval` and `ProposalVersion`.
- **`validateManifest`:** missing date, venue or guests; guests > venue capacity; budget below plan minimum; conflicting requirements.
- **`toCustomerSnapshot`:** allow-list only; deterministic hash.
- **Composer:** event type → section list; empty scope → section omitted; "OR" options → pending.
- **Reconciliation math:** allocations + unallocated == total; schedule sums to total; rounding to whole rupees.

## 2. Approval-gate tests (P0; must fail closed)

| # | Scenario | Expected |
|---|---|---|
| G1 | Mandatory agreement PENDING / SENT | 409 `VENDOR_APPROVAL_PENDING`, no version created |
| G2 | Mandatory agreement REJECTED | 409, reason lists category + `rejected` |
| G3 | Agreement past `validUntil` / EXPIRED | 409 `expired` |
| G4 | Agreement SUPERSEDED by a newer revision | 409 until the new version is approved |
| G5 | Commercial approval missing / pending / rejected | 409 `COMMERCIAL_APPROVAL_PENDING` |
| G6 | Commercial approval references an older manifest or agreement version | 409 `SNAPSHOT_CHANGED` |
| G7 | Σ allocations ≠ package total; schedule ≠ total | 409 `PRICING_MISMATCH` |
| G8 | Manifest invalid or not frozen | 409 `REQUIREMENTS_INCOMPLETE` |
| G9 | Agreement expires between generate request and worker render | Worker aborts → `FAILED`, no PDF published |
| G10 | Maker approves own commercial record | 403 `MAKER_CHECKER_REQUIRED` |
| G11 | Preliminary preview with gate failing | Allowed; PDF contains the watermark on every page; cannot be approved by the customer |
| G12 | Same `Idempotency-Key` sent twice | Exactly one version and one render job |
| G13 | Aura+ attempts any approval or price change (tool or path) | No such path exists; test asserts the API rejects it |

## 3. Security and permission tests
- A customer A requesting customer B's proposal, version or PDF URL gets 404 and the attempt is logged.
- An expired signed PDF URL is denied.
- A vendor sees only its own agreements and never sees customer prices or other vendors.
- An admin without `proposals.publish`, `commercial.approve` or `agreements.manage` gets 403 on the corresponding actions.
- **Leak scan.** Generate a fixture proposal with known vendor costs and margin, then assert that none of these appear in:
  - customer API responses
  - the snapshot
  - the PDF text (`pdf-parse`)
  - the Aura+ proposal context

  Checked values: the vendor cost values, the margin value, and the internal keys (`vendorTotal`, `margin`, `directCosts`, `negotiation`).
- Every state transition has an audit record with actor, before/after state and reason.

## 4. Versioning and customer-decision tests
- A change request goes through revalidation and creates v2.
  - v1 stays readable and becomes `SUPERSEDED`.
  - v1's approval history is intact.
- A customer approving with a stale version or a mismatched `snapshotHash` gets 409.
- After approval, `ProposalVersion` is immutable: any update attempt throws.
- **Approval ≠ booking:** after `CUSTOMER_APPROVED`, assert that there are no new or changed `Reservation`, `Booking`, `Payment` or `CoreBooking` records.
- Declining records the reason, and the proposal can still be revised.
- Aura+ Q&A golden set: 20 questions per sample event.
  - Answers must cite snapshot data.
  - Absent items must be answered with "not included".
  - No price may appear that isn't in the snapshot.

## 5. PDF quality assurance (automated in `qa.service.js`, run before publish)

| Check | Method |
|---|---|
| Customer name, event date, location, guest count, total, schedule correct | `pdf-parse` text vs snapshot |
| Only approved services present; pending items labelled | Text match against snapshot inclusions and pending items |
| No internal or confidential data | Leak scan (§3) |
| No missing, broken or distorted images | Pre-render asset validation (load, min resolution, aspect tolerance) |
| Every image has a source caption | DOM check before render |
| No overflow or overlapping text, no clipped tables | Puppeteer DOM measurement: `scrollHeight > clientHeight` on blocks |
| No blank or near-empty pages | Rasterize pages (Puppeteer screenshot); flag pages with < 3% non-background pixels |
| Page numbering "Page n of N" correct | Text check per page |
| A4 size, fonts embedded | PDF metadata |
| Mobile readability | Body ≥ 11pt; contrast ≥ 4.5:1 on tokens |

If any critical check fails, the version moves to `QUALITY_REVIEW` and publishing is blocked (tested by injecting each defect).

## 6. End-to-end acceptance (handbook §2.24 / §4.23)
Three seeded journeys:
- **A** Luxury Wedding / Reception
- **B** Birthday / Engagement
- **C** Corporate Conference

Each journey is scripted in the `portal-smoke.js` style and demonstrated live. Steps:
1. Customer chats with Aura+ (real chat endpoint).
2. Manifest built, validated, frozen.
3. Vendors matched; quotes submitted and approved.
4. Agreements drafted, sent, approved by each vendor.
5. Commercial approval (maker → checker).
6. Gate passes; snapshot frozen; Proposal ID + v1.
7. Visual assets resolved with provenance labels.
8. PDF generated; QA passes; published.
9. Customer opens the card, viewer and PDF (web + mobile).
10. Customer asks Aura+ three questions.
11. Customer requests a change; revalidation; v2 generated.
12. Customer approves v2.
13. Booking and payment proceed through the existing Razorpay flow, shown as an independent step.

Also run blocked-generation demos G1–G8 live.

**Evidence pack** (`tmp/qa/proposal-studio/`):
- API request/response logs
- test runner output
- the 3 final PDFs plus a preliminary PDF
- before/after comparison with the reference PDF
- mobile and desktop screenshots
- audit-log extracts
- pricing reconciliation report
- image provenance report

## 7. Definition of Done
- [ ] All existing test suites still pass (existing functionality preserved).
- [ ] G1–G13 pass; final generation cannot bypass the gate.
- [ ] Commercial maker-checker enforced.
- [ ] Customer prices reconcile with approved records (automated report).
- [ ] Leak scan passes on API, snapshot, PDF and Aura+ context.
- [ ] Dynamic composition verified for 3+ event families; no irrelevant sections.
- [ ] Every image is labelled with its source; AI concepts are distinguishable and admin-approved.
- [ ] PDF QA passes; A4 print-ready; selectable text; readable on mobile.
- [ ] Version control: v1 preserved after v2; approval bound to the exact version.
- [ ] Approval does not create or modify any booking or payment record.
- [ ] Aura+ answers only from approved data and creates structured change requests.
- [ ] Customer dashboard card + viewer work on web and mobile.
- [ ] 3 E2E journeys demonstrated with the evidence pack.
