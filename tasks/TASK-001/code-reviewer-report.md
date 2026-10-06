# Code Review — Backend TASK-001 (feature/task-001-clinic-platform)

**Scope:** `apps/auth-service` (entities, `UserRepository`, `AppModule`, `main.ts`, migration `1700000000000-Init`), `libs/common` (guard stack, filter, middleware, decorators), `libs/config` (`env.schema`), `libs/contracts` (error codes, pagination, roles, scopes, events), `infra/traefik/dynamic.yml`, `docker-compose.yml`
**Branch:** `feature/task-001-clinic-platform` @ `1c135b2` (+ uncommitted: `package.json`/`package-lock.json` modified; untracked `src/database/`, `src/modules/`, `pg-probe.js`, `pg-probe2.js`)
**Specs:** `specs/architect-architecture.md` (ADR-001…017 Accepted), `specs/api-designer-spec.md` (§0–§12)
**Verification:** `tsc --noEmit` PASS; `nx test common` 22/22 PASS; `config` 5/5 PASS; `contracts` 14/14 PASS; `lint` PASS; `build common` PASS

## Summary

Solid M0 slice. The distributed guard stack (`JwtAuthGuard → ScopeGuard → RoleGuard → RateLimitGuard` via `APP_GUARD`), RFC7807 boundary filter, `resolvePatientRef` compartment helper, zod env schema, and `auth`-schema entities/migration all match ADR-009/013/014 and API §0–§1. No Belgian-IG references found. Test naming follows AAA/should-when. Do NOT merge yet: two Critical security gaps (no `TOKEN_REVOKED`/denylist check in `JwtAuthGuard`, `main.ts` missing the entire boundary pipeline), plus debug `pg-probe*.js` files at repo root and `dist/` present on disk (gitignored, delete before packaging).

## Issues Found

### Critical (Must Fix)

- [ ] JwtAuthGuard never checks Redis denylist / TOKEN_REVOKED — revoked jti still passes. API 2.1 requires TOKEN_REVOKED. Fix: denylist check after jwtVerify — jwt-auth.guard.ts:97
- [ ] main.ts ships bare bootstrap — no ValidationPipe, no global filter, no helmet/CORS/Swagger. Fix per plan Task 0/6, API 10 — auth-service/src/main.ts:5
- [ ] docker-compose.yml publishes HAPI 8080:8080; API 0 says /fhir never public. Fix: remove host binding by default
- [ ] Migration uses gen_random_uuid() with no pgcrypto extension — fresh PG fails. Fix: CREATE EXTENSION IF NOT EXISTS pgcrypto first — 1700000000000-Init.ts:11

### Major (Should Fix)

- [ ] Debug probes `pg-probe.js`, `pg-probe2.js` untracked at repo root; one reads `.env` via regex (AGENTS.md forbids). Fix: delete both, move probes to `tools/` with zod env loader — `pg-probe.js:1`
- [ ] `user.repository.spec.ts:22-36` parses `.env` with regex, hardcoded fallback `change-me-postgres`. Fix: require `TEST_PG_*` env (fail fast) or Testcontainers per plan Task 3
- [ ] `UserRepository` exposes generic `save()` — caller can persist inactive user, bypassing login invariant. Fix: narrow to `createActive()`/`deactivate()` — `repositories/user.repository.ts:25`
- [ ] `RateLimitGuard.buildRateLimitKey` keys by `method:originalUrl` — query-string fan-out bypasses 120/min. Fix: key by route pattern — `guards/rate-limit.guard.ts:36`
- [ ] `RateLimitGuard` fails open on Redis outage (warn + allow). Confirm fail-open is accepted ADR or fail closed — `guards/rate-limit.guard.ts:61`
- [ ] `main.ts` ignores `loadEnv()`/`parseEnv()` — wrong PORT/missing secret starts anyway. Fix: `loadEnv()` first, use `env.PORT`
- [ ] `RequestIdMiddleware` via `forRoutes('*')` may run after guards → `requestId: 'unknown'`. Fix: register before guards; assert `x-request-id` in e2e — `app.module.ts:31`
- [ ] `ProblemDetailsFilter.readDetail` echoes `exception.message` for 4xx (raw DB text). Fix: safe messages per code, raw text only in logs — `filters/problem-details.filter.ts:114`

### Minor (Consider)

- [ ] `typeorm.config.ts:40` `buildTestDataSource` duplicates `buildDataSource` — merge or differentiate
- [ ] `pagination.dto.ts:17` `buildPaginatedResponse` is identity wrapper — consider removing
- [ ] `role.guard.ts:35` string-compare bypasses `Role` enum exhaustiveness — use `Object.values(Role).includes()`
- [ ] `jwt-auth.guard.ts:44` module JWKS cache has no rotation; env re-parsed per request — cache env, set cooldown
- [ ] `request-context.ts:22` `hasScope` splits on single space — use `split(/\s+/).filter(Boolean)`
- [ ] `app.controller.ts:13` metadata endpoint lacks `requestId` envelope (NFR-007) — consider adding
- [ ] Uncommitted `package.json`/`package-lock.json` drift (1789 insertions) mixes dep bump with M1 entities — commit separately

### Positive Notes

- Guard order, `APP_GUARD` global mount, `@Public()` hatch, `resolvePatientRef` implement ADR-009/013 exactly
- `ProblemDetailsFilter` never leaks 500 internals; test proves `password=hunter2` not echoed
- Zod env schema, secret-without-default, `clearEnvCache()`; 16 `errorCode`s + HTTP map match API §1
- Entities + migration enforce single-Patient/single-PractitionerRole at DB level; login excludes inactive users
- Traefik routes all 9 API domains with priorities + HSTS/nosniff/frame-deny; tests AAA, `should…when…`, isolated

## Verification Evidence

- `npx tsc --noEmit -p tsconfig.base.json` — clean
- `npx nx test common --skip-nx-cache` — 6 suites, 22 tests PASS
- `npx nx test config --skip-nx-cache` — 5 tests PASS
- `npx nx test contracts --skip-nx-cache` — 2 suites, 14 tests PASS
- `nx run-many --target=lint --projects=common,config,contracts` — all pass
- `nx build common` — success (contracts, config, common)
- Full `test --all` exceeds 30 s sandbox timeout (auth-service DB test needs live PG); `auth-service` lint/build not run — rerun in CI with stack up

