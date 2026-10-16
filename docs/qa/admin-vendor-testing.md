# Admin and vendor testing

The existing dashboard design is retained. The test setup checks identity separation,
role permissions, dashboard APIs, refresh cookies, logout and session revocation.

## Environments

| Environment | Frontend | API | Databases |
| --- | --- | --- | --- |
| Development | http://localhost:5173 | http://localhost:4000 | Existing development configuration |
| Isolated QA | http://localhost:5174 | http://localhost:4100 | `starvnt_test_external`, `starvnt_test_admin` |

QA uses `server/.env.test.local` and `web/.env.test.local`. These files are ignored
by Git. Safe templates are supplied as `.env.test.example` in each directory.
The backend loads the explicit QA file without falling back to `server/.env`.
Separate JWT secrets and refresh-cookie names keep the environments independent.
Background outbox/reservation workers and payment bypass are disabled in QA.
Provider credentials are optional; missing AI credentials must not prevent startup.

On this workstation, QA is configured with separate databases on the existing
remote MongoDB cluster and newly generated local secrets. Docker is not installed.
The launcher accepts remote databases only with `QA_ALLOW_REMOTE_DATABASE=true`
and the dedicated test database names. Connection credentials are never written
to test reports.

For a new local setup, copy both templates to `.env.test.local`, then optionally
start the supplied MongoDB container:

```powershell
docker compose -f docker-compose.test.yml up -d
```

The template targets MongoDB on `127.0.0.1:27018`. Use distinct generated secrets
when sharing an environment. Do not copy normal development database names into
the QA configuration.

## Run

From the repository root:

```powershell
npm run check:env
npm run check:qa-env
npm test
npm run build -w web
```

Start each QA service in its own terminal:

```powershell
npm run dev:qa
npm run dev:qa:web
```

Open http://localhost:5174/admin/dashboard or
http://localhost:5174/vendor/dashboard and use development quick sign-in.

Once both services are ready:

```powershell
npm run test:smoke:qa
```

`npm run test:smoke` runs unauthenticated checks against the normal development
environment. `npm run test:smoke:dev` also uses development quick sign-in there.
Authenticated smoke checks create/reuse the known Super Admin, Operations,
Finance, Support and vendor development identities. They update login sessions
and log out those sessions at the end. Vendor quick sign-in no longer triggers
global vendor-catalog seeding. These checks read business data; they do not send
messages, accept quotes, create bookings or execute payments.

Reports: `tmp/qa/portal-smoke.json` and `tmp/qa/portal-smoke-qa.json`.
Reports contain check names and HTTP outcomes, without access tokens or cookies.

## Coverage and results (2026-10-16)

- Automated tests: 22 passed. Tests exercise real HTTP middleware/JWT checks with mocked stores,
  including cross-domain tokens, vendor/customer separation, disabled users,
  revoked sessions and Finance/Support booking permissions.
- Live smoke checks: 61 passed in development and 61 passed in isolated QA.
- Frontend production build passed, with the existing large-bundle warning.
- Environment checks passed for both configurations.
- Browser interaction and visual rendering were not verified in this run because
  the browser automation runtime was unavailable. Serving an HTML route is not
  equivalent to testing the rendered dashboard. Paid provider calls and complete
  quote-to-payment workflows remain outside this smoke suite.

Fixes from this testing: Finance/Support booking reads now honor `bookings.read`;
dashboard requests respect the signed-in role and pending-vendor counts use the
API total; optional AI client creation is deferred until a chat request.
