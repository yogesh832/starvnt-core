# Vendor OS help routing

The Vendor OS chat has a first-party product knowledge base in `server/src/external/aura/vendorKnowledgeBase.js`. It currently contains 58 task-specific answers across Dashboard, Profile, Services, locations, Portfolio, Availability, Enquiries, Quotes, Bookings, Payments, Reviews, Documents, Business Readiness, Messages, Updates, Analytics and Settings.

## Routing

1. Existing confirmation and location-selection flows run first. A pending confirmed action keeps its existing validation and idempotency checks.
2. Vendor-owned operational records are checked by `activityAnswer`. Answers about saved statuses or amounts come from those records, not static knowledge text.
3. Routine product-help questions match the local knowledge base. The model adapter is not called. The response is labeled `STARVNT Help · product guide`, and its `source` is stored with chat history.
4. Requests to review a case, carry out work or recommend a next step are handed to Aura immediately. A short reply inside an active Aura setup dialogue stays in that dialogue.
5. An unmatched routine question receives a clarification request. It is not sent to Aura solely because the catalogue lacks a match.

This is an immediate handoff, not a background job queue. Existing session messages are retained in the vendor-scoped conversation history.

## Keeping the catalogue accurate

Add an answer only when the corresponding feature exists in Vendor OS. Keep navigation links to known `/vendor/...` pages, and describe a workflow without inventing vendor-specific status, prices, tax rates, settlement dates or performance statistics. A change to a product workflow should update its guide and the matching test in the same change. For a live case, prefer the vendor-owned record or Aura review over a static answer.

Current guides are English product instructions. Hindi and Bengali unmatched questions receive localized clarification; expanding the catalogue into those languages needs reviewed translations rather than machine-generated claims.
