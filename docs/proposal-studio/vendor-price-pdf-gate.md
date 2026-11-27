# Vendor price before PDF generation

Customer development integrates upstream Proposal Studio preview commit `91d5262` with a server-side vendor-price prerequisite.

A preliminary PDF requires at least one current submitted or accepted vendor quote with a finite positive total, linked to this customer's event through an opportunity or a vendor agreement. Its category must be one of the event's chosen services. A customer budget, catalogue/selected-option estimate, draft quote, zero total, rejected quote, expired submitted quote, another customer's quote or an unrelated event's quote cannot unlock generation.

The check runs before customer preview creation, direct preliminary-version creation and actual PDF rendering, including worker retries. Rendering rechecks current evidence so a withdrawn or expired quote cannot use an earlier successful request to bypass the rule. Missing prices return `409 VENDOR_PRICE_REQUIRED` without generating a PDF.

Preliminary documents remain watermarked and cannot be approved. They do not disclose unapproved vendor prices. Final documents retain the existing vendor-agreement, commercial-approval and reconciliation checks. Published historical documents are retained.

The proposal card is available on draft, active and past-event pages without removing existing Customer navigation, guided planning, event records or library links. Each preview caller is authorized before joining an in-flight build for an event.

Regression coverage is in `server/test/proposal-preview.test.js`, alongside existing Proposal Studio, demo, assets and Phase 0 suites. Synthetic priced fixtures preserve the existing PDF watermark, asset and customer-price confidentiality assertions.
