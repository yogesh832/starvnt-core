# 05 — UI/UX & PDF Design Implementation Plan

## 1. Reference PDF design audit (12-page Sudipta Chatterjee proposal)

| Page | Keep | Improve / correct in the new engine |
|---|---|---|
| 1 Cover | Strong hero, customer name, date / location / guests, package value, service icons | Hero must match the customer's theme. Show the **approved** value, not "indicative". |
| 2 Overview | Event details table, 5-step planning approach, important note | Generated from manifest; adds vision / objectives / preferences |
| 3–5 Catering | Visual menu grid, live-counter emphasis, operations flow | "OR" options (Reshmi Kebab / Gondhoraj, Ice Cream Fry / Live) must render as **Pending selection**, never as included. Food photos need source labels. |
| 6 Entrance & stage | Four-quadrant visual + execution steps | Images are illustrative. They need an "AI concept / illustrative" badge. |
| 7 Furniture | Inventory table with qty + reference images; capacity warning ("50 chairs ≠ 300 guests") | Keep the capacity rule automated: warn when seats < guests |
| 8 Entertainment | Effect tiles, safety notes | Show only approved items. "Sarfi units (spec to be clarified)" becomes a pending item. |
| 9 Team & photo | Roles + quantities, deliverables to confirm | **Must not** use photos implying real STARVNT staff identities unless real. Use icons or labelled illustrations. |
| 10 Budget | Workstream / allocation / scope table, reconciliation, commercial note | Built from `CommercialApproval.customer.allocations`. Never reuse the ₹4,95,000 figures as defaults. |
| 11 Commercial terms | Payment schedule table, T&Cs, exclusions | Percentages and amounts come from policy and commercial approval, never hard-coded |
| 12 Checklist | Numbered confirmations, booking process | Split into Confirmed vs Pending vs Customer decisions, derived from manifest status |

**Visual issues to fix:**
- Pages 1–9 and 11 are full-page raster images, so the text is not selectable or searchable and file size is high. Pages 10 and 12 are plain text pages with a different style, so the document is inconsistent.
- The new engine uses **one HTML/CSS design system**: real text, raster only for photos, and consistent headers and footers ("STARVNT · Proposal PRP-… v3 · Page 4 of 14").

## 2. Design system

**Theme tokens** are CSS variables shared by the PDF and the web viewer:

| Token | Default (Royal Luxury) |
|---|---|
| `--wine` | `#5B1F2E` |
| `--ivory` | `#FBF6EE` |
| `--gold` | `#C9A46A` (flat; no metallic gradients) |
| `--ink` | `#1C1A19` |
| `--muted` | `#6E6660` |
| `--line` | `#E7DCCB` |

**Typography:**
- Display serif for headings: Cormorant Garamond or Playfair. Fonts are embedded in the PDF.
- Humanist sans for body and tables: Inter or Source Sans.
- Tabular numerals for amounts.

**Themes:** Royal Luxury, Bengali Traditional, Soft Ivory Editorial, Contemporary Minimal, Corporate Premium, Modern Concert, Cultural Heritage, Destination Wedding.
- A theme overrides tokens, hero treatment and ornament set.
- The theme is chosen from the manifest (`theme`, `eventType`), and an admin can override it.

**Rules (from handbook §2.4):** no generic SaaS look, no heavy gradients, no cheap gold effects, generous whitespace, at most 2 images per row on mobile.

## 3. Customer experience (mobile-first)

### 3.1 Dashboard card — "My Event Proposal"
```
┌───────────────────────────────────────┐
│ [ cover hero image          AI concept]│
│ Wedding Reception · 31 Jan 2027        │
│ PRP-2027-0042 · Version 3              │
│ ₹4,95,000  approved package            │
│ ● Awaiting your approval   upd. 12 Nov │
│ [ View proposal ] [ PDF ] [ Ask Aura+ ]│
└───────────────────────────────────────┘
```

### 3.2 Proposal viewer
- Rendered from the snapshot JSON, so it is fast, responsive and not a PDF embed.
- Tabs on mobile, side navigation on desktop: Overview · Experience (gallery) · Services · Budget · Terms & payments · Pending items · History.
- Sticky action bar:
  - **Approve v3**: confirmation dialog stating "Approving does not confirm your booking or take payment".
  - **Request changes**: opens a structured form or Aura+.
  - **Decline**.
  - Download PDF.
- Every image carries a source badge: `AI concept` · `Vendor portfolio` · `Your reference` · `Illustrative` · `STARVNT event`.
- A PRELIMINARY version shows a persistent wine-coloured banner and **disables Approve**.

### 3.3 Aura+ panel
- A slide-over chat seeded with suggested questions from handbook §2.14.
- Answers cite the section ("from your Budget, v3").
- A "Request this change" action creates a draft change request for the customer to confirm.

### 3.4 Aura+ Event Designer additions
- A theme picker: 3–4 concept cards, each labelled **AI-generated concept**.
- An evolving Event Preview card showing manifest completeness and provenance-labelled images.
- A customer reference upload, labelled "Your reference".

## 4. Internal Proposal Studio workspace (desktop, usable on tablet)

```
┌ Proposals ───────────────────────────────────────────────────────────────┐
│ Filters: status ▾ event type ▾ date ▾              [search event/customer]│
│ ID      Customer   Type     Date      Guests Vendor   Commercial Ver  Readiness │
│ PRP-42  S. Chatterjee Wedding 31-01-27 300   4/5 ✓   Pending   v2  ● Commercial Approval Pending │
└──────────────────────────────────────────────────────────────────────────┘

┌ PRP-42 · Sudipta Chatterjee · Wedding Reception ─────── Readiness: ● Ready for Generation ┐
│ 1 Manifest │ 2 Vendor Commitments │ 3 Agreements │ 4 Commercial │ 5 Visual Assets │
│ 6 Builder  │ 7 Quality Control    │ 8 Final Approval & Publish │ History │ Access log │
└───────────────────────────────────────────────────────────────────────────┘
```

- The **readiness pill** comes from `GET /proposal-readiness`. It lists the failing reasons, each linking to the relevant tab.
- **Builder:**
  - The section list is auto-selected by the event type and scope; the admin can reorder or hide optional sections.
  - Theme selector.
  - Asset slot picker, filtered by category and provenance.
  - A live HTML preview with the same templates as the PDF.
- **Quality Control:** the QA checklist with pass/fail, page thumbnails, and "Regenerate draft".
- **Final Approval:** shows the snapshot diff from the previous version and a Publish button. It is disabled unless the gate passes and QA passes.

## 5. PDF engine

**Pipeline:**
```
snapshot JSON ─► Composer (section registry + theme) ─► HTML (blocks) ─► Puppeteer page.pdf({format:'A4', printBackground:true})
              ─► storage (private) ─► QA (pdf-parse text + page images) ─► publish
```

- **Why Puppeteer HTML→PDF:**
  - real selectable text
  - CSS `@page` A4 with margins and running header and footer
  - `break-inside: avoid` for tables and cards
  - embedded fonts
  - one set of templates serves the web preview and the PDF
- **Isolation:**
  - The worker runs as a separate process or container, consuming `PROPOSAL_GENERATION_REQUESTED`.
  - Concurrency is capped (2), timeout 60s, retried up to 3 times through the outbox.
  - Only local or allow-listed image URLs are rendered; there is no network access beyond storage.
- **Images:** pre-fetched, resized with `sharp` to print resolution (≥ 2000 px long edge for heroes), and inlined.
- **Watermark:** in PRELIMINARY mode a diagonal "PRELIMINARY — NOT A FINAL APPROVED PROPOSAL" appears on every page, plus a header banner.

## 6. Dynamic composition

**Blocks** (reusable HTML partials):
- `cover-hero`, `event-info`, `section-intro`, `gallery-2|3|4`, `service-detail`
- `menu-grid`, `inventory-table`, `budget-table`, `payment-schedule`, `terms-list`
- `checklist`, `approval-block`, `source-caption`, `pending-badge`

**Section registry** (keyed by event type; a section is included only if its scope category is approved):

| Event type | Sections |
|---|---|
| Wedding / Reception / Engagement | Cover, Overview, Vision & Moodboard, Welcome & Catering, Menu, Entrance & Stage, Furniture & Seating, Entertainment & Production, Team & Photography, Budget, Terms, Roadmap, Checklist, Approval |
| Birthday / Anniversary | Cover, Overview, Theme & Moodboard, Décor, Cake & Catering, Entertainment, Photography, Budget, Terms, Checklist, Approval |
| Corporate / Conference / MICE | Cover, Overview & Objectives, Agenda, Stage & AV, Branding, Seating Layout, Catering, Production, Team, Budget, Terms, Roadmap, Checklist, Approval |
| Festival / Concert | Cover, Overview, Ground Layout, Stage & Production, Artists, Crowd Management & Safety, Operations, Budget, Terms, Roadmap, Checklist, Approval |

**Rules:**
- Hide sections whose scope is empty.
- Paginate long menus and inventories across pages, with the header row repeated.
- No page shorter than 25% filled; merge with the previous page instead.
- Images per page adapt to the number available.
- The capacity guard warns when listed seating < guest count.

## 7. Image handling
- **Every image slot resolves to a `VisualAsset`. Priority:**
  1. approved vendor portfolio for the contracted vendor
  2. STARVNT event photo
  3. customer reference
  4. AI concept
  5. illustrative library
- **A source caption is mandatory.** The renderer refuses to render an asset without `sourceType`, and QA fails.
- **AI concepts:**
  - Prompts are built from event type, theme, palette, budget tier, venue constraints and approved scope.
  - Images are generated via Gemini image generation (pending decision 3) and stored with prompt and model metadata.
  - Admin approval is required before a concept can appear in a FINAL proposal.
- **Validation:** mime, minimum resolution, aspect ratio within slot tolerance, no broken URLs, licence present for non-AI assets.

## 8. Responsive and print
- Customer viewer: breakpoints at 360 / 768 / 1280.
- The PDF uses an 11pt minimum body size and high-contrast tables so it stays readable when zoomed on a phone.
- A4 with 12mm margins, 300 dpi images, PDF/A-friendly fonts.
