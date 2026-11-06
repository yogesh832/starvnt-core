# Customer theme and feedback correction

The landing page must match the approved starvnt.com design. The local customer and freshly fetched origin/customer references are older than the live landing. Landing.jsx, landing.css and missing celebration/corporate images come from codex/customer-landing-production (cff1892), whose content matches the live landing. Dialog keyboard focus, Escape dismissal, focus restoration and planning intent are preserved.

Customer Home and event context now use blue/sky actions, blue surfaces and shared sans-serif typography. Customer screens contain no phase or sample-server messages.

Feedback uses the existing customer-authenticated API and CustomerFeedback MongoDB collection. GET restores the saved choice; POST validates ownership and rating and upserts one response per customer/kind/reference. Admin Product outcomes shows the latest 50 responses through a reports/analytics permission-protected endpoint and retains aggregate satisfaction metrics.

Validation: 87 web tests, production web build, two feedback integration tests using MongoMemoryServer, browser submission of 4/5, reload persistence and the matching response/aggregate in Admin Product outcomes. The review runtime uses dedicated persistent local MongoDB databases. No production records or deployment were changed.

Local review runtime uses ignored tmp/customer-review-server.mjs and tmp/customer-review.vite.mjs. Start the server with Node and Vite with the latter config; open http://127.0.0.1:5182/__review. This uses regular password login, application sessions and the actual API. Developer auth is disabled. No provider credentials or background workers are configured in this runtime.
