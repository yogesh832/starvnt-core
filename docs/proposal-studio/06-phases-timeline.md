# 06 — Development Phases, Dependencies & Timeline

**Assumptions:**
- 2 developers: one backend-leaning, one frontend-leaning.
- Existing CI and test setup.
- STARVNT answers the open decisions in `00-summary.md` before Phase 1.

Estimates include tests and evidence for each phase.

## Dependency graph
```
Phase 0 (bugs + decisions)
   └─► Phase 1 Foundation (manifest, agreements, commercial, RBAC)        [P0]
          └─► Phase 2 Gate + Snapshot + Versioning                        [P0]
                 ├─► Phase 3 Composer + PDF Renderer + QA                 [P1]
                 │      └─► Phase 4 Visual Asset Engine (+AI concepts)   [P1/P2]
                 └─► Phase 5 Customer Experience + Aura+ Q&A + Changes    [P1]
                                └─► Phase 6 Admin workspace polish + Mobile parity
                                       └─► Phase 7 E2E Testing & Proof
```
- Phase 3 and Phase 5 can run in parallel after Phase 2: backend dev on the renderer, frontend dev on the viewer.
- P2 items (AI concepts, advanced moodboards, analytics) start only after P0 and P1 pass their acceptance tests.

## Phases

| # | Phase | Duration | Key outputs | Exit criteria |
|---|---|---|---|---|
| 0 | Audit sign-off & stabilization | 0.5 wk | Fix B1–B5 (01 §10); decisions recorded; `server/src/proposals/` scaffold | Existing test suites green; decisions approved |
| 1 | Foundation (P0) | 2 wk | `EventManifest` + validate/freeze; Aura extraction fields; `VendorAgreement` lifecycle + vendor approve/reject + expiry worker; `Quote` line items; `CommercialApproval` maker-checker; new permissions; audit on every transition | API tests for each state machine; maker ≠ checker enforced; vendor can only act on own agreements |
| 2 | Gate, snapshot, versioning (P0) | 1.5 wk | `ProposalGate`; `toCustomerSnapshot` allow-list + hash; `Proposal` / `ProposalVersion`; idempotent generate endpoint; readiness API; change request model | All 7 blocking scenarios fail closed (07 §2); leak test passes on snapshot |
| 3 | Composer, renderer, QA (P1) | 2.5 wk | Design tokens + themes; block library; section registry for 4 event families; Puppeteer worker; private storage + signed URLs; QA service; preliminary watermark | Sample PDFs for wedding / birthday / corporate generated from seeded data; QA catches injected defects |
| 4 | Visual asset engine (P1/P2) | 1.5 wk | `VisualAsset` + library UI; portfolio import; customer uploads; `sharp` pipeline; source captions; Gemini concept generation with admin approval | No asset renders without provenance; AI assets blocked from FINAL until approved |
| 5 | Customer experience (P1) | 2 wk | Dashboard card; viewer; PDF download; version-bound approve/decline; change requests; Aura+ proposal mode; notifications | Approval does not alter booking/payment; Aura answers only from snapshot |
| 6 | Admin workspace & mobile parity | 1 wk | 8-section Proposal Studio UI, history, access log, generation errors; mobile card + viewer + actions | Usability pass on desktop / tablet / mobile |
| 7 | Testing & proof | 1 wk | 3 E2E journeys, evidence pack, before/after comparison with reference PDF | Definition of Done (07 §7) met |

**Total: about 12 weeks** (11.5 + buffer). With one developer, expect about 20 weeks.

## Responsibilities

| Area | Owner |
|---|---|
| Data models, gate, services, workers, APIs, tests | Backend developer |
| Admin workspace, customer viewer, card, Aura panel, mobile screens | Frontend developer |
| PDF templates and design system | Frontend developer + design review by STARVNT |
| Commercial rules, role assignments, policy milestones, licence policy | STARVNT business owner |
| Acceptance sign-off per phase | STARVNT product |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Chromium footprint / memory on the server | Separate worker container; cap concurrency; use `puppeteer-core` with the system Chromium in Docker |
| Vendor quotes lack structure, so agreements are thin | Phase 1 adds optional line items; the admin can enrich agreement scope before sending |
| AI image quality or licensing | AI concepts are P2, labelled and admin-approved; fall back to the illustrative library |
| Scope creep into Commercial Intelligence (milestones, ledger) | Use policy milestones only for display; payment collection stays in the existing flow |
| Gemini cost and latency for image generation | Generate on demand and cache per manifest version |
| Existing defects (B1–B5) | Fixed in Phase 0 before dependent work |
