# Test Generator — Backend Coverage Report (TASK-001)

**Target:** `.worktrees/task-001-clinic-platform` (branch `feature/task-001-clinic-platform` @ `1c135b2`) —
Nx apps/libs: `apps/auth-service`, `libs/{common,config,contracts}`. No `backend/` directory exists; the backend
lives only in this worktree.
**Specs:** `tasks/TASK-001/requirements-analyst-requirements.md`, `specs/api-designer-spec.md`,
`specs/architect-architecture.md`.
**Baseline before this pass:** 11 `*.spec.ts` files (libs + `auth-service` app + DB integration).

## New suites (7 files, 43 tests)

| Suite (file) | Unit | Cases |
| --- | --- | --- |
| `libs/contracts/src/lib/role.enum.spec.ts` | `Role` RBAC enum | three roles only; key == value; no numeric reverse map |
| `libs/contracts/src/lib/smart-scopes.spec.ts` | `SMART_SCOPES` | exact 5-entry catalogue; `resource/*.verb` grammar; `launch` bare |
| `libs/contracts/src/lib/events/domain-events.spec.ts` | Domain event contracts | exchange = `medical.events`; `.dlq` suffix; `v: 1`; pinned routing keys; keys unique; `<domain>.<event>.v<n>` |
| `libs/common/src/lib/request-id.middleware.spec.ts` | `RequestIdMiddleware` | reuses a valid `x-request-id`; generates a UUID when absent/too long/whitespace/newline/slash; echoes the assigned id; `next()` once |
| `libs/common/src/lib/decorators/metadata-decorators.spec.ts` | `@Public` / `@RateLimit` / `@RequiresRoles` / `@RequiresScopes` | exact metadata keys; each value stored in order; undecorated route carries none |
| `apps/auth-service/src/database/typeorm.config.spec.ts` | auth `DataSource` factory | `auth` schema; `synchronize: false`; six entities in order; single Init migration; connection passthrough; runtime ≠ test instances |
| `apps/auth-service/src/database/migrations/1700000000000-Init.spec.ts` | `Init1700000000000` | stable name; schema created first; six tables; idempotent + schema-qualified; 7 statements up/down; tables dropped before schema; `user` dropped after referring tables |

All are pure unit tests — no database, Redis, or container required (`buildDataSource`/`buildTestDataSource`
construct a `DataSource` without connecting; the migration is driven by a mock `QueryRunner`).

## Verification evidence

- `npx nx run-many --target=test --projects=contracts,common,config --skip-nx-cache` — **all green**:
  `contracts` 5 suites / 30 tests, `common` 8 suites / 36 tests, `config` 1 suite / 8 tests
  (**14 suites / 74 tests**). *(The `config` count rose from 5 to 8 when Task 6 added the
  signing-key environment cases to `env.schema.spec.ts`.)*
- `npx jest -c apps/auth-service/jest.config.ts "src/database/"` — **2 suites / 13 tests pass** (the new DB-free specs).
- `npx nx run-many --target=lint --projects=contracts,common,config,auth-service --skip-nx-cache` — **PASS**.
- `npm run typecheck` (`tsc --noEmit -p tsconfig.base.json`) — **PASS** (0 errors).

## Known gaps / limitations

- **`nx test auth-service` cannot complete in this environment.** `apps/auth-service/src/modules/users/repositories/user.repository.spec.ts`
  is a Testcontainers/compose-PostgreSQL integration test; the run hangs after `app.controller.spec.ts` and was
  killed at 240 s. This is **pre-existing** and environmental, not caused by the new specs (which pass in isolation).
- `apps/auth-service/test/jwt-perimeter.e2e-spec.ts` (`jest.e2e.config.ts`) was not run — it needs the full stack.
- Not covered by this pass: the six TypeORM entity classes (decorator declarations), `app.module.ts`, and
  `main.ts` (bootstrap). Low unit value; they belong to an app-level integration test once the stack is wired.

## Next Steps

**Next by flow:** `/debugger` — only if a suite later fails.
**Alternatives:**
- `/coder` `backend TASK-001` — implement the remaining backend services before widening the test surface.
- `/finishing-branch` — commit this worktree's backend work (large uncommitted set) once the stack-backed
  integration specs can run in CI.

---

# Task 6 coverage pass — `auth-service` SMART/OAuth2 surface (2026-10-06)

**Scope:** the new `apps/auth-service/src/modules/oauth/**` surface (API 2.1.1–2.1.5) — guards, token
lifecycle, module environment factories, and the HTTP layer the plan mandated.

## New suites (5 files, 69 tests)

| Suite (file) | Unit under test | Cases |
| --- | --- | --- |
| `apps/auth-service/src/modules/oauth/guards/client.guard.spec.ts` | `InMemoryClientRegistry`, `assertRegisteredRedirectUri`, `ClientGuard` | 14 |
| `apps/auth-service/src/modules/oauth/guards/authorize-page.guard.spec.ts` | `AuthorizePageGuard` (`S256`-only enforcement) | 7 |
| `apps/auth-service/src/modules/oauth/token.service.spec.ts` | `InMemoryTokenDenylist`, `TokenService` (`issue` / `consume` / `isDenied` / `revoke`) | 19 |
| `apps/auth-service/src/modules/oauth/oauth.module.spec.ts` | `loadSigningKeys`, `loadRegisteredClients` | 13 |
| `apps/auth-service/test/oauth.e2e-spec.ts` | all five routes over the real global guard stack + `ProblemDetailsFilter` (`supertest`) | 16 |

Supporting files:

- `apps/auth-service/test/e2e-env.ts` — shared e2e environment helper (helper, not a suite). It generates an
  RSA key pair and sets `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` / `JWT_ISSUER` / `JWT_KEY_ID` / `FHIR_BASE_URL` /
  `OAUTH_CLIENTS_JSON` before the app is compiled.
- `apps/auth-service/test/jwt-perimeter.e2e-spec.ts` — **patched** (2 lines): it now calls `applyE2eEnv()`
  before booting `AppModule`.

## Verification evidence

| Check | Command | Result |
| --- | --- | --- |
| OAuth unit surface | `npx jest -c apps/auth-service/jest.config.ts --testPathPattern "src/modules/oauth"` | **PASS** 8 suites / 78 tests (was 4 / 25) |
| auth-service DB-free | `npx jest -c apps/auth-service/jest.config.ts --testPathPattern "src/(modules\|database\|app)"` | **11 of 12 suites pass / 92 tests**; the only failure is the pre-existing Postgres integration spec (see Limitations) |
| E2E target | `npx nx e2e auth-service --skip-nx-cache` | **PASS** 2 suites / 18 tests, exit 0 (**was red**: 1 suite / 2 tests failing) |
| Libs | `npx nx run-many --target=test --projects=contracts,common,config --skip-nx-cache` | **PASS** 14 suites / 74 tests |
| Lint | `npx nx run-many --target=lint --projects=auth-service,contracts,common,config` | **PASS** (exit 0) |
| Typecheck | `npm run typecheck` | **PASS** (exit 0) |
| Build | `npx nx build auth-service` | **PASS** (exit 0) |

## The e2e target was already red before this pass

`nx e2e auth-service` failed on `test/jwt-perimeter.e2e-spec.ts` with:

```text
OAuth signing requires JWT_PRIVATE_KEY, JWT_PUBLIC_KEY and JWT_ISSUER to be set
    at InstanceWrapper.loadSigningKeys [as metatype] (src/modules/oauth/oauth.module.ts:33:11)
```

Task 6 mounts `OAuthModule` into `AppModule`, and `loadSigningKeys` is an **eager** `useFactory` provider, so
the signing keys became a hard boot requirement for the whole application — even for a suite that only probes
the unauthenticated 401 path. Nothing loads `.env` at runtime (`@nestjs/config` is not imported anywhere), so
the app cannot boot in dev/test unless the operator exports the keys by hand.

The test-side fix applied here is the shared `e2e-env.ts` helper: a test suite should declare the environment
it needs. **The implementation-side question is escalated, not resolved** — `oauth.module.ts:23-27` documents
these keys as being *"resolved lazily so a service that never mounts the OAuth surface still boots"*, which
contradicts the eager factory. Either the factory should be lazy (matching its own comment) or the runtime
should load `.env` and fail fast on purpose. That belongs to `/coder`.

## Deliberate omission: the OAuth error body is not asserted

The e2e suite asserts **status codes** for the token-endpoint error cases
(`400` for `invalid_grant` / `unsupported_grant_type`, `401` for `invalid_client`) but deliberately does **not**
assert the response body's `error` field. Per the code review (`code-reviewer-backend-report.md`, finding C1)
the global `ProblemDetailsFilter` currently rewrites those bodies into RFC 7807 and maps every 400 to
`errorCode: VALIDATION_ERROR`, dropping `error` entirely. Pinning the current body would freeze that defect;
pinning the specified body would leave the suite red. Status codes are unambiguous and correct, so they are
asserted and the body contract is left to the pending fix.

## Findings surfaced by the new tests

- **The `authorization_code` grant is unreachable over HTTP.** `GET /oauth/authorize` is `@Public()`, so
  `JwtAuthGuard` returns early and never attaches `request.user`; the controller therefore always takes the
  `access_denied` branch — even when a bearer token *is* supplied. Asserted by
  *"should not issue an authorization code because the route never carries a principal"*. Assumption UI-1
  (the credential form rendered inside this route) is not implemented, so no code can ever be minted and the
  token endpoint's success path cannot be reached end to end.
- **An expired `jti` is never sealed in the denylist.** `TokenService.consume` computes the denylist TTL from
  the *remaining* lifetime, which is `<= 0` for an expired token, so `add` stores an already-expired entry.
  Confirms review finding N12. Harmless today (expiry is also checked directly on consumption) but the
  production Redis implementation will inherit the same non-positive TTL. This was caught by a generated test
  and the over-specified assertion was corrected to the contract that actually matters — the token returns
  `null` and its row is dropped — rather than pinning the quirk as correct.
- **Registry gaps remain visible:** `loadRegisteredClients` returns an empty registry for
  malformed JSON (asserted as intended behaviour), while the missing *shape* validation of a syntactically
  valid but malformed entry is review finding M3 and is intentionally not enshrined by a test.

## Limitations

- **`nx test auth-service` still cannot pass in this environment.**
  `apps/auth-service/src/modules/users/repositories/user.repository.spec.ts` fails in `beforeAll` with
  `Exceeded timeout of 120000 ms for a hook` — it needs a reachable compose PostgreSQL. Pre-existing and
  environmental; it is the single failing suite above.
- The `429 RATE_LIMITED` path of `POST /oauth/token` is not covered: `RateLimitGuard` fails open while no
  `RateLimitStore` is injected, so the limit cannot be triggered without Redis.
- The six TypeORM entities, `main.ts` and `app.module.ts` remain untested at the unit level.
- `oauth.controller.ts`'s broad `catch { }` (review finding M4) is exercised only on the redirect path; its
  error-swallowing behaviour is not asserted.

## Next Steps

**Next by flow:** `/docs-generator` — but the implementation-side boot requirement and review findings C1–C3
should reach `/coder` first.
**Alternatives:**
- `/coder` `fix Task 6 review findings` — the blockers listed above.
- `/debugger` — only for the environment-blocked Postgres integration suite.

---

## Context Summary

Task 6's OAuth surface is covered by 5 new suites (69 tests) spanning both guards, the token lifecycle, the
module environment factories, and all five routes over the real HTTP stack — taking that surface from
4 suites / 25 tests to 8 / 78 and turning an e2e target that was already red into a green one. The pass also
surfaced that `AppModule` cannot boot without OAuth signing keys and that the `authorization_code` grant is
unreachable over HTTP while assumption UI-1 is unimplemented.

**Update (2026-10-06, C1-C3 fix pass):** the counts above are from the coverage pass. The C1-C3 fixes added
`guards/token-client.guard.spec.ts` and inverted the revoked-token assertions, so the OAuth surface is now
**9 suites / 92 tests** and the `auth-service` DB-free total is **12 suites / 106 tests**. See
`verify-backend-report.md` for the authoritative current numbers.

**Next Step:** `/verify` — or `/coder` first, for review finding R2 and the `AppModule` boot requirement.
