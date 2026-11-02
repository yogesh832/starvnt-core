STARVNT portal login policy — 2 November 2026

This change is development work on `vendor-dev` and `customer-dev`. It is not a production release. `main` and `customer` remain unchanged.

| Stored primary account type | Customer OS | Vendor OS |
| --- | --- | --- |
| CUSTOMER | Allowed | Reject with customer dashboard login link |
| VENDOR | Reject with vendor dashboard login link | Allowed |

The database-owned primary `accountType` determines identity. Historical `roles` entries never authorize conversion to the other product. Wrong-portal attempts do not create sessions, issue access/refresh tokens, create vendor organizations, link a Google identity, update the password, or change the primary role. Existing matching accounts and new registrations still use their own product surface.

The shared backend checks password login, Google login, phone OTP, MSG91 widget tokens, email OTP request/verification, password setup/reset, duplicate registration, refresh and authenticated requests. A mismatch returns HTTP 403 with `ACCOUNT_TYPE_MISMATCH`, the stored account type, a readable message and a configured login URL. Password errors remain generic until credentials are verified. OTP request routes identify a wrong portal before sending a code, consistent with their existing account-existence responses.

Browser portal origin takes precedence over body/header role overrides. Custom configured portal hostnames are also recognized. Local and native clients declare the product through `X-Starvnt-Surface`; login payloads include the matching `accountType`. A shared backend request without any portal declaration retains legacy behavior, because the single API origin does not otherwise identify which product initiated it. Updated web and native clients always declare their portal. This is an additional restriction; database identity and existing endpoint authorization remain authoritative.

Web builds pin the login role to their product, including role query overrides, signup, Google and OTP. A saved opposite-role identity is cleared locally and displayed as a mismatch with a link. It is never converted using `switch-surface`. Native builds send the same fixed surface and reject opposite-role credentials before persisting them. Both login errors and restored-session errors provide the matching dashboard link. Native account navigation opens the other dashboard website rather than converting the account.

The affected verification paths also close existing authentication shortcuts: MSG91 widget identity must come from server-side provider verification, not a submitted phone number, success string or unsigned JWT payload. Mock Google/widget tokens and master phone OTPs are gated out of production even when a development flag is accidentally enabled. Live Google/MSG91 delivery still needs provider/device QA before release; synthetic tests do not prove provider credentials or device configuration work.

Configure trusted dashboard origins using these optional variables. Defaults are the STARVNT customer/vendor domains. For different production domains, set all applicable layers consistently; no DNS or hosting is provisioned by this change.

```dotenv
# Backend
CUSTOMER_PORTAL_URL=https://customer.starvnt.com
VENDOR_PORTAL_URL=https://vendor.starvnt.com

# Vite web (build-time public configuration)
VITE_CUSTOMER_PORTAL_URL=https://customer.starvnt.com
VITE_VENDOR_PORTAL_URL=https://vendor.starvnt.com

# Native app (build-time public configuration)
EXPO_PUBLIC_CUSTOMER_PORTAL_URL=https://customer.starvnt.com
EXPO_PUBLIC_VENDOR_PORTAL_URL=https://vendor.starvnt.com
```

Only environment templates are changed. Existing credentials and production environment files are untouched. Links use an absolute HTTPS origin, normalize the path to `/login` and remove queries/fragments. Loopback HTTP is permitted for local development. Invalid or unsafe protocols fall back to the default dashboard origin. No access token, refresh token, email or OTP is included in these links.

Regression checks cover both account directions, all affected authentication methods, session/token and account-mutation boundaries, browser origin overrides, disabled accounts, wrong passwords, protected API access, legacy saved sessions, native credential persistence, unsafe link protocols and production test-token rejection. Browser verification uses an isolated temporary MongoDB and synthetic accounts; it exercises wrong-portal errors and links at desktop/mobile widths, query overrides, saved-session rejection and matching dashboard restoration.

Run the usual backend, web and mobile tests plus TypeScript checks. For the optional browser verification, first install the isolated Playwright tools used by the existing vendor dashboard verification. Build web with `VITE_API_URL=http://127.0.0.1:4118` into `tmp/qa/portal-login/vendor/site` or `tmp/qa/portal-login/customer/site`, set `PORTAL_QA_SURFACE` to `VENDOR` or `CUSTOMER` and `PORTAL_QA_SITE` to that absolute site path, then run `node server/scripts/verify-portal-login.js` from the appropriate worktree. The script uses ports 4118 and 5198, so run the two product browser checks sequentially. Reports and screenshots are written under ignored `tmp/qa/portal-login/`.

Keep backend authentication changes in a separate release commit from the product web/mobile changes. When a production release is requested, promote the reviewed shared backend changes to `main` first and verify compatibility, then promote each product client to its matching production branch. The existing `main` workflow deploys both the backend and Vendor web; Customer OS web and native app distribution remain separate release steps. Existing installed mobile apps need a new build to receive the updated client-side portal policy and links.

Proposal Studio remains excluded. No data migration, account conversion, live payment transaction, production environment change or production deployment is part of this development task.
