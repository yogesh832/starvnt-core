# 02 — Current System vs Required System: Gap Analysis

**Legend:** ✅ exists and can be reused · 🟡 partial, needs extension · ❌ missing, must be built

## A. Aura+ Event Designer

| Requirement (handbook) | Status | Current state | Action |
|---|---|---|---|
| Natural chat, one question at a time | ✅ | `aura.service.js`, `nextQuestion()` | Reuse |
| Collect type/date/location/venue/guests/budget | ✅ | Extraction schema + `extractionWriter.js` | Reuse |
| Collect theme, colour palette, catering, décor, entertainment, photography, furniture, special requirements | 🟡 | Covers cuisine, décor theme, photo style and categories. **Missing:** colour palette, entertainment detail, furniture, structured menu. | Extend the extraction schema and `serviceRequirements.js` field sets |
| Share references (images) | ❌ | No customer upload route | Customer upload → `VisualAsset` (CUSTOMER_REFERENCE) |
| Present visual theme options | ❌ | — | P2: theme presets + AI concept images |
| Save approved requirements to an Event Requirement Manifest | ❌ | Live `CustomerEvent` + `EventRequirement`, mutable | New `EventManifest`: a versioned, validated, frozen copy |
| Evolving Event Preview with source labels | ❌ | UnderstandingCard is text-only | Preview component with provenance badges |
| Aura+ explains missing requirements | ✅ | `understanding.js` missing-field logic | Reuse; feed it manifest validation errors |

## B. STARVNT Approval Engine

| Requirement | Status | Current state | Action |
|---|---|---|---|
| Requirement validation (completeness, capacity, budget feasibility, conflicts) | 🟡 | `confirmEvent` checks only type, date and city | `validateManifest()` service using `serviceRequirements.validateDetails` |
| Vendor discovery and matching | ✅ | `matchVendorsForRequirement` | Reuse |
| Vendor quotations with scope, quantity, deliverables, taxes, payment terms, cancellation | 🟡 | Price breakdown + advance % + policy snapshot only | Add `lineItems[]`, `deliverables[]`, `tax`, `exclusions[]` to `Quote` (optional, backward compatible) |
| Quote validation and expiry | 🟡 | Expiry not enforced (B3) | Expiry worker + check on accept |
| Vendor agreement: Draft → Sent → Approved / Rejected / Revised | ❌ | No entity | New `VendorAgreement` |
| Agreement expiry and superseded state | ❌ | — | Part of `VendorAgreement` |
| Internal commercial approval (costs, contingency, margin, customer price) | ❌ | Only category-level policy approval exists | New `CommercialApproval` using the maker-checker pattern |
| Proposal eligibility / readiness validated by Core | ❌ | — | `ProposalGate.evaluate()` |
| Audit and approval records | ✅ | `recordBusinessAudit`, `AdminAuditLog` | Reuse for every transition |

## C. Proposal Studio

| Requirement | Status | Current state | Action |
|---|---|---|---|
| Frozen approved snapshot, Proposal ID, version | ❌ | — | `Proposal` + `ProposalVersion` (immutable snapshot + hash) |
| Dynamic, modular, multi-page PDF | ❌ | `buildSimplePdf` (one page of text) | HTML template blocks + Puppeteer renderer |
| Event-type-aware sections (wedding / birthday / corporate / festival) | ❌ | `planCatalog.js` knows services per type | Section registry keyed by event type + approved scope |
| Themes (Royal Luxury, Corporate Premium, …) | ❌ | — | Theme tokens (CSS variables) |
| Budget allocation reconciled to customer total | ❌ | — | Allocations stored in `CommercialApproval`; reconciliation check in the gate |
| Commercial terms and payment schedule from policy | 🟡 | `getCommercialPolicyForCategory` (advance + balance) | Reuse; add milestones (decision 4) |
| Finalization checklist (confirmed vs pending) | ❌ | Requirement statuses exist | Derive from manifest status + pending items |
| PRELIMINARY watermark mode | ❌ | — | Renderer mode flag; never stored as final |
| PDF quality validation | ❌ | — | `ProposalQA` service |
| Secure document storage and access | 🟡 | Cloudinary private uploads exist ad hoc | Shared storage helper + signed, expiring URLs + access log |
| Internal Proposal Studio dashboard (8 sections, readiness states) | ❌ | Admin portal exists (`web/src/pages/admin`) | New admin page set |
| Generation errors, regenerate drafts, access history | ❌ | — | Part of admin APIs |

## D. Visual Asset Engine

| Requirement | Status | Current state | Action |
|---|---|---|---|
| Vendor portfolio images | 🟡 | `PortfolioItem` | Wrap as `VisualAsset` source APPROVED_PORTFOLIO, with an approval flag |
| STARVNT event photography | ❌ | — | Admin upload to the asset library |
| Customer references | ❌ | — | Customer upload route |
| AI-generated concepts | ❌ | — | Gemini image integration, labelled AI_CONCEPT |
| Equipment / venue / layout references | ❌ | — | Asset library categories |
| Mandatory source label on every image | ❌ | — | `sourceType` required; rendered as a caption badge |
| License and authorization tracking | ❌ | — | `license` + `authorizedBy` fields |
| Image validation and optimization | 🟡 | `sharp` used once | Shared `imagePipeline` (validate, resize, check aspect) |

## E. Customer experience

| Requirement | Status | Current state | Action |
|---|---|---|---|
| "My Event Proposal" dashboard card | ❌ | HomePage workspace exists | New card component (web + mobile) |
| Proposal viewer (cover, scope, budget, gallery, terms, schedule, pending items) | ❌ | — | New page, rendered from snapshot JSON (not from the PDF) |
| View / download PDF | 🟡 | `DocumentsPage` + download route | Add a proposal document type |
| Approve / decline the exact version | ❌ | — | Version-bound decision endpoint |
| Request changes | ❌ | — | `ProposalChangeRequest` |
| Aura+ proposal Q&A from approved data | ❌ | Aura grounds answers in event context | Add a snapshot-grounded context mode |
| Approval ≠ booking | ✅ (by construction) | Booking flow is independent | Keep separate; test explicitly |
| Notifications | ✅ | `notifyCustomer` / `notifyVendor` | Reuse |
| Mobile parity | 🟡 | Expo app exists | Mobile card + viewer + actions |

## F. Cross-cutting

| Requirement | Status | Action |
|---|---|---|
| RBAC for proposal/agreement/commercial actions | 🟡 | Add permissions to `permissions.js` and role presets |
| Idempotent generation | ✅ | `withIdempotency` |
| Async generation, retries | ✅ | Outbox + worker |
| Never leak costs or margins | ❌ | Customer serializer whitelist + leak-scan test |
| Version history, never overwrite approved | ❌ | Immutable `ProposalVersion` |

## Summary count

| Area | ✅ | 🟡 | ❌ |
|---|---|---|---|
| Aura+ Designer | 3 | 1 | 4 |
| Approval Engine | 2 | 3 | 4 |
| Proposal Studio | 0 | 2 | 10 |
| Visual Assets | 0 | 2 | 6 |
| Customer Experience | 2 | 2 | 5 |
| Cross-cutting | 1 | 1 | 3 |

**Conclusion:** the inputs (Aura+, events, matching, quotes, policy, booking) are largely in place. The new work sits in the middle (agreements, commercial approval, gate, snapshot) and at the output (renderer, assets, viewer). This is why P0 must come before any PDF work.
