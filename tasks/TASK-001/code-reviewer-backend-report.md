# Code Review — `auth-service` backend (Task 6: SMART / OAuth2 endpoints, API 2.1.1–2.1.5)

- **Reviewer:** code-reviewer skill
- **Date:** 2026-10-06
- **Branch / worktree:** `feature/task-001-clinic-platform` @ `.worktrees/task-001-clinic-platform`
- **Scope:** `apps/auth-service/src/modules/oauth/**`, `apps/auth-service/src/app/app.module.ts`, `libs/config/src/lib/env.schema.ts` (+ its spec). Backend only; the frontend was reviewed separately.
- **DOD tier applied:** Standard (implementation task)

## Summary

The layering, PKCE handling and token lifecycle are genuinely good: PKCE is `S256`-only with a constant-time
compare, authorization codes are single-use and consumed *before* the PKCE/client checks, `redirect_uri` is
matched by exact registration, and refresh rotation has reuse detection. The store/denylist/registry sit
behind interfaces, so the move to Redis/TypeORM is a provider swap.

However the task is **not done**: two of the controls the plan names explicitly are inert.

1. **The OAuth error envelope never reaches the wire.** The global `ProblemDetailsFilter` rewrites every
   exception into RFC 7807 and drops the `error` field, so `invalid_grant` / `unsupported_grant_type` /
   `invalid_client` are unreachable as API 2.1.3 specifies. Proven by running the filter (evidence below).
2. **`TOKEN_REVOKED` is unreachable.** The denylist has no consumer anywhere in the repository — nothing
   calls `TokenService.isDenied()` and `libs/common`'s guard stack has no revocation support at all. Refresh
   revocation deletes a row and stops there; a replayed token returns `invalid_grant`, not `TOKEN_REVOKED`.

Also blocking: no global `ValidationPipe` exists, so every DTO validator in the module is decorative, and the
plan-mandated HTTP-level test (`test/oauth.e2e-spec.ts`) was never written — which is precisely why findings
#1 and #3 below survived the unit suite.

**Recommendation: do not advance to `/test-generator` on this surface yet.** Fix Critical/Major, then review.

## Verification evidence (re-runnable)

| Check | Command | Result |
| --- | --- | --- |
| OAuth unit suites | `npx jest -c apps/auth-service/jest.config.ts --testPathPattern "src/modules/oauth"` | **PASS** 4 suites / 25 tests |
| auth DB-free total | `npx jest -c apps/auth-service/jest.config.ts --testPathPattern "src/(modules/oauth\|database)"` | **PASS** 6 suites / 38 tests |
| Libs | `npx nx run-many --target=test --projects=contracts,common,config --skip-nx-cache` | **PASS** contracts 5/30, common 8/36, config 1/8 |
| Lint | `npx nx run-many --target=lint --projects=auth-service,contracts,common,config` | **PASS** (exit 0) |
| Typecheck | `npm run typecheck` (`tsc --noEmit -p tsconfig.base.json`) | **PASS** (exit 0) |
| Build | `npx nx build auth-service` | **PASS** (exit 0, +3 dependency tasks) |
| Full project test | `nx test auth-service` | **COULD NOT RUN** — hangs on the compose-PostgreSQL integration spec `user.repository.spec.ts` (pre-existing/environmental). New DB-free specs pass in isolation. |
| E2E target | `nx e2e auth-service` | **NOT RUN** — needs the full stack. |

**Probe:** a throwaway spec drove `ProblemDetailsFilter.catch()` with the exact exceptions the controller
throws (deleted afterwards, no source change). Observed bodies:

```
INVALID_GRANT  => {"status":400,"type":"application/problem+json","body":{"type":"https://api.medcenter.by/errors/validation-error","title":"BadRequestException","status":400,"detail":"code is invalid","instance":"/oauth/token","requestId":"rid-1","errorCode":"VALIDATION_ERROR"}}
INVALID_CLIENT => {"status":401,"type":"application/problem+json","body":{"type":"https://api.medcenter.by/errors/unauthenticated","title":"UnauthorizedException","status":401,"detail":"Unknown client_id","instance":"/oauth/token","requestId":"rid-1","errorCode":"UNAUTHENTICATED"}}
UNSUPPORTED    => {"status":400,"type":"application/problem+json","body":{"type":"https://api.medcenter.by/errors/validation-error","title":"BadRequestException","status":400,"detail":"nope","instance":"/oauth/token","requestId":"rid-1","errorCode":"VALIDATION_ERROR"}}
```

## DoD cross-reference (Standard tier)

| DoD item | Status |
| --- | --- |
| No uncommitted changes belonging to the task | ⚠️ All Task 6 files are still uncommitted in the worktree |
| Skill-prefix file naming (`code-reviewer-…`) | ✅ this file |
| Tests pass | ⚠️ Partial — full `nx test auth-service` cannot complete (see above) |
| Lint passes | ✅ |
| Build succeeds | ✅ |
| No TypeScript errors | ✅ |
| New code has test coverage | ⚠️ Partial — controllers/service/pkce/jwt covered; both guards, the module factories and the HTTP layer are not |
| No OWASP Top 10 regressions | ❌ See Critical #1, Critical #2, Major #4 |
| Reviewed against `GOLDEN-PRINCIPLES.md` | ⚠️ See Minor #22 (`!`), #25 (`should … when …`) |
| No unresolved TODO/FIXME/HACK | ✅ `grep` clean |

---

## Issues Found

### Critical (Must Fix)

> **Status 2026-10-06: C1, C2 and C3 are CLOSED.** Verified in
> `code-reviewer-backend-rereview-report.md`; C2's chosen status code is flagged there as **R1** (divergence
> from `specs/api-designer-spec.md` §2.1.3) and still needs a decision.

- [x] **C1 — The OAuth `error` field is erased before it reaches the client (API 2.1.3 contract violation).**
  `ProblemDetailsFilter` (`libs/common/src/lib/filters/problem-details.filter.ts:84-101`) serialises only
  `type/title/status/detail/instance/requestId/errorCode`, and `readExplicitErrorCode` (`:103-112`) looks for
  `errorCode`, not `error`. The controller throws `{ error: 'invalid_grant', message }`
  (`oauth.service.ts:48-50`, `oauth.controller.ts:153-176`), so the `error` key is dropped and
  `toErrorCode(400)` (`:127-130`) resolves the *first* 400 in the catalogue — `VALIDATION_ERROR`
  (`libs/contracts/src/lib/error-code.ts:23`). A SMART app branching on `error === 'invalid_grant'` (RFC 6749
  §5.2) cannot work. `invalid_client` degrades to `errorCode: 'UNAUTHENTICATED'`. Proven by probe above.
  *Fix direction:* either let the OAuth routes bypass the RFC 7807 filter (an OAuth-specific exception filter
  returning `{error, error_description}` with `Cache-Control: no-store`), or make the filter preserve an
  explicit `error` discriminator. The 400/401 tests in `oauth.controller.spec.ts` assert the **pre-filter**
  shape (`error.getResponse()`), so they cannot detect this — the assertion needs to move to the HTTP layer.

- [x] **C2 — `TOKEN_REVOKED` is unreachable; the revocation denylist has no consumer.**
  The task description ties the denylist to `TOKEN_REVOKED`: *"the consumed `jti` goes into the Redis
  denylist, which is what makes `TOKEN_REVOKED` detectable"* plan (`tasks/TASK-001/writing-plans-plan.md`, Task 6). In practice `TokenService.isDenied()` (`token.service.ts:134-136`) is called from nowhere —
  `grep -rn "isDenied" apps libs` returns only its own definition — and `libs/common` contains no
  denylist/revocation code at all (`grep -rni "denylist\|revoked\|revocation" libs/common/src` → `NONE`).
  Consequences: access-token `jti`s are never persisted or denied (they are generated fresh at
  `jwt.service.ts:58`), so `POST /oauth/token/revoke` cannot invalidate an access token; and a *replayed*
  refresh token returns `invalid_grant` (400) rather than `TOKEN_REVOKED` (401). Revocation is currently a
  storage side-effect with no enforcement point. `oauth.service.spec.ts:215-238` locks in the wrong behaviour
  by asserting `invalid_grant` after `revoke()`.

- [x] **C3 — `401 invalid_client` is unreachable on `POST /oauth/token`.**
  `ClientGuard` is mounted only on `authorize` (`oauth.controller.ts:105`). The token endpoint trusts
  `client_id` from the body (`:150-172`) and never authenticates the client. A mismatched `client_id` is
  handled by `exchangeCode`/`refresh` as `invalid_grant` (400) (`oauth.service.ts:99-101`, `:114-116`), so the
  `invalid_client` (401) response API 2.1.3 specifies cannot occur. Related: `RegisteredClient.isPublic`
  (`guards/client.guard.ts:14`) is declared but never read anywhere in the repository — the field advertises
  confidential-client support that does not exist.

### Major (Should Fix)

- [x] **M1 — No global `ValidationPipe` exists, so every DTO validator in the module is dead code.**
  **Closed 2026-10-06.** `createValidationPipe()` (`libs/common/src/lib/pipes/validation.pipe.ts`, `whitelist` + `transform`) is mounted by `apps/auth-service/src/main.ts` and by the e2e suite, so the pipeline under test is the pipeline that ships. `TokenRequestDto` was reworked in the same change so the pipe cannot hijack the RFC 6749 envelopes: `grant_type` is no longer an `@IsIn` whitelist (an unsupported grant must stay `unsupported_grant_type`, not become a validation failure) and the per-grant fields carry no `@MinLength(1)` (an empty form value means "absent" and stays `invalid_request`). Proven over HTTP by *"should reject a form field that arrives with the wrong type"* (`problem+json` + `VALIDATION_ERROR`) plus the two contract-preservation cases in `apps/auth-service/test/oauth.e2e-spec.ts`.
  `grep -rn "useGlobalPipes\|ValidationPipe" apps libs tools --include=*.ts` → `NONE`. `TokenRequestDto`
  (`dto/token-request.dto.ts`) is bound with `@Body()` but `@IsIn`/`@MinLength` never execute, and
  `whitelist`/`transform` are absent. The controller's hand-rolled presence checks happen to compensate today,
  but `main.ts` has no pipe at all, so Task 7's `register-patient.dto.ts` / `update-user.dto.ts` will silently
  not validate either. Nothing verifies that `application/x-www-form-urlencoded` bodies are even parsed — the
  DTO comment asserts the content type that nothing tests.

- [ ] **M2 — The token rate limit keys on IP only, not `clientId`+IP as the plan specifies.**
  The plan's route table says `POST /oauth/token` → *"20 req/min by `clientId`+IP"*.
  `buildRateLimitKey` (`libs/common/src/lib/guards/rate-limit.guard.ts:36-41`) uses
  `request.user?.sub ?? request.ip ?? 'anonymous'`; the route is `@Public()`, so `user` is always undefined and
  the identity collapses to the IP. `client_id` in the body is never consulted, so one noisy client behind a
  shared NAT exhausts the budget for every other client on that address.

- [ ] **M3 — `loadRegisteredClients` casts unvalidated external JSON.**
  `oauth.module.ts:45-56` does `JSON.parse(raw)` then `parsed as ReadonlyArray<RegisteredClient>`. A
  `OAUTH_CLIENTS_JSON` entry missing `redirectUris` throws a `TypeError` at `client.redirectUris[0]`
  (`oauth.controller.ts:110`) or `allowed.includes(...)` (`oauth.service.ts:58`) → 500 on a public endpoint;
  malformed JSON silently degrades to an empty registry, where every client gets `401 invalid_client`,
  indistinguishable from a real auth failure. Parse it with the existing `zod` dependency and fail fast at
  boot instead.

- [x] **M4 — `authorize` swallows every server-side error as `?error=access_denied`.**
  **Closed 2026-10-06.** The bare `catch { }` is now a typed catch: only an `OAuthError` — the domain failure of this surface — bounces with `?error=access_denied`, and it is logged at warn with the `client_id`; everything else is rethrown to `ProblemDetailsFilter`, which logs it with the request id and answers 500. Asserted by *"should let an infrastructure failure reach the global filter instead of reporting access_denied"* and *"should bounce a domain failure to the client with access_denied"* in `oauth.controller.spec.ts`.
  `oauth.controller.ts:142-144` catches with a bare `catch { }` and redirects. The intent (never leak client
  material) is right, but an infrastructure failure — store or denylist unreachable, signing key rejected,
  registry down — is reported to the user as a denial, is not logged, and is invisible to monitoring.
  `GOLDEN-PRINCIPLES.md` → "Never swallow errors with empty catch blocks"; `DOD.md` → "Log errors with
  context". Narrow the catch to the expected domain errors and let the rest reach `ProblemDetailsFilter`.

- [ ] **M5 — A test claims to verify scope narrowing but verifies something else.**
  `oauth.service.spec.ts:64-83`, *"should drop scopes the client is not registered for"*, exchanges with
  `codeVerifier: 'placeholder'` and asserts only `tokens === null` — that is the PKCE-failure path, not
  narrowing. `narrowScope` (`oauth.service.ts:53-59`) — the control that stops a client from obtaining scopes
  it was never registered for — has **no** assertion in the suite. Compounding it, when *every* requested
  scope is unregistered `narrowScope` returns `''` and a token is still issued with an empty scope instead of
  `invalid_scope`.

- [x] **M6 — The plan-mandated HTTP test `apps/auth-service/test/oauth.e2e-spec.ts` was never written.**
  Task 6's `Test:` line names it; `apps/auth-service/test/` contains only `jwt-perimeter.e2e-spec.ts`. None of
  the five new routes is exercised over HTTP, which is exactly the gap that hides C1 and C3. The existing
  `oauth.controller.spec.ts` calls controller methods directly with hand-built request objects, so the global
  guard stack, the filter, parameter binding and the `@RateLimit` decorator are all untested.

- [x] **M7 — Neither guard has any test.** `ClientGuard` (the `invalid_client` + registered-`redirect_uri`
  enforcement) and `AuthorizePageGuard` (the `S256`-only enforcement) have zero coverage; the only guard test
  file in the worktree is the unrelated `libs/common/src/lib/decorators/metadata-decorators.spec.ts`. These are
  the security-critical entry points of the surface.

- [ ] **M8 — Missing `Cache-Control: no-store` on token responses.** RFC 6749 §5.1 requires
  `Cache-Control: no-store` and `Pragma: no-cache` on responses containing tokens. Nothing in the codebase
  sets them (no global interceptor or serialiser), so an intermediary may cache a token response.

- [ ] **M9 — `main.ts` provides no boundary handling and discards bootstrap failures.**
  `main.ts:5-10` is `void bootstrap()` with no `enableShutdownHooks()`, no global prefix and no logging;
  a failed boot becomes an unhandled rejection rather than a logged fatal. Given C1/M1 this is the natural
  place to mount the OAuth-aware pipe/filter configuration.

- [x] **M10 — `POST /oauth/token` and `POST /oauth/token/revoke` answered 201 Created.**
  **Closed 2026-10-06.** Nest defaults a POST handler to 201; RFC 6749 §5.1 and `specs/api-designer-spec.md`
  §2.1.3/§2.1.4 require **200**. Both routes now declare `@HttpCode(HttpStatus.OK)`. Found by the new e2e
  revocation chain, which is the first test on this surface to assert the *success* status of the token
  endpoint — every earlier HTTP test exercised error paths only, which is why it survived three passes.

### Minor (Consider)

- [ ] **N1 — `refresh_uri` cross-check missing.** `TokenRequestDto.redirect_uri` is accepted and then ignored;
  RFC 6749 §4.1.3 requires the token request's `redirect_uri` to be present and identical to the authorize
  request's when it was supplied. Nothing cross-checks it.
- [ ] **N2 — Inconsistent parameter naming between the two token routes.** `POST /oauth/token` is snake_case
  (`grant_type`, `refresh_token`) while `RevokeRequestDto` is camelCase (`refreshToken`,
  `oauth.controller.ts:36-38`, `:180-188`). RFC 7009 uses `token` + `token_type_hint`; aligning on snake_case
  would also let the DTO be validated like its sibling.
- [ ] **N3 — No `code_verifier` length validation.** RFC 7636 §4.1 mandates 43–128 characters; a one-character
  verifier is currently accepted (`oauth.service.ts:102`).
- [ ] **N4 — `response_type` is never validated.** `smart-configuration` advertises
  `response_types_supported: ['code']` (`oauth.controller.ts:91`) but `authorize` ignores the parameter, so
  `response_type=token` silently yields a code.
- [ ] **N5 — `smartConfiguration` bypasses the config lib.** `oauth.controller.ts:94` reads
  `process.env['FHIR_BASE_URL']` directly instead of `loadEnv()`/`parseEnv()` from `@medcenter/config`,
  skipping the validated, cached schema; `?? ''` silently advertises an empty `fhir_base`. Its spec then mutates
  `process.env` in place (`oauth.controller.spec.ts:43`) without restoring it, leaking into other suites in the
  same Jest worker.
- [ ] **N6 — `isPublic` is dead.** Declared at `guards/client.guard.ts:14`, referenced only by the module
  comment and a test fixture (see C3).
- [ ] **N7 — Magic string for the default role.** `oauth.service.ts:126` defaults `role` to the literal
  `'PATIENT'` while `@medcenter/contracts` exports the `Role` enum; `AccessTokenClaims.role` is typed `string`
  rather than `Role`.
- [ ] **N8 — `readQueryString` is duplicated verbatim** in `oauth.controller.ts:52-55` and
  `guards/client.guard.ts:53-56`.
- [ ] **N9 — Test fixtures are emitted into `dist`.** `__tests__/test-keys.ts` lives under `src/`;
  `tsconfig.app.json` excludes only `**/*.spec.ts` / `**/*.test.ts`, so `nx build auth-service` produces
  `dist/apps/auth-service/src/modules/oauth/__tests__/test-keys.js` (verified). Move the helper to `test/` or
  add `src/**/__tests__/**` to the exclude list.
- [ ] **N10 — Each suite generates a fresh 2048-bit RSA key pair.** `createTestKeys()`
  (`__tests__/test-keys.ts:9-17`) runs per spec file; measured suite times were 7.0–9.8 s each (~35 s of wall
  clock across four suites). One module-level key pair or a checked-in test key would cut that substantially.
- [ ] **N11 — Misleading harness construction.** `oauth.service.spec.ts:48` builds a complete second
  `createHarness()` just to reach the stateless `pkce.generate()`.
- [ ] **N12 — `revoke` always denies for the full 14-day refresh TTL.** `token.service.ts:138-141` applies
  `REFRESH_TOKEN_TTL_SECONDS` even when the `jti` belongs to a 5-minute authorization code; also
  `InMemoryTokenDenylist.add` (`:63-65`) will happily store an already-expired entry when the TTL computes
  negative. Harmless today, but the production denylist will inherit the semantics.
- [ ] **N13 — Signing key is re-parsed on every token.** `jwt.service.ts:73` calls
  `createPrivateKey(...)` per signing call; the `KeyObject` could be created once in the module factory
  (hottest path in the service).
- [ ] **N14 — One key, no rotation.** `jwks.service.ts:21` publishes a single key with no `key_ops` and no
  overlap window, so `JWT_KEY_ID` rotation invalidates every outstanding access token.
- [ ] **N15 — Golden-principles deviations.** `dto/token-request.dto.ts:6` uses a `!` non-null assertion
  (`grant_type!`), which `GOLDEN-PRINCIPLES.md` bans; `token.service.ts` and `client.guard.ts` hold multiple
  classes per file against "one class per file"; and most of the 25 test names omit the mandated
  `should {expected} when {condition}` form.

### Positive Notes

- PKCE is implemented correctly and conservatively: `S256` only, `timingSafeEqual` for the comparison
  (`pkce.service.ts:29-34`, with a comment naming CWE-208), and `plain` is never an option.
- Authorization codes are consumed *before* the PKCE and `client_id` checks (`oauth.service.ts:95-104`), so a
  failed attempt cannot be brute-forced with a leaked code — the delete-then-deny ordering in
  `TokenService.consume` (`token.service.ts:121-132`) is the right call.
- `redirect_uri` is matched by exact registration, not prefix (`guards/client.guard.ts:39-46`), which closes the
  usual open-redirect hole. Unauthenticated `authorize` failures bounce only to that registered URI
  (`oauth.controller.ts:57-64`, `:120-125`).
- Refresh rotation genuinely detects reuse: the presented token is deleted and denied, and
  `oauth.service.spec.ts:183-213` asserts both that the old token fails and that the rotated one still works.
- `JWKS` excludes the private component — asserted (`oauth.controller.spec.ts:62` `not.toHaveProperty('d')`).
- Clean layering: controller → service → store/denylist behind interfaces, with the persistence swap reduced to
  a provider change (`oauth.module.ts:69-71`). `TokenRequestDto` and `AccessTokenPayload` are explicit
  interfaces with `readonly` members and no `any` anywhere in the module.

---

## Context Summary

Task 6's implementation is structurally sound — PKCE, single-use codes, rotation and exact-match redirects are
all correct — but the surface does not satisfy API 2.1.3 as written: the global problem-details filter erases
the OAuth `error` discriminator (proven by executing the filter), `TOKEN_REVOKED` has no consumer anywhere so
revocation is unenforced, and `401 invalid_client` is unreachable on the token endpoint. DTO validation is
inert because no `ValidationPipe` is mounted, and the plan's HTTP-level test was never written, which let the
wire-format defects through the unit suite.

**Next Steps (STOP — choose one):**

1. **By flow:** `/test-generator` — but only after Critical/Major are fixed; generating tests against the
   current wire format would enshrine C1.
   → Recommended instead:
2. **Alternative:** `/coder` — fix C1–C3 and M1–M9, then re-run this review.
3. **Alternative:** `/finishing-branch` — not yet: Critical findings are open and the full `nx test
   auth-service` target cannot pass in this environment.
