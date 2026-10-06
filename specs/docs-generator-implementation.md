# Implementation — Build, Test & Tooling

> Living specification, maintained by `/docs-generator`. Covers **how** the system is built, tested and run.
> Module placement/interfaces live in `architect-architecture.md`; endpoints/DTOs in `api-designer-spec.md`.
> This file **references** them rather than duplicating them.

## Overview

Nx monorepo for the МедЦентр backend: NestJS BFF services (`apps/*`) over shared libraries (`libs/*`), with a
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
