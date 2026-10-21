# Searchable vendor categories

Reviewed against STARVNT_CORE_Ultimate_Engineering_Directive.pdf (8 pages), 21 October 2026.

## Source coverage

Part 02 (page 2) explicitly requires these service identities to remain distinct:

| PDF services | Picker categories |
| --- | --- |
| Caterer / Decorator | Catering / Decor & Styling |
| Photographer / Videographer | Photography / Videography |
| DJ / Sound Vendor | DJ & Music / Sound & Audio |
| Venue / Accommodation | Venue / Accommodation & Hotels |
| Event Planner / Event Coordinator | Event Planning / Event Coordination |

All ten named services are available. The PDF does not enumerate a fixed 25-category vendor taxonomy; the expanded catalogue supplies 38 choices, including Other, to meet the requested broader coverage. Part 22 (page 6) describes separate future Shop product categories (wedding essentials, decor, stationery, gifts, celebration merchandise, photography accessories, fashion/jewellery, lifestyle and STARVNT exclusives). These remain a commerce preview, not a vendor-service or checkout implementation.

## Implementation

- Shared platform-neutral catalogue: `server/src/common/vendorCategories.js`. Existing original category display values remain supported; older saved custom values remain selectable.
- Web searchable combobox: vendor signup email/phone/Google flows, business profile, service form. Keyboard navigation, Escape, outside dismissal, keyword aliases, result count, no-results and Other fallback.
- Native searchable bottom sheet: signup, vendor profile, service form; safe area, keyboard handling, scrollable radio choices.
- Core discovery, service requirement normalization, capability definitions and guarded Aura extraction recognize every selectable category. DJs and audio vendors, photographers and videographers, planners and coordinators have separate identities. Unknown capabilities no longer silently receive Photography fields. New portfolio categories use a generic empty project template rather than photography demo content.
- No database migration, existing record mutation or production-main change.

## Verification

- Server: 124 tests passed; includes all-category normalization, PDF distinctions, search aliases and guarded Aura identity extraction.
- Web: 22 tests passed; production Vite build passed (existing large-chunk advisory remains).
- Native: 98 tests passed, TypeScript passed, Android Hermes export passed. Native device interaction was not exercised in this review.
- Browser: vendor signup at 390 x 844; 38 options, keyword pandit, keyboard Enter selection, unmatched query to Other, Escape, scroll and full-width field. Screenshot: `tmp/qa/web-review/vendor-category-picker.png`.
- Browser verification did not submit signup or alter a vendor record.

## Other service follow-up

Selecting Other reveals a mandatory manual service-name field in both pickers. It persists as `Other: <vendor-entered name>` in the existing category string, requiring no schema migration. Empty Other values are rejected by auth, profile and service API writes, and Aura service actions. Discovery maps these explicit custom services to other_service; capability handling remains generic. Aura asks for the actual service and only saves a custom profile category when the service words occur in the vendor message.

Follow-up checks: 125 server tests, mobile TypeScript, web build; browser verified required empty field and entered service text. Native device interaction remains unverified.
