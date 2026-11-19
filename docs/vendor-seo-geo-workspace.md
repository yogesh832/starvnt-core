# Vendor OS SEO & GEO workspace

Implemented on `vendor-dev` in response to the 19 November 2026 attachment, “STARVNT — VENDOR SEO + GEO GROWTH INTELLIGENCE ENGINE”. Entry point: **Vendor OS → SEO & GEO growth**, `/vendor/seo`. Authenticated API: `/api/vendor/seo`.

## Product behavior

Each vendor gets a private, persistent workspace backed by its own VendorSeoWorkspace record. No workspace is created merely by viewing the page. Saving uses an atomic vendor-and-revision condition; stale saves return 409 instead of overwriting newer work. The existing authenticated Vendor organization ownership gate applies to every endpoint. There is no client-selected vendor ID.

The workspace includes evidence with source URLs, dates, business-identity attestations and public-use rights; research with explicit observation/estimate/recommendation/needs-data labels; editable content drafts; manual, sourced measurements; and 30/60/90-day tasks. It exports a 20-part individual growth pack with missing sections marked NEEDS DATA. It retains the last 100 save/review events.

Basic draft proposals use only evidence whose identity and public-use rights the vendor confirmed, with a source and observation date no older than 180 days. Required facts are business name, category, offered services and actual service areas. This is deterministic drafting, not an LLM integration. The system does not infer credentials, prices, years of experience, image contents, FAQs, ratings or website ownership. A vendor attestation is explicitly distinguished from independent verification.

Human review is a separate action on a saved revision. It requires the evidence prerequisites, title, description and a confirmation that claims and rights were checked. Changes to evidence, research or content clear review. A changed business snapshot or stale required evidence invalidates it on read. Review is an internal review of a private draft, not publication approval or certification that every research task was completed. No endpoint publishes a public profile, adds schema to a public vendor page or edits an external listing.

No owner email, phone, identity-document contents, financial profile or customer record is projected into the profile snapshot or generated drafts. Public source links are validated HTTPS URLs; the server does not fetch them. Manually entered evidence/content remains private and must be checked before any later public export. API responses are no-store.

## Requirements coverage

| Attachment phase | Available in this section | Work that needs real evidence or a separate integration |
| --- | --- | --- |
| 1. Complete database audit | Current vendor profile snapshot, completion, service/portfolio counts, gaps; identity/provenance research ledger | Platform-wide population/account linkage/duplicate audit is an authorized admin operation, not exposed to vendors. Prior audit artifacts remain private, not copied into the repository. |
| 2. Individual research | Dated source ledger; identity matches/rejections, actual service areas and observations | Research must actually be conducted. No candidate website is automatically assigned by matching its name. |
| 3. SEO | Keyword research by language/location, technical findings, title, description, H1/H2/H3, services, locations, FAQs, alt text, canonical and links | Search demand/rank/volume require trustworthy measurements. Keyword candidates are not measured demand. |
| 4. GEO | Entity evidence, AI discovery research, original portfolio/experience evidence, FAQs and source records | No automatic claims that Google, Bing, ChatGPT, Gemini or Perplexity recommends a vendor. |
| 5. Local SEO | GBP/local ledger covers eligibility, identity, categories, service areas, NAP, photos, hours, reviews and duplicates | External listing edits require separate vendor authorization and a supported connector. |
| 6. Competitors | Competitor comparison records with geography, language, source, observation date and evidence basis | Researchers must identify 5–10 relevant competitors where available; no synthetic competitors, traffic or rankings. |
| 7. Individual growth pack | All 20 named outputs appear in Reports and the JSON export; empty research/content sections show NEEDS DATA | Recorded entries are not automatically considered complete or independently verified. |
| 8. Platform architecture | Dedicated ledger and checklist for URLs, slugs, redirects, category/service/location/editorial pages, breadcrumbs, sitemap, canonicals, indexing and supported schema | This release does not mass-publish new pages, migrate slugs or remove private-route noindex. |
| 9. Automation | Missing-field/readiness checks, evidence-based basic draft, manual human review, stale evidence handling, export and recommendations ledger | Autonomous research, AI copy generation, publishing and scheduled monthly delivery are not implemented or claimed. |
| 10. KPI dashboard | Per-vendor readiness and manually sourced monthly measurements with dates, value and basis | Search Console/Analytics are explicitly NOT CONNECTED. Platform CEO aggregates, automated index coverage and organic booking attribution need authorized integrations. |

The 61-record audit from 17 November is historical and included seed/QA candidates; it is not reclassified as 61 verified commercial vendors. It reported no independently confirmed external identity at that time. No prior internal inventory, contact JSON or vendor pack is bundled into public assets.

## Measurement and score rules

SEO/GEO/local readiness is a transparent checklist completion percentage. Profile completion is a separate seven-field measure. Neither is a ranking, search visibility measurement, AI endorsement or revenue forecast. Research records do not certify phase completion. Observed KPIs require a metric, source URL and date range; unavailable values remain blank, including the difference between zero and unavailable. Vendor and platform totals must not be mixed.

Search Console, Analytics and automatic enquiry-to-booking attribution are not connected in this release. Do not display hypothetical impressions, CTR, indexed-page counts, enquiries or conversions. A monthly report is recorded manually with a source and period, then included in the export. No recurring external notification has been created.

## CEO decision framework and future admin dashboard

1. Ready vendors: require genuine identity/provenance, usable service/location evidence, completed source research, reviewed unique copy, publication permission and technical eligibility. A reviewed private draft alone is insufficient.
2. Needs information: aggregate explicit missing-field/stale-evidence flags; keep pending, suspended, incomplete, seed/QA candidates and account-only records visible to authorized staff.
3. Strongest opportunities: assess verified service supply, demonstrated differentiation and measured relevant demand, rather than data completeness alone.
4. Category opportunity: use authorized keyword/query and conversion evidence by category; no unsupported category ranking.
5. Location priorities: compare real service coverage, demand and qualified enquiries; do not prioritize from seed-heavy record counts.
6. Automation: evidence capture, draft proposals, review lifecycle and safe exports are present. Provider research/measurement ingestion, publication, admin aggregation and monthly scheduling need a separately implemented workflow.
7. First 30 days: resolve provenance/duplicates, confirm actual business identity and public-use rights, connect authorized measurement sources, complete individual research and select an approved pilot.
8. Commercial attribution: preserve original organic landing/referrer with consent-aware enquiry IDs, link qualified enquiries to quotes and verified paid bookings, deduplicate payment events and report cancellations/refunds separately. Do not equate clicks or unverified booking intent with revenue.

Future admin dashboard totals must scan the complete confirmed population, include skipped/incomplete records in denominators, distinguish organizations from accounts and expose data-coverage limitations. No vendor may see another vendor's private workspace. Admin reporting must use existing RBAC and audit logging, not a vendor-query override.

## Verification

Backend tests cover input/source validation, missing vs zero metrics, evidence freshness, owner/tenant isolation, privacy allowlisting, read-only GET, draft proposal without persistence, atomic concurrent saves, review invalidation, safe export and no public organization mutation. The production browser harness covers evidence entry, persistence, drafting, human review, research, JSON download and 320/390px light/dark layouts. The Vendor lazy chunk and existing delivery budgets remain enforced.

## Authoritative sources reviewed 19 November 2026

- [Google generative AI search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [LocalBusiness structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Google Business Profile representation guidelines](https://support.google.com/business/answer/3038177)

Useful, accurate public information and supported visible-content schema underpin discovery. Special AI markup is not a substitute for this, and appearance in search or AI answers is not guaranteed.
