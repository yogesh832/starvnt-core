# 04 — Module Integration Plan

## 1. Ownership (who is source of truth)

| Concern | Owner | Proposal Studio's role |
|---|---|---|
| Event + requirements | STARVNT Core (`CustomerEvent`, `EventRequirement`) | Reads; freezes into `EventManifest` |
| Conversation, interpretation | Aura+ | Collects, explains, drafts change requests. **Never** approves or prices. |
| Vendor eligibility, quotes | Vendor OS (`matching.service.js`, `Quote`) | Reads approved quotes → agreements |
| Agreement approval | Vendor OS + Core (`VendorAgreement`) | Gate reads status |
| Customer price, margin | Commercial Approval (`CommercialApproval`, adminConn) | Reads customer projection only |
| Payment terms policy | Core policy (`getCommercialPolicyForCategory`) | Reads |
| Booking, payment | Core commerce (`commerce.service.js`, `CoreBooking`) | **Untouched.** Approval does not book. |
| Document, versions, delivery | Proposal Studio | Owns |

## 2. End-to-end flow

```
 Customer ──chat──► Aura+ (aura.service.js)
                       │ extractionWriter (whitelisted)
                       ▼
            CustomerEvent + EventRequirement  ◄── customer edits / admin edits
                       │ buildManifest() + validateManifest()
                       ▼
                EventManifest vN (FROZEN, VALID) ──► MANIFEST_FROZEN
                       │ requestVendorQuotes → matchVendorsForRequirement
                       ▼
                 Vendor Quote (SUBMITTED → APPROVED)
                       │ createAgreementFromQuote()
                       ▼
            VendorAgreement (DRAFT → SENT → APPROVED by vendor)
                       │ all mandatory approved
                       ▼
         CommercialApproval (maker: Sales Mgr → checker: Finance) APPROVED
                       │
                       ▼
            ┌──────── ProposalGate.evaluate(eventId) ────────┐
            │ manifest VALID & frozen                         │
            │ every mandatory agreement APPROVED & unexpired  │
            │ commercial APPROVED for same manifest/agreements│
            │ Σ allocations + unallocated == packageTotal     │
            │ policy-derived schedule sums to packageTotal    │
            │ hash(inputs) == hash at approval                │
            └──────────────┬──────────────────────────────────┘
                 pass │            fail → reasons[] (preliminary only)
                      ▼
       ProposalVersion vN: toCustomerSnapshot() → snapshotHash (immutable)
                      │ PROPOSAL_GENERATION_REQUESTED (outbox, idempotent)
                      ▼
       Render worker: Composer → HTML blocks → Puppeteer → PDF → private storage
                      ▼
       ProposalQA (data + visual checks) ── fail → QUALITY_REVIEW (blocked)
                      │ pass → admin publish
                      ▼
       SENT_TO_CUSTOMER → notifyCustomer → Dashboard card / viewer / Aura+ Q&A
                      │
          approve(vN, hash) │ decline │ change request
                      ▼
       CUSTOMER_APPROVED (audited)   ⟶   customer proceeds to existing booking + Razorpay flow
```

## 3. Integration points per module

### 3.1 Aura+ (`server/src/customer/aura/`)
1. **Extend extraction.** Add theme, colour palette, entertainment, furniture and menu fields to the Gemini response schema (`geminiAdapter.js`) and to the `extractionWriter.js` whitelist and `serviceRequirements.js`.
2. **Manifest prompt.** When `validateManifest` reports missing items, feed them to `nextQuestion()` so the one-question-at-a-time flow asks for exactly those.
3. **Proposal Q&A mode.** `contextBuilder.js` gets a `proposal` context type.
   - It loads **only** the published `ProposalVersion.snapshot`.
   - The system prompt says: answer only from the snapshot; if a value is absent, say "not part of your approved proposal"; never state prices that aren't in the snapshot.
4. **Change request drafting.**
   - Aura+ returns a structured `changeRequest` draft in `extracted`.
   - The customer confirms it in the UI, then `POST /change-requests` is called.
   - Aura+ has no write path to the agreement, commercial or proposal status.

### 3.2 STARVNT Core / Event
- `buildManifest(eventId)` reads the existing models.
- Requirement status `confirmed` maps to included; `pending` and `customer_provided` map to pending items. This is why "OR" choices (e.g. Reshmi Kebab vs Gondhoraj) render as **pending selections**, not inclusions.
- `EventHistory` records manifest freezes.

### 3.3 Vendor OS
- `createAgreementFromQuote(quoteId)` takes an APPROVED `Quote` and builds a DRAFT `VendorAgreement`.
  - It copies `pricingBreakdown` + `lineItems` + `policySnapshot`.
  - It marks the agreement mandatory if the category is essential in `planCatalog.js` or the manifest.
- The vendor portal gets an Agreements list in `web/src/pages/vendor/pages/` and mobile `VendorBusiness`.
- `notifyVendor` is sent when an agreement is sent.
- An expiry worker added to `coreWorkers.js` moves agreements past `validUntil` to `EXPIRED`. It also fixes quote expiry (B3).

### 3.4 Commercial Approval Engine
- The maker builds a `CommercialApproval`:
  - Pre-filled from agreement totals.
  - The maker adds direct costs, logistics, contingency and margin.
  - The system computes `packageTotal` and suggests allocations per category. The maker can edit labels and splits, but the sum must reconcile.
  - The payment schedule defaults from policy (`getCommercialPolicyForCategory`). Platform fee and tax handling are consistent with `settlementMath` but **not shown to customers**.
- The checker approves with `commercial.approve`. The checker must be a different admin. This is the same rule as `policy.routes.js`.
- After the proposal is approved and booked, `customerFinancialTruth` stays the projection of record. Proposal Studio does not create a second financial view.

### 3.5 Proposal Studio (new: `server/src/proposals/`)

```
proposals/
  models.js                 EventManifest, VendorAgreement*, Proposal, ProposalVersion, ChangeRequest, VisualAsset
  manifest.service.js       buildManifest, validateManifest, freeze
  agreement.service.js      createAgreementFromQuote, send, vendorDecision, expire
  commercial.service.js     prepare, submit, approve (maker-checker) — models on adminConn
  gate.service.js           evaluate(eventId) → { ready, state, reasons[] }
  snapshot.service.js       toCustomerSnapshot, hash
  composer/                 sectionRegistry.js, themes.js, blocks/*.html
  render.worker.js          Puppeteer → PDF → storage (outbox consumer)
  qa.service.js             data + visual checks
  delivery.service.js       publish, signed URL, access log, decision, change requests
  routes.admin.js / routes.vendor.js / routes.customer.js
```

- `*` `VendorAgreement` lives here but is exposed through vendor routes.
- Routes are mounted in `app.js` next to the existing routers.

### 3.6 Customer Dashboard
- Web:
  - A HomePage card ("My Event Proposal").
  - A `ProposalPage` under `CustomerPortal.jsx` routes.
  - `DocumentsPage` lists proposal PDFs.
- Mobile:
  - A card in `CustomerWorkspace`.
  - A new `ProposalViewer` screen.
  - The Library lists PDFs.
- **Approve** records the decision, then shows "Proceed to booking". That button opens the *existing* quote/checkout flow, so booking stays under Core's control.

## 4. The gate (single authority)
`ProposalGate.evaluate(eventId)` is the only code that may move a version to `APPROVED_FOR_GENERATION`.
- The UI only displays its result.
- The generate endpoint re-runs it inside the request.
- The worker re-runs it before rendering, to catch races, e.g. an agreement expiring in between.

| Check | Fails as |
|---|---|
| Manifest exists, VALID, frozen | `REQUIREMENTS_INCOMPLETE` |
| Each mandatory category has an APPROVED, unexpired, non-superseded agreement | `VENDOR_APPROVAL_PENDING` (lists categories and reasons: pending / rejected / expired / superseded) |
| CommercialApproval APPROVED, referencing the current manifest version + agreement versions | `COMMERCIAL_APPROVAL_PENDING` |
| Σ allocations (+ explained unallocated) == packageTotal; schedule sums to packageTotal | `PRICING_MISMATCH` |
| Input hash unchanged since commercial approval | `SNAPSHOT_CHANGED` |

## 5. Change request → new version
1. A customer or admin raises a `ProposalChangeRequest`. The version moves to `CHANGE_REQUESTED`.
2. The admin identifies the affected categories.
3. Revalidation happens per affected category:
   - a scope change → new quote / agreement version (old one `SUPERSEDED`)
   - a price change → new `CommercialApproval`
4. The gate runs again, a new `ProposalVersion` is created, and the previous version becomes `SUPERSEDED` **but is preserved**.
5. Any earlier customer approval stays tied to its own version and cannot carry over to a new version.

## 6. Security integration
- Admin endpoints: `requireAdminAuth` + `requirePermission`.
- Customer endpoints: `requireExternalAuth` + an ownership check (`proposal.customerId === req.user.id`).
- PDFs are stored privately (Cloudinary `authenticated`) and served only via short-lived signed URLs. Every access is logged in `ProposalAccessLog`.
- Generation is idempotent via `withIdempotency(key, 'proposal.generate', fn)`.
- Every state change calls `recordBusinessAudit`.
