# Backend regression review — customer branch

The eleven failures reported from production `main` were investigated on
`customer`. The integration suites have been restored from `main` and adapted
to the current catalogue and bank verification flow. No production code, DNS,
or hosting configuration is changed by this work.

| Reported failure | Resolution on customer |
| --- | --- |
| Aura chip validation / model failure | Exercise an actual model call when testing an outage. Report provider unavailability honestly, preserve literal fact extraction, and test that simple facts skip the model without a false outage. |
| Refresh of legacy wrong-tab vendor session | Rotate using the user's primary database account type. Existing access tokens also obey that account type. |
| Ops payment verification history | Assert the booked vendor's stored name instead of an obsolete demo vendor name. Key, operator, and idempotency checks remain. |
| Event Circle contexts and messages | Assert names from the confirmed booking. Keep thread isolation and ownership checks. |
| Google login on the wrong portal | Sign in an existing identity using its database account type, without provisioning a vendor organization. Historical roles cannot change the surface. |
| Switching customer to vendor | Reject a different surface with `403 ACCOUNT_TYPE_MISMATCH`; do not convert the account or create vendor data. Same-surface requests still work. |
| Quote snapshot / price changes | Derive the expected initial price from the selected catalogue fixture; verify subsequent catalogue changes cannot alter the saved quote. |
| Demo seed idempotency | Upsert only missing external references. Preserve document IDs and existing edits, delete no listings, and continue refusing production. |
| Discovery option counts | Count the current demo fixtures plus eligible real services instead of assuming an old catalogue size. |
| Demo details and ownership | Check the explicit demo flag and current development-only label; retain unknown-option and cross-customer denials. |
| Vendor without GST / bank verification | Expect zero transfer amount for penny-less verification in both response and audit log. Keep settlement and activation checks. |

Run `npm test --workspace server` and `npm test --workspace web` from the repository
root. Integration tests start a disposable local MongoDB instance using
`mongodb-memory-server`; its binary may be downloaded on the first run. The
harness replaces both database URIs before importing application configuration
and refuses a non-loopback test database. AI, payment, and bank verification
calls in these suites use scripted adapters or test mode.

The main branch and AWS deployment are not updated by these customer-only fixes.

Validation on 2026-10-23: all 195 backend tests and 22 web tests passed, with
zero failures, skips, or pending tests. `git diff --check` passed.
