# 03 — Database & API Impact Analysis

## 1. Principles
- **No new database.** New collections go on the existing connections, as required by the Commercial Intelligence spec §22.
  - Customer-visible data → `externalConn`.
  - Internal commercial data → `adminConn`.
- **Every new record links back to Core IDs:** `customerId`, `eventId`, `vendorId`, `quoteId`, `bookingId`.
- **Immutable records:** a frozen manifest, an approved agreement, an approved commercial record or a published proposal version is never updated in place. A change creates a new version and marks the old one `SUPERSEDED`.
- **One status per concern.** Proposal status does not duplicate booking or payment status.
- **Every transition writes `recordBusinessAudit`** (who / what / when / why / source / before / after).

## 2. New models

### 2.1 `EventManifest` (externalConn)
```
{ manifestId, customerId, eventId, version,
  event: { type, title, date, city, venue, address, guestCount, budgetMin, budgetMax, theme, colourPalette[] },
  requirements: [{ category, status, details, preferences, mandatory, pendingItems[] }],
  validation: { status: DRAFT|INVALID|VALID, errors[], validatedAt, validatedBy },
  frozen: Boolean, frozenAt, contentHash, supersededBy }
```
- Built from `CustomerEvent` + `EventRequirement` by `buildManifest(eventId)`.
- Aura+ never writes to it directly.

### 2.2 `VendorAgreement` (externalConn)
```
{ agreementId, eventId, manifestId, vendorId, quoteId, category, mandatory,
  scope: { lineItems:[{name, qty, unit, unitPrice, notes}], deliverables[], exclusions[], setupRequirements },
  pricing: { subtotal, tax, total },                         // vendor price — INTERNAL
  terms: { paymentTerms, cancellation, validUntil },
  status: DRAFT|SENT|APPROVED|REJECTED|REVISION_REQUESTED|EXPIRED|SUPERSEDED,
  vendorDecision: { by, at, ip }, version, supersedes, history[] }
```
- The `lineItems` shape matches `common/externalBookingContract.js`.

### 2.3 `CommercialApproval` (adminConn) — INTERNAL ONLY
```
{ approvalId, eventId, manifestVersion, agreementRefs:[{agreementId, version}],
  costs: { vendorTotal, directCosts, logistics, operational, contingency, margin, marginPct },
  customer: { packageTotal, taxes, allocations:[{category, label, scopeSummary, qty, amount, deliverables[], exclusions[]}],
              paymentSchedule:[{label, pct, amount, dueRule}], exclusions[], notes[] },
  status: DRAFT|PENDING_APPROVAL|APPROVED|REJECTED|SUPERSEDED,
  maker, checker, decidedAt, reason }
```
- **Maker-checker** follows the existing `CorePolicyRevision` / `policy.routes.js` rule: the checker must not be the maker.
- The payment schedule defaults from `getCommercialPolicyForCategory`. Nothing is hard-coded.

### 2.4 `Proposal` (externalConn)
```
{ proposalId (e.g. PRP-2027-0042), customerId, eventId, currentVersion, latestApprovedVersion, status }
```

### 2.5 `ProposalVersion` (externalConn)
```
{ proposalId, version, kind: PRELIMINARY|FINAL,
  snapshot: { /* customer-safe projection only */ }, snapshotHash,
  manifestRef, agreementRefs[], commercialApprovalRef,
  theme, sections[], assetRefs[],
  status: DRAFT|PRELIMINARY_PREVIEW|AWAITING_VENDOR_APPROVAL|AWAITING_COMMERCIAL_APPROVAL|APPROVED_FOR_GENERATION|
          GENERATING|QUALITY_REVIEW|GENERATED|SENT_TO_CUSTOMER|CUSTOMER_VIEWED|CHANGE_REQUESTED|
          CUSTOMER_APPROVED|CUSTOMER_DECLINED|SUPERSEDED|EXPIRED|FAILED,
  pdf: { storageKey, bytes, pages, sha256 }, qaReport: { passed, checks[] },
  generation: { idempotencyKey, attempts, lastError },
  customerDecision: { decision, by, at, ip, userAgent }, createdBy, createdAt }
```
- The status list covers handbook §4.12, plus `FAILED`.
- The dashboard readiness indicator in handbook §2.7 is *computed* by `ProposalGate`, not stored.
- **The customer-safe snapshot is the only proposal data that reaches the customer, the PDF renderer and Aura+.**

### 2.6 `ProposalChangeRequest` (externalConn)
```
{ proposalId, fromVersion, raisedBy (customer|admin|aura-draft), items:[{category, request, type: add|remove|modify}],
  affectedCategories[], status: OPEN|IN_REVIEW|REQUIRES_VENDOR|REQUIRES_COMMERCIAL|RESOLVED|REJECTED, resolutionVersion }
```

### 2.7 `VisualAsset` (externalConn)
```
{ assetId, storageKey, url, width, height, mime,
  sourceType: APPROVED_PORTFOLIO|VENDOR_REFERENCE|CUSTOMER_REFERENCE|AI_CONCEPT|ILLUSTRATIVE|STARVNT_PHOTO,
  label (rendered caption), license: { type, holder, evidence }, approvedBy, approvedAt,
  links: { vendorId, eventId, portfolioItemId }, tags: { eventType, category, theme, palette[] },
  ai: { provider, model, prompt, seed } , status: PENDING|APPROVED|REJECTED }
```

### 2.8 `ProposalAccessLog` (adminConn)
```
{ proposalId, version, actorType, actorId, action: VIEW|DOWNLOAD|SHARE, at, ip }
```

## 3. Changes to existing models (additive, backward compatible)

| Model | Change |
|---|---|
| `Quote` (`external/models/Quote.js`) | Optional `lineItems[]`, `deliverables[]`, `exclusions[]`, `tax`; `version` + `supersedes` on revise. Existing quotes stay valid. |
| `CorePolicyRevision` | Optional `paymentMilestones[]` (`label`, `pct`, `dueRule`). Fallback is the current advance/balance. Pending decision 4. |
| `CustomerEvent` | Optional `theme`, `colourPalette[]`, `activeManifestId`, `activeProposalId` |
| `admin/constants/permissions.js` | New permissions: `proposals.read`, `proposals.compose`, `proposals.publish`, `proposals.approve`, `agreements.read`, `agreements.manage`, `commercial.read`, `commercial.prepare`, `commercial.approve`, `assets.manage` |
| Role presets | SALES_MANAGER: compose + prepare. FINANCE_ADMIN: `commercial.approve`. OPERATIONS_ADMIN: `agreements.manage`, `proposals.publish`. ANALYTICS_AUDIT_ADMIN: read. |
| Customer document library (`library.service.js`) | Add a `proposal_<id>_v<n>` document type |

**Migrations:**
- No destructive migrations.
- Index additions: `{eventId, version}` unique on manifests and proposal versions; `{eventId, status}` on agreements.

## 4. Data-leak boundary
- `CommercialApproval.costs` and `VendorAgreement.pricing` are **never** serialized to customer endpoints.
- `toCustomerSnapshot()` builds the snapshot from an **allow-list**: only customer allocations, the package total, the schedule and exclusions.
- A test scans every customer response and the PDF text for internal keys and vendor cost values (07 §3).

## 5. API impact

### 5.1 Admin (`/api/admin/...`, `requireAdminAuth` + `requirePermission`)

| Method / Path | Permission | Purpose |
|---|---|---|
| `POST /events/:eventId/manifest` | proposals.compose | Build and validate the manifest from live event data |
| `POST /manifests/:id/freeze` | proposals.compose | Freeze a valid manifest |
| `GET/POST /agreements`, `POST /agreements/:id/send` | agreements.manage | Draft an agreement from an approved quote and send it to the vendor |
| `POST /commercial-approvals` / `:id/submit` / `:id/approve` / `:id/reject` | commercial.prepare / commercial.approve | Maker-checker |
| `GET /proposals?status=` | proposals.read | Proposal history list (handbook §2.7) |
| `GET /events/:eventId/proposal-readiness` | proposals.read | `ProposalGate.evaluate()` result with reasons |
| `POST /proposals/:id/preliminary` | proposals.compose | Watermarked preview; no gate required |
| `POST /proposals/:id/generate` (header `Idempotency-Key`) | proposals.compose | Gate → snapshot → queue render |
| `GET /proposals/:id/versions/:v/qa` | proposals.read | QA report |
| `POST /proposals/:id/versions/:v/publish` | proposals.publish | QA must have passed; then send to the customer |
| `GET /proposals/:id/access-log` | proposals.read | Document access history |
| `/assets` CRUD + approve | assets.manage | Visual asset library |

### 5.2 Vendor (`/api/vendor/...`, `requireAccountType('VENDOR')`)

| Path | Purpose |
|---|---|
| `GET /agreements`, `GET /agreements/:id` | View own agreements |
| `POST /agreements/:id/approve` / `reject` / `request-revision` | Vendor decision (audited) |

### 5.3 Customer (`/api/customer/...`, `requireAccountType('CUSTOMER')`, ownership enforced)

| Path | Purpose |
|---|---|
| `GET /proposals` | Dashboard card data |
| `GET /proposals/:id/versions/:v` | Customer-safe snapshot for the viewer; marks `CUSTOMER_VIEWED` |
| `GET /proposals/:id/versions/:v/pdf` | Short-lived signed URL; access logged |
| `POST /proposals/:id/versions/:v/decision` `{decision: APPROVE|DECLINE, snapshotHash}` | Version-bound; rejected if `v` is not current or the hash differs |
| `POST /proposals/:id/change-requests` | Structured change request |
| `POST /aura/chat` with `context: {proposalId, version}` | Existing endpoint, with a proposal-grounded mode |
| `POST /assets/references` | Customer reference image upload |

### 5.4 Outbox events (existing dispatcher)
- `MANIFEST_FROZEN`
- `AGREEMENT_APPROVED` / `AGREEMENT_REJECTED` / `AGREEMENT_EXPIRED`
- `COMMERCIAL_APPROVED`
- `PROPOSAL_GENERATION_REQUESTED` (consumed by the render worker)
- `PROPOSAL_GENERATED` / `PROPOSAL_PUBLISHED` / `PROPOSAL_APPROVED` / `PROPOSAL_DECLINED` / `CHANGE_REQUESTED`

**No handler for `PROPOSAL_APPROVED` touches booking or payment state.**

## 6. Dependencies to add

| Package | Where | Why |
|---|---|---|
| `puppeteer` (or `puppeteer-core` + system Chromium) | server, render worker | HTML→PDF, A4, selectable text |
| `pdf-parse` (dev / QA) | server | Extract PDF text for the QA and leak checks |

No other new runtime dependencies. Gemini image generation uses the existing `@google/genai`.
