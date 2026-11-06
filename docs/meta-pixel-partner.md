# STARVNT Partner Meta Pixel

Pixel: **1694475908953355**. Intended deployment: **https://partner.starvnt.com**, using the production-main command `npm run build -w web` (`web/dist`). Production main already declares `PORTAL_SURFACE = VENDOR`; this integration uses that existing constant and excludes admin hosts. The customer development branch is not part of this release. No new dependencies, secrets or environment variables are needed.

## Implementation

`web/src/lib/metaPixel.js` owns one tracker per document. It uses explicit asynchronous Meta image-tag requests to `https://www.facebook.com/tr/`, rather than loading `fbevents.js` into the authenticated application. This gives the application control over the complete outgoing URL and avoids automatic form/DOM collection, advanced matching and SDK history listeners. There is deliberately no `fbq` global, script tag, or unconditional noscript beacon. Pixel Helper compatibility and actual Meta acceptance must be checked after deployment; unit tests verify constructed requests, not Meta ingestion.

`PartnerMarketing.jsx` handles SPA visits, consent controls, support links and delivery of claimed backend milestones. A zero-delay visit effect suppresses React StrictMode remount and redirect duplicates. Known vendor section names replace private route IDs. Query strings, fragments, document referrers, form values, names, email addresses, phone numbers, auth tokens, OTPs, search text and portfolio contents are never placed in event payloads. Requests use `referrerPolicy=no-referrer`.

The `VendorAcquisition` collection stores a bounded first-achievement journal alongside existing operational evidence. Each milestone has an opaque UUID, original evidence time and optional claim time. It does not store advertising identifiers, personal contact information or Meta credentials. It is separate from VendorOrganization so analytics cannot invalidate optimistic approval-review timestamps. Existing accounts establish a baseline without historical conversions. Accounts created through real auth receive a new journal; development auth is excluded.

Backend evaluation can discover persisted achievements even when the vendor is offline. Submission and approval use actual activation history; approval is recorded by the evaluator called from the existing admin review service. Portfolio timestamps come from saved portfolio records. Recording these operational facts does not contact Meta. Analytics failures are caught so they cannot reject authentication, readiness or approval operations.

## Event mapping

| Event | Trigger |
| --- | --- |
| PageView | Initial rendered public/vendor page and subsequent client navigation, after consent |
| ViewContent | Rendered landing, signup or registration page, after consent |
| VendorRegistrationStarted | First registration input or email/phone/Google registration initiation, after consent; one per browser-session intent |
| CompleteRegistration | Backend creates an account and vendor organization and issues a successful auth session; includes password, Google and phone/widget OTP creation branches |
| VendorLogin | A successful explicit auth session for an existing vendor; excluded from refresh, identity restoration and surface switching |
| VendorOnboardingStarted | First saved meaningful profile, service, capability, location or portfolio evidence; default working hours alone do not qualify |
| VendorBusinessInformationAdded | Saved business name, category and operating city satisfy the backend profile rule |
| VendorProfileCompleted | Backend profile checklist passes; the operating profile still has separate onboarding requirements |
| VendorPortfolioUploaded | First portfolio item is saved successfully, not an upload button click or temporary asset upload |
| VendorOnboardingCompleted | All six operational steps reach 100% in the existing readiness evaluator |
| SubmitApplication | Actual SUBMITTED activation history exists after the application is accepted |
| VendorVerified | An actual approved activation review with ACTIVE backend status; dashboard visits and KYC-only status do not qualify |
| Contact | Existing WhatsApp/phone support or support email link initiation; channel only, no destination or message content; double clicks suppressed for two seconds |
| Search | Successful existing project-location search API response; consecutive identical searches deduplicate; no query or result contents sent |

Production main retains its existing public landing page at `/`. Redirect-only locations do not count as extra rendered visits. Profile/business events measure the existing brand/category/city rule; onboarding completion measures the distinct six-step checklist. Identity/bank verification and authorized activation remain separate business controls.

## Consent, attribution and deduplication

The initial choice is no marketing. The global banner offers equally accessible allow/reject buttons. The persistent **Marketing privacy** button permits revocation. Decisions are versioned and expire after 90 days on this browser. GPC and Do Not Track override permission. No Meta requests, marketing cookies, persistent attribution or registration-intent storage are created before permission. Landing attribution remains only in memory while the choice is pending. Rejection discards it; a later grant cannot resurrect that rejected click. Existing notification and growth preferences control different purposes and are not reused as ad-tracking consent.

After permission, allowlisted numeric `campaign_id`, `adset_id`, `ad_id`, `utm_id`, recognized `utm_source`/`utm_medium`, and a validated `fbclid` persist locally for up to 90 days across registration and onboarding. Free-text campaign names are omitted. `_fbp` is reused or created; `_fbc` is reused or derived only from an actual validated click ID. A new ad landing updates click attribution. Attribution is host-local, not transferred to other portal domains. Revocation stops subsequent dispatch, cancels pending image sources and removes attribution and Meta cookies, including legacy parent-domain variants. Already dispatched requests cannot be recalled.

Recommended Meta ad URL parameters:

```text
utm_source={{site_source_name}}&utm_medium=paid_social&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}
```

Meta normally appends `fbclid`; do not fabricate one for live campaigns.

Atomic conditional journal writes create each funnel milestone once. The authenticated, ownership-checked `POST /api/vendor/acquisition-events/claim` returns each eligible UUID only once across tabs, devices and retries. Only achievements at or after the browser's current consent timestamp can be claimed. Browser receipt IDs additionally deduplicate in memory and in a bounded 90-day local ledger; Web Locks serialize concurrent tabs when supported. The current page and consent are checked again at dispatch. Registration-start IDs use session storage. Repeated acceptance does not create another consent period or PageView.

Delivery favors **at-most-once dispatch**, not guaranteed delivery: an ad blocker, lost claim response, closed page, revocation during a request or network failure may lose an event. Claimed conversions are not resent because image delivery cannot prove Meta ingestion. This avoids false duplicate conversions. PageView on a genuine full reload is an additional visit; a conversion on that reload is not. Clearing storage can reset anonymous engagement deduplication; backend funnel claims remain durable.

Authenticated vendor pages check for new achievements on mount, after successful vendor mutations, every 30 seconds while visible and on returning to the tab. An approval while offline is delivered only when that vendor returns with valid consent. There is no server-to-Meta delivery, background approval guarantee or cross-device attribution handoff.

Conversions API was evaluated and left optional. The server can support an outbox/CAPI integration, but no Meta token or server-side marketing-consent/attribution contract exists here. Future CAPI must use the same journal event UUID as `event_id`, the corresponding event name, properly scoped consent, server-only credentials and an explicit delivery/retry policy. Do not simply send all operational journal rows.

## Verification and release checks

Automated coverage:

- Browser transport: initial/SPA/return/refresh visits, duplicate receipts, rejection/acceptance/revocation, consent expiry, cross-tab rejection, browser opt-out, blocked storage, unavailable Meta transport, safe route labels, sensitive parameter exclusion and attribution cookies.
- MongoDB + HTTP integration: real account creation and duplicate registration failure, failed/successful login, restoration without login conversion, failed/successful profile writes, rejected portfolio save and application submission, saved portfolio/readiness evidence, six-step completion, accepted/repeated submission, real admin approval and approval retry, concurrent achievement/claim races, legacy baseline, auth-provider classification, and pre-consent achievement timestamps.
- Full existing web and backend suites, customer/vendor production builds, and whitespace checks. This repository has no configured lint script.

Before declaring production delivery verified:

1. Deploy backend plus the existing production-main frontend artifact to the partner/vendor host. The existing main AWS workflow builds and deploys `web/dist`; no customer deployment or workflow changes are included. Do not install a second Pixel through GTM, Meta's automatic setup, another SDK or a hosting injection.
2. Confirm the unique `vendor` index exists on the VendorAcquisition collection (Mongoose schema declares it). If the production database disables automatic indexes, create this index during deployment.
3. Publish the approved privacy notice. Review the existing production privacy page for Meta measurement, cookie and data-transfer disclosures; the consent panel does not replace the full legal notice. Confirm notice wording, retention and data-transfer requirements with the responsible owner.
4. In Meta Events Manager, confirm this Pixel is owned by the intended business/ad account and allow `partner.starvnt.com` in traffic permissions. Check domain verification and configure desired custom conversions/campaign optimization for profile, onboarding and verification events. Keep automatic advanced matching and automatic event collection off.
5. Use Meta Test Events' browser website-testing flow and, where compatible with image-tag Pixels, Pixel Helper. There is no `fbq` console test API. Inspect browser Network requests to `facebook.com/tr/`: verify `id=1694475908953355`, event names, sanitized `dl`, empty `rl`, opaque `eid`, and no credentials or contact data. Image `onload` or HTTP success is not proof of accepted attribution or Events Manager ingestion.
6. Start with a fresh consenting test vendor. Complete real email/Google/OTP registration as available, login, profile, actual media upload/save, all six steps, submission and authorized approval. Keep the vendor tab visible or reopen it after approval. Confirm each funnel event appears once in Test Events. Test actual upload-provider failures and actual identity providers in the deployed environment; automated fixtures do not validate those external providers.
7. Repeat failed registration/save/upload/submission, repeated clicks and API retries, refreshes, back/forward navigation and two open tabs. Verify no false or repeated milestone conversions. Test support links and location search without sending form/query/destination contents.
8. In a fresh browser reject marketing and confirm zero Meta requests. Accept, verify permitted requests, revoke and confirm no subsequent requests. Confirm privacy signals override permission and cross-tab rejection stops dispatch. Test mobile banner layout and keyboard access against the deployed UI.

Local verification does **not** establish production deployment, Pixel Helper compatibility, Meta event acceptance or campaign attribution. No production account actions or live vendor approvals were performed by this implementation task.

### Local results — 2026-11-06

| Check | Result |
| --- | --- |
| `npm test` | 83 backend tests passed, zero failures |
| `npm run test -w web` | 34 web tests passed, zero failures |
| `npm run build -w web` | Passed |
| `git diff --check` on integration changes | Passed |
| Lint | No lint script configured in the existing packages |
| Production / Meta Test Events / Pixel Helper / external auth and media providers | Not verified in this task |

The builds retain the existing large-bundle warning; this integration adds no dependencies. Automated browser checks use a captured image transport rather than contacting Meta. Backend tests use MongoMemoryServer and the application's real HTTP routes/readiness/review services. Google/OTP classification tests cover the shared receipt helper; they do not exercise live provider credentials.

Release validation used a clean worktree based on production main (`cbffabc`), with only the 13 Meta Pixel integration files ported. Existing installed packages were reused after confirming all 25 direct server/web dependency versions match production main's lockfile. The production workflow performs its own clean install. No customer-development, proposal, deployment-workflow, package-manifest or lockfile changes are included.
