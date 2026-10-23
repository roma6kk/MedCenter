# Implementation — Build, Test & Tooling

> Living specification, maintained by `/docs-generator`. Covers **how** the system is built, tested and run.
> UI/routes/state live in `frontend-design-spec.md`; API contracts in `api-designer-spec.md`; module placement in
> `architect-architecture.md`. This file **references** them instead of duplicating.

## Overview

The target architecture (`specs/architect-architecture.md`) is an Nx monorepo (`apps/*`, `libs/*`) with eight
NestJS BFF services behind Traefik, HAPI FHIR JPA (R4) and PostgreSQL. **Implemented today:** the backend
workspace (root `package.json`, `nx.json`, `apps/auth-service`, `libs/{common,config,contracts}`, Docker
Compose stack) and a standalone frontend in `frontend/` (no root `package.json` for it; the Nx `apps/web`
relocation is deferred). The remaining seven BFF services are not yet built — Traefik declares their planned
ports and answers 502 for backends that are not up yet.


Nx monorepo for the Лайфлайн backend: NestJS BFF services (`apps/*`) over shared libraries (`libs/*`), with a
local Docker Compose stack (PostgreSQL, Redis, RabbitMQ, HAPI FHIR, Traefik). Per
`architect-architecture.md` the target is **8 BFF services**; **only `auth-service` is implemented so far**, and
only three shared libs (`common`, `config`, `contracts`). The Traefik router file already declares the planned
port map for the other services and answers 502 for backends that are not up yet.

### [TASK-001] Backend — build, test & tooling (2026-10-05)

**Workspace:** Nx (`nx.json`, `tsconfig.base.json`). Path aliases: `@medcenter/contracts`, `@medcenter/common`,
`@medcenter/config` (also reserved: `@medcenter/fhir`, `@medcenter/fhir-mappers`, `@medcenter/terminology`).
TypeScript strict, `emitDecoratorMetadata`/`experimentalDecorators` enabled.

**Projects:**

| Project | Type | Purpose |
| --- | --- | --- |
| `apps/auth-service` | application | SMART/OAuth2 authorization server: users/RBAC entities, TypeORM `auth` schema, Init migration |
| `libs/common` | library | guard stack (`JwtAuth`, `Scope`, `Role`, `RateLimit`), RFC 7807 filter, decorators, request context + `RequestIdMiddleware` |
| `libs/config` | library | zod environment schema (`envSchema`, `guardEnvSchema`, `jwtEnvSchema`, `rateLimitEnvSchema`) with a process-lifetime cache |
| `libs/contracts` | library | `ErrorCode` catalogue + HTTP map, `PaginatedResponseDto`, `ProblemDetails`, `Role`, `SMART_SCOPES`, domain-event contracts |

**Commands** (run at the workspace root):

| Action | Command |
| --- | --- |
| Install | `npm install` |
| Build all | `npm run build` (`nx run-many --target=build --all`) |
| Test all | `npm run test` (`nx run-many --target=test --all`) |
| Lint all | `npm run lint` |
| Typecheck | `npm run typecheck` (`tsc --noEmit -p tsconfig.base.json`) |
| Tool tests | `npm run test:tools` (`jest tools/`) |
| Seed terminology | `npm run seed:terminology` |
| Start / stop stack | `npm run stack:up` / `npm run stack:down` |
| Serve a service | `npx nx serve auth-service` |

**Environment (from `libs/config/src/lib/env.schema.ts`; no secret values are recorded here):**

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | no | default `development` |
| `PORT` | no | default `3000` |
| `FHIR_BASE_URL`, `FHIR_CLIENT_ID`, `FHIR_CLIENT_SECRET` | yes | FHIR client; secret has no default by design |
| `JWT_JWKS_URI`, `JWT_ISSUER` | yes | RS256 verification (ADR-009 guard layer) |
| `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` | sign only | RS256 PEM pair; required wherever tokens are signed (auth-service, API 2.1.3/2.1.5) |
| `JWT_KEY_ID` | no | `kid` published in the JWKS (default `auth-1`) |
| `OAUTH_CLIENTS_JSON` | no | dev seed for the client registry (JSON array); replaced by `auth.oauth_client` persistence |
| `REDIS_URL` | yes | cache / rate-limit / token denylist |
| `RABBITMQ_URL` | yes | domain events |
| `RATE_LIMIT_PER_MINUTE` | no | default `120` |
| `TERMINOLOGY_UPSTREAM_URL` | no | optional ЦИСЗ upstream (ADR-016) |

**Testing:** per-project Jest configs referenced from each `project.json` (`@nx/jest:jest`), sharing
`jest.preset.js`. Root `jest.config.js` (ts-jest) covers workspace tooling under `tools/`. `apps/auth-service`
also exposes an `e2e` target (`jest.e2e.config.ts`, `<rootDir>/test/**/*.e2e-spec.ts`). Repository integration
tests need the compose PostgreSQL (Testcontainers path is used in CI/Docker; see
`apps/auth-service/src/modules/users/repositories/user.repository.spec.ts`).

**Dev stack & infrastructure:** `docker-compose.yml` (postgres, redis, rabbitmq, hapi, traefik);
`infra/traefik/dynamic.yml` (TLS termination + security headers only — **no token validation at the edge**,
per ADR-009). Terminology is seeded from a versioned in-repo snapshot by `tools/terminology-seed`
(ADR-002/ADR-016, risk R-1), preserving `https://fhir.by/...` canonicals.

**Verification status (2026-10-06):** `nx run-many --target=test --all` is green — `config` 1 suite / 8 tests,
`contracts` 5 / 30, `common` 8 / 46, `auth-service` 13 / 125 — plus `nx e2e auth-service` 2 suites / 32 tests.
`nx run-many --target=lint --projects=auth-service,contracts,common,config`, `npm run typecheck` and
`nx build auth-service` all pass.
**Implemented OAuth surface (API 2.1.1–2.1.5):** `apps/auth-service/src/modules/oauth` exposes
`GET /.well-known/smart-configuration`, `GET /oauth/authorize` (PKCE S256 only), `POST /oauth/token`
(authorization_code + refresh_token with rotation), `POST /oauth/token/revoke`, `GET /.well-known/jwks.json`.

Token/code persistence and the revocation denylist sit behind `TokenStore`/`TokenDenylist`; the in-memory
implementations are the dev/test defaults and are swapped for TypeORM (`auth.oauth_token`)/Redis at wiring time.

**Contract decisions and fixes (2026-10-06).**

- **R1(b) — token endpoint stays RFC 6749.** A revoked/rotated refresh token is reported as **400
  `invalid_grant`**, indistinguishable from an unknown one (`OAuthError.invalidGrantRevoked`). `TOKEN_REVOKED`
  (401) is reserved for the guard layer on a denied Bearer `jti`/`sid`; that denylist check in `JwtAuthGuard`
  is implemented (see *Guard-layer revocation* below).
- **R2 — revocation ownership (RFC 7009 §2.1).** `POST /oauth/token/revoke` now resolves the stored token and
  revokes it only when its `userId` matches the authenticated `sub` (and `client_id`, when supplied, matches its
  owner). A non-owned, unknown or already-unusable token is a no-op (`{ revoked: false }`).
- **Guard-layer revocation (`TOKEN_REVOKED`, 401).** `libs/common` owns the contract —
  `TokenRevocationChecker` and the `TOKEN_REVOCATION` DI token in `guards/token-revocation.ts` — and
  `JwtAuthGuard` consults it for both the access token's `jti` and its session `sid`, answering
  **401 `TOKEN_REVOKED`**. `auth-service` binds that token to `TokenService` (`useExisting`) and exports it, so
  the globally mounted guard reads the issuer's denylist. The denylist is namespaced: `reuse:` for
  consumption/rotation (reuse detection, token-endpoint only) and `session:` for explicit revocation, so a
  proactive refresh never ends the session it refreshed. An unreachable denylist **fails open** and is logged at
  error — revocation is a secondary control behind the 15-minute lifetime, whereas an unreachable store is an
  availability event.
- **`sid` claim (no schema change).** `issuePair` mints the refresh token first and stamps its `jti` onto the
  access token as `sid`, which is what lets a revocation of the pair reach the guard layer while
  `auth.oauth_token.kind` stays `'code' | 'refresh'`.
- **M1 — global `ValidationPipe`.** `createValidationPipe()` (`libs/common`) is mounted by `main.ts` and by the
  e2e suite, so the pipeline under test is the pipeline that ships. `TokenRequestDto` was reworked so the pipe
  cannot hijack the RFC 6749 envelopes: `grant_type` is a free string (an unsupported grant stays
  `unsupported_grant_type`) and the per-grant fields carry no `@MinLength(1)` (an empty form value stays
  `invalid_request`).
- **M4 — narrowed `authorize` catch.** Only an `OAuthError` bounces with `?error=access_denied`, and it is
  logged at warn with the `client_id`; anything else propagates to `ProblemDetailsFilter`, which logs it with
  the request id and answers 500.
- **R3 — discovery.** `token_endpoint_auth_methods_supported: ['client_secret_post', 'none']` and
  `grant_types_supported: ['authorization_code', 'refresh_token']` are published (API 2.1.1).
- **200 OK on the token routes.** `POST /oauth/token` and `POST /oauth/token/revoke` inherited Nest's default
  201; RFC 6749 §5.1 and API §2.1.3/§2.1.4 require 200, so both now declare `@HttpCode(HttpStatus.OK)`.
- **Postgres integration spec.** `user.repository.spec.ts` probes the database synchronously at collection time
  and `describe.skip`s when it is unreachable, so `nx test auth-service` no longer fails without a live compose
  stack. Two latent harness bugs were fixed alongside it (`Role.description` needed an explicit column type; the
  `auth` schema must exist before `runMigrations`; `user` must be truncated with `CASCADE`).

**Known gap (resolved 2026-10-06):** `nx test auth-service` previously could not complete because
`user.repository.spec.ts` — a compose-PostgreSQL integration test — failed when no test database was reachable.
The spec now probes reachability at collection time and skips itself, and the two latent harness bugs it was
masking were fixed (see above), so the suite is green with or without a live database.
See `tasks/TASK-001/test-generator-backend-coverage-report.md` for the test inventory.

### [TASK-001] Frontend — build, test & tooling (2026-10-05)

**Location:** `frontend/` — standalone Next.js 15 App Router (React 18, TypeScript strict). No root
`package.json`; all commands run inside `frontend/`.

**Stack:** Next.js 15.0.3 (App Router, RSC), TanStack Query v5, Zustand v5, react-hook-form + zod,
Tailwind CSS. Tests: Jest 29 + Testing Library (jsdom) via the `next/jest` SWC transform; E2E: Playwright.

**Commands** (run in `frontend/`):

| Action | Command | Notes |
| --- | --- | --- |
| Install | `npm install` | no root install |
| Dev | `npm run dev` | `next dev`, default :3000 |
| Types | `npx tsc --noEmit` | strict; no emit |
| Tests | `npm test` | `jest --passWithNoTests` |
| Lint | `npm run lint` | `next lint` (deprecated; flat-config migration deferred) |
| Build | `npm run build` | `next build` |
| E2E | `npm run e2e` | `playwright test` — smoke stubs (`test.fixme`) |

**Environment variables (frontend):**

| Var | Default | Purpose |
| --- | --- | --- |
| `AUTH_BACKEND_URL` | `http://auth-service:3000` | `auth-service` base URL used by the token broker |
| `OAUTH_CLIENT_ID` | `medcenter-web` | SMART/OAuth2 client id |

**Auth flow (reference: `frontend-design-spec.md` §4, `api-designer-spec.md` SMART section):** PKCE (S256) is
handled by route handlers under `src/app/api/auth/{authorize,callback,refresh,session,logout}`. The refresh token
lives only in the httpOnly `mc_rt` cookie; the short-lived access token is held in JS memory and attached as
`Authorization: Bearer` by `apiFetch`. `src/middleware.ts` gates protected route prefixes on the `mc_session`
cookie. Hardening: `sanitizeReturnTo` (open-redirect denylist) and `parsePkceCookie` (fail-closed JSON) live in
`src/lib/auth/`.

**Encounter completion (reference: `api-designer-spec.md` §7.3):** `EncounterCompleteForm` submits the single
atomic `CompleteEncounterDto` body (МКБ-10 diagnoses ≥ 1, `ServiceRequest`/`MedicationRequest`, UCUM
select-only unit) to `POST /api/v1/encounters/{id}/complete`.

**Verification status (2026-10-05):** `tsc --noEmit` = 0 · `jest` = **19 suites / 212 tests** · `next lint` = 0 ·
`next build` = 27 routes + middleware (32.1 kB). Runtime probes: `/booking` → `/login?returnTo=…`;
`/api/auth/session` → 200 anonymous; `/api/auth/callback` malformed cookie → 307 (not 500).

**Known gaps / follow-ups:** the reviewer's Major items (session-cookie lifetime vs refresh token; forgeable
`mc_session` gate; combobox keyboard navigation; free-text observations) are open. See
`tasks/TASK-001/code-reviewer-frontend-criticals-report.md`; implementation detail in
`frontend/coder-frontend-implementation-notes.md`; test inventory in
`tasks/TASK-001/test-generator-coverage-report.md`.

### [TASK-003] Demo seed and stack smoke — patient consent (2026-10-23)

Rules and contracts live in ADR-019 (`architect-architecture.md`) and `api-designer-spec.md` §2.2.6, §3.4–3.11, §6.1, §7.1, §7.3;
this section only records how the tooling follows them.

- **`CONSENT_ENFORCEMENT` defaults to `block` in `docker-compose.yml`** (`${CONSENT_ENFORCEMENT:-block}`); `warn` stays available by
  exporting it. The services recreate to pick it up: `docker compose up -d encounter-service appointment-service && npm run stack:wait`.
- **`npm run seed:demo -- --users --consents`** — the demo patients register with `accountConsent` (version mirrors
  `ACCOUNT_CONSENT_VERSION` of `frontend/src/lib/contracts.ts`), then `--consents` writes a demo scan `Binary` and an active EMR `Consent`
  (built by `buildConsent`, form `DEMO-<key>`, signed by the first demo doctor) into HAPI; a patient with a consent in force is skipped.
  **`patient.novikov` is left without consent on purpose**, to demo the `CONSENT_REQUIRED` block (`--consent-except=<account|none>` changes it;
  the seed prints it). Details: header of `tools/demo-seed/seed-demo.ts`, logic in `tools/demo-seed/demo-consents.ts`.
- **`npm run smoke:stack`** adds the consent routes to the access matrix and a consent chain on a throwaway patient (`checks-chain-consent.ts`).
  It is mode-aware: the stack's mode is detected (or named in `SMOKE_CONSENT_ENFORCEMENT`) and the same calls expect 409 in `block`, success in `warn`.
  The clinical chain records its patient's consent first; the race and schedule-removal bookings carry no free-text reason, because the third demo
  patient has no consent. The bypass `AuditEvent` is read from HAPI directly (`SMOKE_FHIR_BASE_URL`, local hosts only): no API exposes it.
  The suite now needs 6 free slots of the demo doctor (slots 3–5 belong to the consent chain).
- **Tools resolve `@medcenter/*`**: `seed:demo` and `smoke:stack` run `ts-node -r tsconfig-paths/register`, and `jest.config.js` maps the same aliases.
