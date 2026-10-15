# auth-service

SMART on FHIR authorization server for the МедЦентр platform: OAuth2 + PKCE (S256), RS256 JWT with JWKS, the
credential login of the browser flow, user management and the terminology reads. State lives in the `auth` PostgreSQL
schema (users, RBAC, the FHIR bridge and the OAuth store) managed with TypeORM migrations; clinical resources
(`Patient`, `AuditEvent`) live in HAPI FHIR.

Architecture and edge routing: [`../../specs/architect-architecture.md`](../../specs/architect-architecture.md)
(ADR-009). Endpoints/DTOs: [`../../specs/api-designer-spec.md`](../../specs/api-designer-spec.md).
Build/test/tooling: [`../../specs/docs-generator-implementation.md`](../../specs/docs-generator-implementation.md).
Port map and edge routes of all services: `../../infra/traefik/dynamic.yml` (this service: `3001`;
`/oauth`, `/.well-known`, `/api/v1/auth`, `/api/v1/me`, `/api/v1/admin/users`, `/api/v1/terminology`).

## Endpoints

| Area | Endpoint | Access |
| --- | --- | --- |
| SMART / OAuth2 | `GET /.well-known/smart-configuration`, `GET /.well-known/jwks.json`, `POST /oauth/token`, `POST /oauth/token/revoke` | see API §2.1 |
| Browser login | `GET /oauth/authorize` (renders the login form without a session), `POST /oauth/login` | public, rate-limited |
| Users (API §2.2) | `POST /api/v1/auth/register` | public, rate-limited |
| | `GET /api/v1/me` | any Bearer |
| | `POST/GET /api/v1/admin/users`, `GET/PATCH/DELETE /api/v1/admin/users/{id}` | `ADMIN` + `user/*` scope |
| Terminology (API §2.3) | `GET /api/v1/terminology/value-sets` | `ADMIN` + `user/*.read` |
| | `GET /api/v1/terminology/value-sets/{url}/$expand`, `GET /api/v1/terminology/expand?system=`, `GET /api/v1/terminology/validate` | `user/*.read` |
| | `POST /api/v1/admin/terminology/import` (body `{ "snapshotVersion": "1.4.463" }`) | `ADMIN` + `user/*.write` |

### Terminology snapshot import (API 2.3.4, ADR-016)

`POST /api/v1/admin/terminology/import` answers `202 Accepted` at once and publishes the **bundled** snapshot
(`src/modules/terminology/import/snapshot/*.json`: МКБ-10, АТХ, UCUM, НСИ services/observations) to HAPI in the
background. It is the in-service counterpart of `tools/terminology-seed` (the image of this service contains only
`apps/auth-service` and `libs`, so the CLI cannot be imported); a spec compares both builders resource by resource.

- `snapshotVersion` must be the bundled release (`1.4.463`), otherwise `422 TERMINOLOGY_NOT_FOUND`; a missing or
  malformed value is `400 VALIDATION_ERROR`.
- One import at a time across replicas (Redis `SET NX EX`, in-process lock without `REDIS_URL`): a second request while
  one runs is `409 CONFLICT` (`IMPORT_RUNNING` in `detail`). The lease expires after 30 minutes.
- Idempotent: resources are `PUT` on the id of the copy that already holds the canonical, then every ValueSet is proven
  (`$expand` returns every snapshot code, `$validate-code` accepts each one). Progress is in the log (`importId`).
- Two `AuditEvent`s per import (accepted; completed or failed, outcome `0`/`8`). Cached expansions are dropped when it ends.

### Browser login (assumption UI-1)

`GET /oauth/authorize` without a login session answers a server-rendered, script-free HTML form (Russian labels,
CSRF double-submit token, inline CSS pinned by CSP hash). `POST /oauth/login` verifies the password (scrypt,
per-user salt, constant-time compare; one generic error for unknown email, wrong password and inactive account),
sets a signed `httpOnly; SameSite=Lax; Path=/oauth` session cookie valid for 5 minutes and **single use**, and
302s back to `/oauth/authorize?<original query>`, which then issues the code. Tokens (authorization_code **and**
refresh) take `patient` / `fhirUser` from the account's `ExternalLink` rows:
`patient` = bare Patient id (PATIENT only), `fhirUser` = `Patient/{id}` (PATIENT) or `PractitionerRole/{id}` (DOCTOR),
absent for ADMIN.

#### Brute-force protection

Three ceilings guard the password and the account factory:

- **Per client address**, 10 per minute on `POST /oauth/login` and on `POST /api/v1/auth/register`. The key of these two
  routes is the address and the route only: `app/credential-route.middleware.ts` runs before the guard stack and drops
  the body `client_id` and canonicalises the URL (case, trailing slash, query), so neither can mint a fresh bucket
  (`POST /oauth/token`, which validates `client_id`, keeps the `client_id|ip` key). A limited login post answers the
  form page with `429` and `Retry-After`, not a JSON problem (`LoginRateLimitFilter`).
- **Per account**, 10 attempts per 15 minutes (`LoginThrottle`, Redis counter keyed by the SHA-256 of the normalised
  email, in-process without `REDIS_URL`). Every attempt counts before the password is checked, also for unknown emails;
  a valid login clears the counter. It **fails closed**: an unreachable counter answers `503` instead of letting guesses
  through. Accepted trade-off: someone who knows an email can keep its login form closed for the window.
- The shared `RateLimitGuard` still fails open when its Redis is down; the per-account counter is what holds then.

### Admin `PATCH /api/v1/admin/users/{id}`

All-or-nothing: fields, roles and the `PractitionerRole` link commit in one transaction (`409` leaves the account as it
was), then the linked `Patient` (name, birth date, gender, email) is updated with `If-Match` through a one-entry
transaction Bundle. If HAPI refuses, the account change is reverted and the HAPI error is returned. A change that stays
committed always has its `AuditEvent` (outcome `8` when the revert failed too). `practitionerRoleId: null` releases the
link; dropping the `DOCTOR` role releases it implicitly. Responses carry `Cache-Control: no-store`.

Known limit: deactivating an account (`DELETE`, or `isActive: false`) closes refresh and new authorization codes at once,
but an access token already issued stays valid until it expires (15 minutes, `ACCESS_TOKEN_TTL_SECONDS`); there is no
per-subject denylist.

### First administrator

With `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` set (both, password must satisfy the password policy),
the service creates that ADMIN once at boot; an existing email is left untouched, unset variables skip it.
Optional `BOOTSTRAP_ADMIN_FIRST_NAME` / `BOOTSTRAP_ADMIN_LAST_NAME`.

## Prerequisites

- Node.js 18+ and npm (install once at the workspace root: `npm install`).
- The local stack for integration work: `npm run stack:up` (PostgreSQL, Redis, RabbitMQ, HAPI FHIR, Traefik).

## Environment

Configuration is validated by `@medcenter/config` (`libs/config/src/lib/env.schema.ts`). Required keys:
`FHIR_BASE_URL`, `FHIR_CLIENT_ID`, `FHIR_CLIENT_SECRET`, `JWT_JWKS_URI`, `JWT_ISSUER`, `REDIS_URL`,
`RABBITMQ_URL`. Optional: `NODE_ENV`, `PORT` (default 3001), `RATE_LIMIT_PER_MINUTE` (default 120),
`TERMINOLOGY_UPSTREAM_URL`, `TRUST_PROXY`. Secrets have no defaults and are never committed.

Specific to this service (`src/config/auth-env.ts`):

| Variable | Purpose |
| --- | --- |
| `AUTH_DB_HOST/PORT/USER/PASSWORD/NAME` | `auth` schema connection; falls back to `DB_*`, then `POSTGRES_*` |
| `AUTH_SESSION_SECRET` | key material of the login-session and CSRF cookies (>= 32 chars); falls back to `JWT_PRIVATE_KEY` |
| `AUTH_COOKIE_SECURE` | `true` forces `Secure` on the login cookies; unset = decided per request (`req.secure`) |
| `BOOTSTRAP_ADMIN_EMAIL/PASSWORD/FIRST_NAME/LAST_NAME` | first administrator, see above |
| `OAUTH_CLIENTS_JSON` | registered OAuth clients and their redirect URIs |

`TRUST_PROXY` sets Express's `trust proxy` (unset = `false`, so `X-Forwarded-For` is ignored). Behind Traefik use the
hop count `1`; a list of IPs/CIDRs (`10.0.0.0/8,loopback`) is also accepted. `true` trusts every hop, so a client can
spoof its bucket. An invalid value fails the boot. The rate-limit store is Redis (`REDIS_URL`).

## Commands (from the workspace root)

| Action | Command |
| --- | --- |
| Build | `npx nx build auth-service` |
| Serve (watch) | `npx nx serve auth-service` |
| Unit tests | `npx nx test auth-service` |
| E2E tests | `npx nx e2e auth-service` |
| Lint | `npx nx lint auth-service` |

## Layout

```
src/
├── main.ts                     # bootstrap
├── app/                        # AppModule + root controller
├── config/                     # zod-validated env of this service
├── database/                   # auth DataSource, migrations (Init, RolesAndLinks)
└── modules/
    ├── oauth/                  # SMART endpoints, authorize, login/ (form, session, CSRF), identity claims
    ├── users/                  # entities, UserStore port + TypeORM adapter, accounts, credentials, bootstrap
    ├── terminology/            # ValueSet list / $expand / validate over HAPI (+ cache); import/ = snapshot importer (2.3.4)
    ├── audit/                  # AuditEvent writer (FR-021)
    ├── fhir/                   # shared HAPI client
    └── health/
test/                           # *.e2e-spec.ts over the real AppModule with in-memory/fake infrastructure
```

## Testing notes

`jest.config.ts` runs `src/**/*.spec.ts`; the `e2e` target uses `jest.e2e.config.ts` (`test/**/*.e2e-spec.ts`).
The e2e suites boot the real `AppModule` (guards, validation pipe, RFC 7807 filter) over an in-memory user store, a
fake HAPI and a fake broker, so they need no infrastructure.

`typeorm-user.store.spec.ts` and `test/postgres-flow.e2e-spec.ts` are **database
integration** suites. They probe PostgreSQL with `TEST_PG_HOST/PORT/USER/PASSWORD` (defaults: `127.0.0.1:5433`,
user `medcenter`) and **skip with a warning** when the server cannot be reached with those credentials; each creates
and drops its own database. Point them at the compose stack by exporting the `TEST_PG_*` values.
