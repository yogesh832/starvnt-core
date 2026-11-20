# 01 — Existing Architecture Audit Report

The paths below are relative to `starvnt-core/`. Every component listed here was checked directly in the code.

## 1. Platform overview

| Layer | Stack | Notes |
|---|---|---|
| Backend | Node 20, Express 4, Mongoose 8 (ESM) — `server/` | One process hosts every domain |
| Databases | Two Mongo connections — `server/src/db/index.js` | `externalConn` (starvnt_external): customers, vendors, events, quotes, commerce<br>`adminConn` (starvnt_admin): admins, audit, `CoreBooking`, finance, policies, idempotency, outbox |
| Web | Vite 6, React 18, react-router 6, Tailwind v4 — `web/` | Portals: `/customer/*`, `/admin/*`. Vendor tools live inside the customer shell. |
| Mobile | Expo / React Native — `mobile/` | Parity with web is tracked in `mobile/WEB_PARITY_MATRIX.md` |
| AI | Gemini via `@google/genai` | `openai` SDK is used only against Gemini's OpenAI-compatible endpoint |
| Payments | Razorpay | Server-side webhook verification |
| Storage | Cloudinary | Supports private `authenticated` delivery; `sharp` for image processing |

The middleware chain in `server/src/app.js` runs in this order:
1. helmet
2. CORS
3. request ID
4. raw-body webhooks
5. JSON body parsing
6. cookies
7. route mounts
8. a 404 handler and a sanitized error handler

**Route mounts:**
- **External APIs:** `/api/auth`, `/api/customer`, `/api/aura`, `/api/vendor`, `/api/commercial`, `/api/ai`, `/api/experience`, `/api/push`
- **Admin APIs:** `/api/admin/*`. Each router applies `requirePermission`.

## 2. Aura+ conversation engine — exists, reusable
- **Entry point:** `chat()` in `server/src/customer/aura/aura.service.js`. One call runs these steps in order:
  1. Load the session.
  2. Switch the active event if needed (`eventSwitch.js`).
  3. Handle chips.
  4. Build context (`contextBuilder.js`).
  5. Call Gemini with a JSON schema (`geminiAdapter.js`, with retry and fallback models).
  6. Filter what it extracted (`extractionGuards.js`).
  7. Backfill missed facts with regex (`factBackfill.js`).
  8. Save through a whitelist (`extractionWriter.js`).
  9. Choose the next question.
- **Model routing:** `server/src/common/auraRouter.js` (`classifyAuraRequest`) sends simple messages to a fast model and complex ones to a reasoning model.
- **One question at a time is enforced in code:** `nextQuestion()` in `server/src/customer/services/understanding.js` follows a fixed priority order: type → date → city → guests → venue → area → budget → per-service details.
- **Memory:**
  - `AuraSession`, `AuraMessage` (last 12 turns)
  - `AuraContext`, which stores field state (KNOWN / CONFIRMED / INFERRED / MISSING / AMBIGUOUS / RECOMMENDED) and is explicitly *not* business truth
- **Languages:** English, Hindi and Hinglish (`server/src/common/auraLanguage.js`).
- **Fields extracted:** type, date, guests, budget, city/venue/address fields, catering cuisine, décor theme, photography style, needed categories.
- **Per-service field schemas:** `server/src/customer/services/serviceRequirements.js`.
- **Vendor-side mirror:** `server/src/external/aura/`.

## 3. Event and requirement data — exists, partial for the proposal

All in `server/src/customer/models/index.js`:
- **`CustomerEvent`:** type, date, city, guests, budget range, location, specialRequirements.
  - Lifecycle: `draft → planning → booked → in_progress → completed / cancelled`.
- **`EventRequirement`:** one row per service category.
  - Status: missing / pending / customer_provided / confirmed / booked / completed.
  - `source`: customer / aura_inferred / system.
  - Also: free-form `preferences`, `selectedOption`.
- **`EventHistory`:** append-only audit trail of event changes.
- **Read models:** `buildUnderstanding()` (`understanding.js`) and `services/summary.js`.
- **`planCatalog.js`:** essential and recommended services per event type. The proposal composer can reuse this to select sections.
- **No frozen, validated "Event Requirement Manifest" exists.**

## 4. Vendor OS — quotes, matching, agreements
- **Matching (exists):** `matchVendorsForRequirement` (`server/src/external/services/matching.service.js`). It applies three hard gates:
  1. activation (`common/vendorReadiness.js`)
  2. coverage (radius / locality / city)
  3. availability (`checkTrueAvailability`)

  It then ranks by validated total cost and returns at most 4 options. Opportunities are created by `requestVendorQuotes` (`customer/services/decision.service.js`).
- **Quotes (partial):** `server/src/external/models/Quote.js` + `server/src/external/services/quoteStateMachine.service.js`.
  - States: `DRAFT → SUBMITTED → APPROVED / REJECTED / EXPIRED` (`ALLOWED_TRANSITIONS`).
  - `assertQuoteSubmission` requires an activated vendor, availability, and an approved financial policy.
  - The price is a `pricingBreakdown` (base, travel, equipment, setup, additional, total) plus `advancePayment.percentage` and a `policySnapshot`.
  - **Missing:** structured scope, line items, quantities, deliverables, taxes, versioning (`/vendor/quotes/:id/revise` overwrites in place), and expiry enforcement (`validUntil` is never checked).
- **Customer package (partial):** `CustomerQuote` has `items[]` across vendors, a `total`, and `createSuperseding` in `customer/repositories/quotes.repo.js`. Prices come from the catalogue, not from vendor quotes.
- **Vendor agreements (missing):** there is no agreement entity or approval lifecycle.
  - `common/externalBookingContract.js` covers vendor-reported off-platform bookings. Its `lineItems` shape is useful to reuse.
  - `CustomerContractDocument` is only a stored file URL.

## 5. Commercial and financial logic — partial
- **Policy maker-checker (exists):**
  - Model: `CorePolicyRevision`, states DRAFT → PENDING_APPROVAL → APPROVED / SCHEDULED / REJECTED.
  - Routes: `server/src/admin/routes/policy.routes.js`.
  - The approver must differ from the drafter (`MAKER_CHECKER_REQUIRED`).
  - Resolved by `getCommercialPolicyForCategory` (`common/policyResolver.js`).
  - Covers advance %, cancellation penalty, refund tiers, settlement conditions.
- **Fee math:** `settlementMath` (`admin/services/financeLedger.service.js`): 10% platform fee, 18% GST on the fee, 1% TDS. The rates are set by environment variables and applied only at settlement or invoice time.
- **Financial projections:** `customerFinancialTruth` / `vendorFinancialTruth` (`common/financialTruth.service.js`). These are read-only projections, in line with the Commercial Intelligence spec.
- **Missing:**
  - per-event internal commercial approval (vendor cost + direct costs + contingency + margin → customer price)
  - milestone payment schedules (only advance + balance today)
  - customer-facing tax presentation

## 6. Customer dashboard, documents, booking and payment
- **Web customer portal:** `web/src/pages/customer/CustomerPortal.jsx`. Pages include HomePage, EventPage, EventPlanPage, QuotesPage, BookingsPage, BudgetPage, DocumentsPage, and the Aura chat with UnderstandingCard.
- **Mobile:** equivalents under `mobile/src/screens/`. The Account Library shows documents.
- **Documents:** `server/src/customer/services/library.service.js` (`listDocuments`, `documentPdf`), downloaded via `GET /customer/documents/:id/download`. This is the natural place to list proposals.
- **Booking/payment:**
  1. `acceptQuote` creates reservations.
  2. `payReservation` creates a Razorpay order.
  3. The webhook or ops verification confirms the payment.
  4. `confirmBookingFor` creates the booking and calls `syncBookingTruth` → `CoreBooking`.

  All of this is in `customer/services/commerce.service.js`. **Proposal approval must stay separate from this flow.**

## 7. Shared infrastructure — exists, reusable

| Capability | Location |
|---|---|
| Admin auth + RBAC | `admin/middleware/requireAdminAuth.js` (`requirePermission`, `requireAnyPermission`, `requireRole`) |
| Roles / permissions | `admin/constants/permissions.js`. Base roles ADMIN / SUPER_ADMIN; presets SALES_EXECUTIVE, SALES_MANAGER, OPERATIONS_ADMIN, VENDOR_VERIFICATION_ADMIN, FINANCE_ADMIN, SUPPORT_ADMIN, ANALYTICS_AUDIT_ADMIN. No proposal or agreement permissions yet. |
| External auth | `external/middleware/requireExternalAuth.js` (`requireAccountType`) |
| Audit | `admin/utils/audit.js` (`recordAudit`, `recordBusinessAudit`), models `AdminAuditLog`, `BusinessAuditLog` |
| Two-person approval | `admin/models/AdminApprovalRequest.js` (SETTLEMENT_RELEASE, REFUND) |
| Idempotency | `admin/models/IdempotencyKey.js` + `withIdempotency` (`automation/services/dispatcher.service.js`) |
| Outbox / events | `automation/services/outbox.service.js`, `registerEventHandler` / `dispatchEvent` |
| Workers | `workers/coreWorkers.js`, `workers/workerHealth.js` |
| Notifications | `notifications/notification.service.js` (`notifyCustomer`, `notifyVendor`), push worker, preferences |
| Private file storage | Cloudinary `authenticated` uploads + `private_download_url`. Pattern in `external/routes/externalBookings.routes.js`. There is no shared storage helper yet. |
| Images | `sharp`, used only in `experience/discoveryRewards.routes.js` |
| Vendor media | `PortfolioItem` (records the storage provider, not where the content came from) |

## 8. Existing PDF infrastructure
- **No PDF library is installed.** None of pdfkit, puppeteer, pdf-lib or jspdf appears in any `package.json`.
- `buildSimplePdf(lines)` in `customer/services/library.service.js` writes a one-page Helvetica PDF by hand. It handles text only: no layout, no images, no pagination. It is used for receipts and invoices and **cannot be extended into a proposal renderer**.

## 9. Testing infrastructure
- **Server:** `node --test`, 8 files in `server/test/`. They use supertest + mongodb-memory-server and are the pattern for the gate tests.
- **Web:** 13 tests in `web/test/`.
- **Mobile:** 26 tests in `mobile/test/`.
- **Smoke:** `server/scripts/portal-smoke.js` (`npm run test:smoke[:dev|:qa]`).

## 10. Defects found during the audit (pre-existing; recommended Phase 0 fixes)

| # | Location | Defect | Impact on Proposal Studio |
|---|---|---|---|
| B1 | `server/src/external/routes/transaction.routes.js:1207-1208` | `vendor.category` refers to an undefined variable | Quote revision fails when the quote has no category, which breaks agreement revisions |
| B2 | `server/src/experience/launchpad.service.js` | Imports a non-existent `external/models/QuoteProposal.js`, used dynamically from `vendor.routes.js` and `admin/routes/external-users.routes.js` | A runtime failure in a "proposal"-named path; must be resolved so nothing collides with our naming |
| B3 | `server/src/external/models/Quote.js` / accept route | `validUntil` is never enforced; no job expires quotes | Gate must not rely on quote expiry until this is fixed |
| B4 | `server/src/external/services/matching.service.js` | Search waves compute `overrideRadiusKm` but never use it | Lower vendor coverage for proposals |
| B5 | `Reservation.quote` | References `CustomerQuote`, but the vendor-quote path stores a vendor `Quote` id | Data-consistency risk when linking proposals to reservations |
