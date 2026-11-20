# STARVNT Proposal Studio — Technical Assessment Summary

**Status:** Pre-development assessment, submitted for review. No code has been changed.
**Date:** 2026-11-12
**Inputs:**
- *STARVNT Proposal Studio — Master Design, Development & PDF Generation Handbook*
- `STARVNT_Sudipta_Chatterjee_Wedding_Reception_Proposal_12_Page.pdf` (the reference proposal)
- `instruction/STARVNT_Event_Commercial_Intelligence_Master_Developer_Prompt.pdf`
- A full audit of the `starvnt-core` codebase

**Principle:** AUDIT → REUSE → INTEGRATE → BUILD → TEST → PROVE

## Deliverables

| # | Document | Answers |
|---|---|---|
| 1 | [01-architecture-audit.md](01-architecture-audit.md) | What exists today, and where |
| 2 | [02-gap-analysis.md](02-gap-analysis.md) | Exists / partial / missing against every handbook requirement |
| 3 | [03-database-api-impact.md](03-database-api-impact.md) | New and changed models, endpoints, permissions |
| 4 | [04-module-integration-plan.md](04-module-integration-plan.md) | How Proposal Studio plugs into Aura+, Core, Vendor OS, Commercial, Dashboard |
| 5 | [05-uiux-pdf-design-plan.md](05-uiux-pdf-design-plan.md) | Screens, workflow, PDF engine, design system, image handling |
| 6 | [06-phases-timeline.md](06-phases-timeline.md) | Dependency-ordered roadmap and estimates |
| 7 | [07-testing-acceptance.md](07-testing-acceptance.md) | Test strategy and Definition of Done |

## Headline findings

1. **A strong base exists for reuse.** Seven pieces are already built:
   - Aura+ conversational intake (Gemini; one question at a time enforced in code)
   - Event and requirement models
   - Vendor matching with hard gates
   - Vendor quote state machine
   - Maker-checker policy approval
   - RBAC, audit logs, idempotency, an outbox, workers and notifications
   - Cloudinary storage and Razorpay booking/payment
2. **The proposal layer itself does not exist.** These pieces are missing:
   - Event Requirement Manifest
   - Vendor Agreement lifecycle
   - Per-event internal commercial approval (margin and customer price)
   - Proposal, versions and frozen snapshots
   - An approval gate
   - A real PDF renderer (today there is only a hand-written one-page text PDF)
   - A visual asset library with source labels
   - A proposal viewer, customer approval and change requests
3. **Vendor quotes are too thin to drive a proposal.** They lack:
   - structured scope, quantities, deliverables and taxes
   - versioning (a revision overwrites the original)
   - enforced expiry
4. **The commercial spec constrains the design:**
   - no separate finance database
   - Core owns financial truth, and Aura+ only explains it
   - milestone payment schedules
   - full traceability of who/what/when/why

   Proposal Studio will *consume* `financialTruth` and policy data rather than calculate prices itself.
5. **Five existing bugs were found during the audit** (see 01 §10). They should be triaged before Phase 1, and two of them touch code we depend on.

## Recommended approach
- Build Proposal Studio as a **thin orchestration layer on existing Core data**. It has five parts:
  - a new `EventManifest`
  - `VendorAgreement`
  - `CommercialApproval` (reusing the maker-checker pattern from `CorePolicyRevision`)
  - `Proposal` / `ProposalVersion` with immutable snapshots
  - one server-side `ProposalGate`
- Render the PDF from **HTML/CSS templates through headless Chromium (Puppeteer)** in a background worker. Text stays selectable, pages are A4 print-ready, and sections are composed from modular blocks.
- **Estimate:** about 11–12 weeks for 2 developers across 7 phases, P0 business integrity first.

## Decisions requested from STARVNT
1. Approve the **Puppeteer** HTML-to-PDF renderer. It adds a Chromium dependency of about 170 MB to the server image, and could run as a separate worker container.
2. Confirm **who approves commercially**: `FINANCE_ADMIN` as checker, with `SALES_MANAGER` or `OPERATIONS_ADMIN` as maker.
3. Confirm which **AI image provider** to use for concept visuals: Gemini image generation, which matches the existing `@google/genai` dependency, or another provider. Also confirm the licensing policy for stock and reference images.
4. Confirm that **milestone payment schedules** belong to this module's scope, or to Commercial Intelligence Phase 2. They are a dependency for the commercial terms page.
5. Approve fixing the **existing bugs** in 01 §10 as a Phase 0 task.

## Handbook traceability

| Handbook requirement | Covered in |
|---|---|
| §1.4 / §2.16 Reuse, no duplicate logic | 01, 04 |
| §2.3 Three connected systems | 04 |
| §2.5 Customer journey, Aura+ designer | 04 §2, 05 §3 |
| §2.6–2.7 Internal dashboard, readiness states | 05 §4, 03 §2.5 |
| §2.8–2.9 Mandatory approval gate, frozen snapshot | 03 §2, 04 §4, 07 §2 |
| §2.10–2.11, §4.4, §4.10 PDF sections, dynamic composition | 05 §5–6 |
| §2.12, §4.8 Visual asset engine, provenance | 03 §2.7, 05 §7 |
| §2.13–2.15, §4.15 Customer viewer and dashboard card | 05 §3 |
| §2.14, §4.14 Aura+ proposal assistant | 04 §6 |
| §2.17, §4.12–4.13 Change requests, versioning | 03 §2.5–2.6, 04 §5 |
| §2.19, §4.20 Priorities and phases | 06 |
| §2.20, §4.19 QA and PDF QA | 07 §3–5 |
| §4.11 Budget reconciliation, no cost leaks | 03 §4, 07 §2–3 |
| §2.24, §4.23 End-to-end acceptance | 07 §6 |
