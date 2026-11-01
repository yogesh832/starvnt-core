# Proposal Studio integration audit

Source: main (5).pdf, 29 pages, supplied by the user on 2026-11-01. The user authorized the best placement; customer event workspace plus mobile is the selected entry point.

## Existing architecture

CustomerEvent and EventRequirement already own customer-confirmed event data. AuraContext is explicitly advisory. Opportunity.customerEvent links vendor Quote records to events. CustomerQuote is a separate customer selection estimate and is not evidence of vendor agreement approval. CoreBooking owns booking/payment truth and must not be mutated by proposal acceptance. Existing CustomerContractDocument stores uploaded contract references but has no vendor agreement approval lifecycle. Existing library PDF generation is a one-page text writer, unsuitable for premium paginated proposals. Admin authentication and permission gates already exist.

## Integration decisions and dependencies

1. Reuse events, requirements, vendor quotations, identity domains, authenticated downloads, and customer notification records.
2. Add one proposal dossier per event, with append-only immutable versions, explicit vendor agreement evidence, commercial review, audit entries, and customer changes. There is no existing equivalent approval engine to reuse. A submitted quote alone never counts as an approved agreement.
3. Bind agreement and commercial approval to a deterministic source fingerprint. Event/scope/quotation changes invalidate generation. Regeneration creates a new immutable version; exact-version decisions are conditional writes.
4. Customer projections include only customer-facing prices and terms. Vendor costs and internal commercial comments remain admin-only.
5. Keep proposal approval independent of reservation, booking, payment and settlement transitions.
6. Add customer event proposal, staff Proposal Studio, vendor agreement review, and mobile proposal screens.
7. Use modular A4 PDF rendering, searchable text and accurate image provenance. Only authorized uploads are eligible for document imagery; missing assets block image-rich final delivery rather than silently substituting fabricated visuals.
8. Existing Aura conversation remains the requirement collection entry point. Proposal-specific explanations must use exact approved snapshot data. New image-provider calls require separate configured provider access; no keys are created or read during this audit.

## Reference limitations

The supplied handbook describes the twelve-page visual reference but does not contain the actual twelve-page customer proposal. Typography, colors, section mapping and dynamic composition can follow the handbook; an exact before/after visual comparison requires that original reference. No AI concept can be labelled as actual event photography.

## Verification plan

Ephemeral database API tests for ownership, domain isolation, agreement expiry/rejection, missing commercial approval, reconciliation, stale source, immutability, idempotent generation, exact-version customer decisions and booking independence. Production web build and browser journeys for customer/staff/vendor entry points. Mobile TypeScript and bundle checks. Render representative PDFs with Poppler and inspect all pages before delivery.

## Rollout and rollback

Additive collections and routes; existing booking/payment behavior is unchanged. Roll back application commit to remove entry points; preserve proposal records and approval audit history. Do not delete or rewrite historical approved versions.

## Implemented customer and staff experience

- Customer Home and event workspace link to My Event Proposal, with preliminary status and real manifest requirements even before a final document exists.
- Staff Proposal Studio can save scoped services, customer allocations, terms, roadmap and licensed image references/uploads; request agreement approval; review commercial terms; generate and deliver an immutable PDF; inspect history and access records.
- Vendor Agreements in web and native mobile shows the saved customer service scope and vendor terms. Only the matching authenticated vendor organization may approve, reject or request revision. A rejected agreement can be superseded by a revised agreement while preserving the earlier decision.
- Core reuses activation policy to verify current matching eligibility and canonical service categories. Agreements are bound to event/source and exact service scope fingerprints. All applicable agreements, not just one per category, must pass the final gate.
- Commercial approval uses the saved reconciled customer allocation, total, terms, current source and required agreement decisions. Internal vendor cost cannot exceed the approved customer total. Internal costs, margin review notes and approval evidence are omitted from the customer projection.
- Finalization freezes event/requirement data and customer-facing content. The exact PDF bytes and SHA-256 digest are persisted separately from version metadata. Secure downloads verify the stored digest. Previous documents remain unchanged.
- Customer version-specific approval/decline/change requests require current source, valid approvals, current version and revision. Accepting a proposal never writes a booking or payment. Change requests invalidate commercial approval; scope changes also require renewed vendor agreements.
- Customer proposal guide returns inclusions, exclusions, customer allocations and payment terms directly from the current approved snapshot. It does not independently change business state.
- Android/iOS screens mirror customer review, PDF sharing, guide, change requests and decisions, vendor agreements and the staff editor/approval/generation workflow. Notification destinations open the matching native screens.

## Limits and unfinished handbook capabilities

This is a working Core-backed Proposal Studio release, not completion of every aspirational capability in the 29-page handbook. Automatic AI image generation and visual theme exploration have not been connected to a provider. Uploaded AI concepts can be included with accurate provenance. The proposal guide is a deterministic snapshot reader, not a new generative conversation model. The existing Aura conversation remains available for event planning.

The exact original twelve-page customer reference was not supplied. The renderer follows the supplied editorial direction and produces relevant service sections dynamically, but no exact before/after comparison against that original is claimed. Advanced specialized visual blocks (venue layout drawings, catering menus, equipment inventories and theme-specific layouts) currently use the approved service descriptions and images rather than dedicated specialized editors.

Production vendor eligibility is checked through the existing activation policy; proposal generation does not reserve capacity or replace the authoritative booking-time availability check. No production customer agreement, commercial approval, proposal, payment or booking was fabricated. Native source and bundle exports do not update an already installed APK/IPA; distribution needs a subsequent mobile release.


## Completion implementation - 2026-11-01

The original 12-page reference has now been supplied and reviewed. The earlier limitations above describe the first release. The implementation now includes shared structured menus/choice groups, furniture and equipment inventories, staffing, deliverables, design galleries, normalized venue layout drawings, timelines, payment milestones, internal cost review and evidence-backed confirmations. Web and native screens edit and display the same Core-validated fields. Structured service, visual-direction and referenced-image changes invalidate vendor scope approvals; all content changes invalidate commercial approval. Customer visual preferences are requests requiring staff review, not automatic approved scope.

The PDF renderer reconstructs selectable text and dynamic tables, grids and vector layouts. It supplies Royal Reception, Bengali Traditional, Corporate Premium, Contemporary Minimal and Soft Ivory Editorial themes. The ornate themes use burgundy, cream, gold and decorative floral motifs. Original client details and commercial examples are not production defaults, and the source's overlapping page-12 text is not reproduced.

Gemini-backed proposal answers now reuse the existing Aura adapter with approved snapshot context, version-specific conversation history, guarded monetary/state claims and a deterministic outage fallback. Suggested changes are prepared for explicit customer submission; the model cannot mutate Core approvals, prices, bookings or payments. Provider context excludes internal cost and agreement evidence.

Durable, idempotent concept jobs use the existing Gemini key and Cloudinary storage, with permission gates, queue limits, explicit retries and mandatory AI labels. A real local provider check succeeded for text using gemini-3.5-flash-lite. The real image call to gemini-3.1-flash-image returned HTTP 429; image generation therefore remains externally blocked on that project's quota/billing. No additional key is requested. All automated image-path tests use explicit synthetic adapters and do not claim live provider success.

Reference-derived rich wedding and corporate QA samples each render to 12 pages, with dynamic pagination rather than a fixed page count. Samples contain synthetic identities, prices and illustrations. The full browser journey now includes customer theme requests, staff review, concept queue/import, structured content, evidence, milestones, vendor approval, final generation, download, change requests and exact-version approval.

A connected physical device was not found. Native TypeScript, tests and bundle exports are verified separately; the proposal-preview EAS profile prepares an internal Android APK using the existing production environment and signing credentials without store submission. Physical-device verification remains a user/device step.
