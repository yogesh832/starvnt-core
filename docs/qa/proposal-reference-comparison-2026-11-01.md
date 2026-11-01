# Original proposal reference comparison - 2026-11-01

Status: all twelve supplied reference pages visually reviewed and compared with the current renderer and generated wedding fixture. Reference-comparison work is complete. Visual/content alignment implementation is not complete. Receiving the reference does not complete the other outstanding handbook capabilities.

The supplied file is treated as a private design and structure reference. Its client identity, event facts, illustrative images and example commercial amounts have not been inserted into production records or reusable customer defaults.

## Reference characteristics

A4 portrait. The dominant design uses deep burgundy panels, cream backgrounds, ornate gold borders, floral corner treatments, a dark branded cover, serif display headings, illustrated service grids, compact tables, callouts and numbered execution steps. Pages 10 and 12 use simpler, text-forward business tables; the reference itself therefore contains two visual treatments.

Only pages 10 and 12 expose substantive extractable PDF text. The remaining ten pages are image-based. The new engine must reconstruct editable, selectable headings, descriptions, quantities and prices rather than placing entire reference pages behind customer data.

## Page-by-page comparison against the initial release

| Reference page | Reference content and presentation | Current implementation | Work remaining |
| --- | --- | --- | --- |
| 1 | Personalized reception cover, hero scene, event facts, prominent package value and exclusions | Hero, event facts, version and validity are present in a simpler editorial cover | Branded ornate cover variant, approved customer identity and price presentation, exclusion callout; no example client data hardcoding |
| 2 | Event overview table, venue responsibility, service summary and planning sequence | Event brief and introduction are text blocks | Structured event/service summary table, venue-responsibility field and reusable process strip |
| 3 | Welcome drinks and starter image grid, mutually exclusive menu choices | Generic service scope and images | Structured menu groups, option-selection state, per-item images and choice labels; unresolved required choices must remain pending |
| 4 | Main-course menu with a dense multi-row image grid | One-column images inside generic service pages | Adaptive menu grid with actual approved dishes, portions and guest coverage |
| 5 | Dessert choice, paan presentation and catering operations flow | Generic service descriptions and free-text roadmap | Dessert choice groups, catering operation/service-flow blocks and approved quantities |
| 6 | Entrance, stage, signboards and selfie-corner grid; execution sequence | Images can be associated with an approved service category | Dedicated design gallery, dimensions, signage text, installation/strike steps and venue constraints |
| 7 | Furniture inventory with quantities, details and reference thumbnails; seating-capacity caveat | One quantity and description per service allocation | Item-level inventory table, units, quantities, measured carpeting and explicit seating coverage |
| 8 | Entry production, effects and equipment grid; approvals and technical uncertainties | Generic approved scope and images | Equipment inventory, durations, technical specifications, permission evidence and safety-condition states; no visual may silently become a guaranteed deliverable |
| 9 | Team roles and counts, photography/video coverage and deliverables to confirm | Free-text scope and deliverables | Structured staffing, duty hours, photo/video output specifications, delivery deadlines and overtime terms |
| 10 | Workstream allocation table with detailed included scope, indicative status and unresolved decisions | Reconciled customer allocations and total are enforced; layout lists category and amount | Multi-column customer allocation table with scope/quantity/status, optional explanatory reserves, and final versus preliminary commercial treatment |
| 11 | Payment milestone table, commercial terms and exclusions | Approved payment terms and exclusions are shown as paragraphs | Structured milestones with amounts that reconcile to the approved total, terms table and exclusions block; sample percentages are not production policy |
| 12 | Detailed confirmation checklist, booking/execution sequence and closing | Short fixed generation/booking-state checklist and free-text roadmap | Event-specific checklist with pending/completed/evidence states and responsible party; render the real Core booking/payment process |

## Important findings

- The reference is explicitly indicative/draft in its commercial content. It is not proof of approved supplier costs, agreed customer pricing, payment verification or booking confirmation. Existing Core authority and proposal approval gates remain controlling.
- The reference contains unresolved menu options, unspecified technical equipment and conditional venue/safety approvals. A final proposal must distinguish these states and prevent mandatory unresolved items from being displayed as confirmed.
- Furniture coverage is not the same as the event guest count. Future inventory blocks need explicit seating capacity and coverage, not inferred full-event seating.
- Reference pictures lack reliable per-image provenance labels. Reused or newly generated visuals still require accurate source labels and authorized use. These pictures cannot be labelled as actual completed STARVNT events merely because they occur in this PDF.
- Page 12 has a visible collision between the booking/execution text and the following budget callout. Rebuild with measured text flow and pagination; do not reproduce that layout defect.
- The current renderer uses a single-column, minimal editorial treatment and generic service pages. Sharing the burgundy/gold palette alone does not constitute a visual match to the original.
- The reference has twelve pages because of this particular event scope. Future proposals should include only relevant approved sections and expand or contract based on actual content.

## Implementation sequence recorded during initial comparison

1. Add structured menu groups, inventory, staffing, deliverables, milestones and checklist fields; bind approved service-specific scope changes to vendor and commercial reapproval.
2. Expose the same fields in web and native staff/customer experiences. Avoid independent pricing or approval logic in either frontend.
3. Add reusable PDF blocks for cover, overview table, adaptive image/menu grids, inventory, scope allocation, milestones and checklist. Preserve selectable text and dynamic pagination.
4. Add an ornate wedding visual theme alongside the existing editorial direction; keep non-wedding layouts appropriate to their event type.
5. Complete provider-backed AI concept generation and the generative proposal assistant as separately tracked capabilities. This comparison does not mark them implemented.
6. Verify actual structured content, option and permission states, pricing/milestone reconciliation, approval invalidation, long-content overflow, mobile readability, image provenance and sample wedding/birthday/corporate output. Produce a new before/after visual comparison once the revised renderer exists.

## What this review completes

The original reference is now available, its twelve-page structure has been inspected, and the missing-reference audit/comparison blocker is resolved. The implementation gaps above remain open. No claim of full handbook completion or reference-level visual parity is made.


## Implementation follow-up

The completion release implements the structured sections and forms mapped above, five visual themes, dynamically paginated PDF grids/tables, Core payment reconciliation and confirmation gates, native parity, generative snapshot questions and durable image jobs. The initial comparison table is retained as historical evidence of the original gaps. The new 12-page synthetic wedding and corporate documents were rendered and inspected. They are editable/selectable reconstructions, not flattened copies or pixel-identical reproductions of the supplied images.

The live Gemini image test remains blocked by HTTP 429 image quota; text generation succeeds. Concept jobs and failure handling are tested with synthetic adapters. Physical-device verification requires a device; no device was connected during this run. These external verification items are not marked complete.
