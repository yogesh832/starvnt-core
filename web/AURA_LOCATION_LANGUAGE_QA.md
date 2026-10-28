# Aura location and language review — 21 October 2026

## Result

- Vendor Aura resolves English setup requests including “Help me…” and “How do I…” from user messages, overriding a previous assistant language mistake. Short price, date, city and yes/no messages retain the session language.
- Session language persists in the existing vendor Aura session. Deterministic save/cancel confirmations, setup questions and action summaries support English, Hindi, Roman Hinglish and Bengali. Feminine Aura language instructions remain in effect.
- Explicit location setup requests directly ask for the operating address and show the inline web map, without relying on an LLM to decide whether to redirect to Services. An existing pending location can be replaced by a new map selection request without saving it.
- The map uses the existing picker with a full-width search row for the narrow Aura panel. It allows search, pin selection and address/city review. There is no automatic GPS request in Aura. A default map center is not a selected business location.
- “Use this location” validates address, city and coordinate bounds and prepares a vendor-owned pending location. Saving still requires explicit confirmation. The selected coordinates and state survive execution; the old 0,0 coordinate override and invented West Bengal default are removed.
- Unrelated suggestion chips are hidden while a location picker is active, keeping space for the map on phones. Bottom navigation stays visible.

## Verification

Server tests cover language continuity for the reported Tent House transcript, literal script preservation, localized next-step questions, map-question detection, invalid coordinates, pending selection without business writes, confirmed coordinate persistence, verified settlement truth during provider outages and direct location routing. Existing server and web suites pass; production web build passes with the existing large-chunk advisory.

Browser checks used the existing local onboarding test account. English questions stayed English; Roman Hindi requests returned Roman Hindi questions and map copy. Public Kapkot place search, selected coordinates, editable address/city and confirmation UI were inspected. The initial English test proposal was cancelled. Browser history subsequently included a user-confirmed Roman Hindi location save with a Roman Hindi team/equipment follow-up; that record was not reset. Native map interaction is not implemented or verified by this web change; shared backend language handling applies to native requests too.

Screenshot: `tmp/qa/web-review/aura-inline-map.png` (390 x 844 phone-width web layout).

Quick Auto-Fill's development-only gate and future cleanup inventory are documented in `/DEV_SHORTCUTS.md`. The production bundle was checked for absence of its label, sample-data strings and handler error string; the helper was not executed.
