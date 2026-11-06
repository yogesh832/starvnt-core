# Customer experience — Phase 3A existing-record libraries

Date: 5 November 2026 (Asia/Calcutta). Status: implemented locally following the instruction to continue. This covers the existing Messages, Documents and saved-option foundation; broader collection/storage contracts and staging acceptance remain open.

## Customer behaviour

- Documents is now an event-linked library with event/type filters, search, source/status/date information and exact proposal versions. Event workspace and Home link to relevant records, including completed-event records. Scoped Documents, Saved items, Updates and Proposals URLs also determine the header's event context; an inaccessible event cannot fall back to another event.
- Sent proposal PDFs appear in Documents without copying or rebuilding them. Download checks ownership, SENT visibility and the stored PDF hash, then returns the original frozen bytes. Existing proposal review/discussion remains the approval route. A proposal approval or saved contract link is not agreement acceptance or payment authorisation.
- A browser-reported `paid` payment cannot issue a downloadable receipt. Verified receipts remain available; pending verification is visible. Invoice list/download now apply the same existing eligibility rule: an issued invoice number or provider-verified Core payment. No commercial amounts or financial rules changed.
- The existing contract-link workflow remains available with explicit event association, HTTPS URL validation, accessible labels and visible errors. Files open as external saved links without forwarding the STARVNT bearer. There is no new uploader or private storage service. The linked file owner still controls access. Existing insecure/credentialed links require a secure replacement.
- Saved items distinguishes customer-saved snapshots from selected event options. Saving a vendor no longer hides the same option selected in another event. Filters cover event, global references, saved/selected source and search. Selected rows remain non-removable here; changing a selection uses the existing event plan.
- Service details now has an explicit Save for later action through the existing Favorites API. Saving does not select, enquire, book, subscribe or notify a vendor. Customers can select 2–4 options from one service for an explicit event-scoped comparison using the existing comparison API. Current availability/pricing is rechecked when an option is opened; snapshots are not presented as live availability.
- The existing customer+option unique key is preserved. Repeat saves of the same option in the same scope update one record. A different scope returns a visible conflict, including concurrent first saves, instead of silently moving the saved reference. Independent copies of an option across collections require the separate migration below.
- Updates supports event and activity-category filters, exact saved destinations, source-identity deduplication, read/unread status, timestamps and communication-preference access. Transactional, operational, Aura and promotional categories use explicit record types. Matching message text from different events is not treated as the same source.
- Read failures and removal/download failures are visible. An update becomes read locally after server acknowledgement. Opening an original vendor conversation uses its original thread and saved messages. Closing refreshes saved read state. The shared loader now supports functional data updates correctly.
- Conversation dialogs have an accessible name, keyboard focus containment, Escape dismissal and focus restoration. Filters and controls have labels, visible focus and 44px targets; mobile inputs use 16px text. Existing uploads, conversations, notification preferences and consent/quiet-hour dispatch rules remain in place.

## API and data contract

| Existing API | Addition/correction | Ownership and effects |
| --- | --- | --- |
| `GET /api/customer/documents` | Optional `eventId` and `type=receipt|invoice|contract|proposal`; source/version/immutability metadata; proposals projected from existing SENT records | Customer and source ownership; invalid/inaccessible event 404, unsupported type 400; read-only |
| `GET /api/customer/documents/:id/download` | Supports `proposal_<id>`; consistent invoice/receipt eligibility; optional `delivery=link` for external contract targets | Exact proposal bytes/hash; source reauthorised per request; unavailable PDF/issuance/link 409, inaccessible source 404 |
| `POST /api/customer/documents/contracts` | HTTPS URL without credentials required; existing event/booking association retained | Existing owner checks; saves a link, not acceptance. Legacy creation has no new replay key |
| `GET /api/customer/favorites` | Selected options retained independently of saved snapshots | Reads owned events/requirements/saves; no commercial writes |
| `POST /api/customer/favorites` | Atomic same-scope keyed upsert with validation; cross-scope conflict `409 SAVED_SCOPE_CONFLICT` | Existing customer+option index; keyed same-scope replay updates one record. Unstructured saves without option IDs retain legacy semantics |
| `GET /api/customer/updates` | Adds saved source type/ID, channel and read timestamp | Existing stores and permissions; no delivery or consent changes. Filtering is local over the returned authorised projection |

Old API routes and unfiltered calls remain available. Native contract downloads retain the existing no-bearer target response. New web `delivery=link` responses open an HTTPS target with a separate browser navigation; they do not fetch arbitrary files through the backend. Native screens were not redesigned, and native consumers must handle stricter receipt/invoice/contract-link eligibility.

No schema, index migration, backfill, domain/cookie change, new chat store, provider integration or production deployment was performed. Existing mutable receipts/invoices remain generated views of saved records; only frozen proposal artifacts are labelled immutable. Missing issue dates stay unknown rather than using creation as an invented issuance date.

## Verification

- Web suite: **74 passed, 0 failed**. Covers library filtering, secure links, exact/same-event destinations, redirect rejection, source-based deduplication, explicit activity categories and library/header event isolation, plus earlier phase regressions.
- Server integration/regressions: **92 passed, 0 failed**, covering library ownership, issuance consistency, original PDF bytes/integrity, secure contract links, save replay/scope races, save-without-commercial-effects, source metadata and existing foundation/proposal/unified-product journeys. Vendor and missing-session denial are included.
- Connected Chromium: **39 checks passed**, with the actual Express app and disposable MongoDB replica set. Covers exact downloaded bytes, event filters, link creation, saved/selected distinctions, original conversation/read state, functional state updates, keyboard focus/Escape, Save for later and explicit comparison. Tests inject download/remove/read failures and one catalogue display fixture; saving still uses the real API. Nine screen/width combinations at 320/768/1440px verify reflow and matching header context. Zero page runtime errors; desktop/mobile screenshots reviewed.
- Customer and Partner production builds passed; existing Vite bundle-size warnings remain.
- Preservation: compared 692 original baseline files. Only 29 approved existing files across completed phases changed; no unrelated baseline changes or missing files. Added implementation/tests/records are separate. Existing dirty work was preserved and nothing was committed.

Evidence: `C:/Users/Hp/.codex/visualizations/2026/11/05/01a1aa05-b9ee-72e0-91b8-268175f49f33/phase3-dev/`, including pre-development diff, test/build logs, browser script/results/screenshots and preservation report. Tests used disposable local business records with no production DB, external file access, model/payment provider or live outreach.

## Remaining scope and release gates

The approved plan requires a duplicate inventory and migration review before replacing Favorites uniqueness. Named collections, independent per-event copies, and new service/package/quote/inspiration reference types are not represented as delivered. Current global and event-linked snapshots remain compatible. Large-library cursor pagination remains follow-up work; Updates retains the existing bounded projection and does not claim a complete account archive.

Private asset upload/quarantine, document signatures, additional immutable issuance types and storage revocation need their reviewed storage/legal contracts. Existing external contract links do not provide STARVNT-managed storage or access revocation. Real provider delivery, staging session/permissions, physical native devices and screen-reader acceptance remain unverified. Test catalogue display does not prove real supplier eligibility or live availability.

Rollback can restore the old web entry points while retaining documents, proposals, saved references, conversations and read markers. Do not delete accepted bytes or undo payment-verification/issuance safeguards as a presentation rollback. The saved-scope conflict can be reverted independently after reviewing how scope relocation would affect existing references; no data/index downgrade is required.

Next programme section is Account, Gallery and post-event experience, with private media work dependent on authorisation/storage contracts. The independent Vendor Partnership Agreement & Compliance Engine remains in scope. No new fee, agreement, reward, tax or settlement policy was introduced. Ticketing remains excluded and Experience QR feedback is preserved. This does not mark the complete Customer OS programme finished.
