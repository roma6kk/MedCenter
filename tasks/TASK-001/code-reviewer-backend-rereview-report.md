# Code Review (re-review) — `auth-service` OAuth surface, C1–C3 fixes

- **Reviewer:** code-reviewer skill
- **Date:** 2026-10-06
- **Branch / worktree:** `feature/task-001-clinic-platform` @ `.worktrees/task-001-clinic-platform`
- **Supersedes the verdict in:** `code-reviewer-backend-report.md` (first pass) for C1–C3 only. That report's
  M1–M9 / N1–N15 remain the open list unless marked closed here.
- **DOD tier applied:** Standard
- **Scope reviewed:** `oauth-error.ts`, `filters/oauth-error.filter.ts`, `guards/token-client.guard.ts`,
  `guards/client.guard.ts`, `guards/authorize-page.guard.ts`, `oauth.service.ts`, `oauth.controller.ts`,
  `oauth.module.ts` — i.e. the C1–C3 change set, plus the specs it touched.

## Summary

**All three Criticals are closed, and no new Critical was introduced.** C1 and C3 are verified at the HTTP
layer (not merely at `getResponse()`), which was the specific weakness of the original test coverage; C2 is
verified at the service layer and cannot be reached over HTTP yet for a pre-existing reason (no authorization
code can be minted without the UI-1 credential form).

Two things temper the verdict:

1. **C2's fix contradicts the API spec.** The design goal — make `TOKEN_REVOKED` detectable — is achieved, but
   it is achieved by returning **401 `TOKEN_REVOKED` from `POST /oauth/token`**, while
   `specs/api-designer-spec.md` documents 2.1.3 as *"200 · 400 (`invalid_grant` / `unsupported_grant_type`) ·
   401 (`invalid_client`) · 429 (`RATE_LIMITED`)"* — `TOKEN_REVOKED` is not in that set. The fix satisfies the
   plan's prose and the error catalogue (`TOKEN_REVOKED: 401`) but not the API contract. **This needs a
   decision, not a patch** — see R1.
2. **C3 exposed a gap next to it.** The token endpoint now authenticates confidential clients, but
   `POST /oauth/token/revoke` still performs **no ownership check at all** (R2), and discovery does not
   advertise how clients should authenticate (R3). Neither is a regression, but both are now load-bearing.

Verdict: **C1 ✅, C2 ✅, C3 ✅.** As of 2026-10-06 the R1 caveat is resolved (option (b)) and R2, R3, M1 and
M4 are closed, so the blockers this review named are gone.

## Status of the previous Criticals

| Finding | Status | Evidence |
| --- | --- | --- |
| **C1** — OAuth `error` erased by `ProblemDetailsFilter` | ✅ **Closed** | `@Catch(OAuthError)` + `@UseFilters(OAuthErrorFilter)` on the controller. e2e asserts `error`, `error_description`, `application/json` and `Cache-Control: no-store` for `invalid_client` (401), `invalid_request` (400) and `unsupported_grant_type` (400). Scoping proven: a non-`OAuthError` from a revoke route still renders `application/problem+json`. |
| **C2** — `TOKEN_REVOKED` unreachable | ✅ **Closed** | Two consumers now exist. (i) `OAuthService.refresh` consults `tokens.isDenied()` before the store lookup, so a revoked/rotated refresh token is rejected; after R1(b) that answer is **400 `invalid_grant`**, matching §2.1.3. (ii) `JwtAuthGuard` consults the issuer denylist through the shared `TOKEN_REVOCATION` provider and answers **401 `TOKEN_REVOKED`** on a denied `jti`/`sid` — reachable over HTTP and asserted by `oauth.e2e-spec.ts`. |
| **C3** — `401 invalid_client` unreachable on the token endpoint | ✅ **Closed** | `TokenClientGuard` on `POST /oauth/token`. e2e asserts `invalid_client` for a missing, unknown and wrong-secret client, and that a correctly-authenticated confidential client passes the guard and reaches the grant handler. `isPublic` is now read (`verifySecret`), closing N6. |

Also closed as a side effect: **M6** (plan-mandated HTTP test — written in the coverage pass) and **M7**
(both guards now have unit specs, plus a new `token-client.guard.spec.ts`).

## Verification evidence

| Check | Command | Result |
| --- | --- | --- |
| auth-service unit (DB-free) | `npx jest -c apps/auth-service/jest.config.ts --testPathPattern "src/(modules/oauth\|database\|app)"` | **PASS** 12 suites / 106 tests |
| E2E | `npx nx e2e auth-service --skip-nx-cache` | **PASS** 2 suites / 25 tests, exit 0 |
| Lint (incl. specs) | `npx nx run-many --target=lint --projects=auth-service,contracts,common,config` | **PASS** exit 0 |
| Typecheck | `npm run typecheck` | **PASS** exit 0 |
| Build | `npx nx build auth-service` | **PASS** exit 0 |
| DoD test gate | `npx nx run-many --target=test --all` | **INCOMPLETE** — `config` 8, `contracts` 30, `common` 36 all **PASS**; the run was aborted while `auth-service` was in progress. `auth-service` cannot pass here (Postgres integration spec), so the gate fails regardless. |
| TODO/FIXME/HACK | `grep` over the OAuth surface | **clean** |
| Test artifacts in build | `find dist/apps/auth-service` | no spec leakage from this pass; the three new impl modules are present in `dist` |

## Issues Found

### Critical (Must Fix)

None.

### Major (Should Fix)

- [x] **R1 — C2's `TOKEN_REVOKED` response diverges from the documented API contract.**
  **Resolved 2026-10-06 — option (b).** The token endpoint stays strictly RFC 6749 (`OAuthError.invalidGrantRevoked` → **400 `invalid_grant`** for any unusable refresh token), and `TOKEN_REVOKED` (401) is surfaced at the guard layer instead. The caveat this finding raised — that (b) "requires access-token `jti`s to become denylistable, which the `auth.oauth_token` entity (`kind: 'code' | 'refresh'`) does not support" — was solved without a schema change: `issuePair` mints the refresh token first and stamps its `jti` onto the access token as the `sid` claim, so revoking the refresh token denies the paired access token too. `specs/api-designer-spec.md` and `specs/docs-generator-implementation.md` were amended to match.
  `OAuthError.revoked()` returns **401** with `error: 'invalid_grant'` / `errorCode: 'TOKEN_REVOKED'`
  (`oauth-error.ts`). `specs/api-designer-spec.md` §2.1.3 enumerates the statuses for that endpoint and does
  **not** include `TOKEN_REVOKED`. The status quo therefore satisfies the plan's Task 6 prose and
  `ERROR_CODE_HTTP_STATUS.TOKEN_REVOKED` (401) while contradicting the API spec a SMART client is built
  against. Two coherent resolutions, and this is a product/contract call rather than a code fix:
  - **(a)** Amend the API spec to add `401 (TOKEN_REVOKED)` to 2.1.3, keeping the plan's intent; or
  - **(b)** Keep the token endpoint strictly RFC 6749 (`400 invalid_grant` for any unusable refresh token) and
    surface `TOKEN_REVOKED` where 401 is unambiguous — the guard layer, on a Bearer token whose `jti` is
    denied. Note (b) requires access-token `jti`s to become denylistable, which the `auth.oauth_token` entity
    (`kind: 'code' | 'refresh'`) currently does not support.
  Pick one before `/verify`; the current state is intentionally documented but undecided.

- [x] **R2 — `POST /oauth/token/revoke` has no ownership check.** **Closed 2026-10-06.** `OAuthService.revoke` resolves the stored token and denies it only when its `userId` matches the authenticated `sub` (and `client_id`, when supplied, matches its owner); everything else is a `{ revoked: false }` no-op. Asserted at the service and controller layers and documented in §2.1.4. `OAuthController.revoke` →
  `OAuthService.revoke(refreshToken)` → `TokenService.revoke(jti)` deletes and denies whatever `jti` it is
  handed. The only authentication is the global Bearer guard, so **any authenticated principal can revoke any
  refresh token whose value it knows**. RFC 7009 §2.1 requires the server to validate that the token was issued
  to the authenticating client; `specs/api-designer-spec.md` §2.1.4 is silent on this, which is why it survived
  both passes. Exploitability is limited (refresh tokens are opaque 128-bit secrets), so this is Major rather
  than Critical — but it is an authorization gap on a security endpoint, and C3's work on the sibling route
  makes its absence conspicuous. Fix by resolving the token's `clientId` and comparing it with the
  authenticated client/principal before denying.

- [x] **R3 — Discovery does not advertise `token_endpoint_auth_methods_supported`.** **Closed 2026-10-06.** `smartConfiguration()` now publishes `token_endpoint_auth_methods_supported: ['client_secret_post', 'none']` and `grant_types_supported: ['authorization_code', 'refresh_token']`, asserted by `oauth.controller.spec.ts` and documented in §2.1.1.
  `GET /.well-known/smart-configuration` publishes endpoints, scopes, `response_types_supported` and
  `code_challenge_methods_supported`, but not `token_endpoint_auth_methods_supported` (nor
  `grant_types_supported`) — both required for a SMART client to discover how to authenticate. Before C3 this
  was harmless (the endpoint was effectively public); now that confidential clients must post a
  `client_secret`, clients have no way to learn that. Add
  `token_endpoint_auth_methods_supported: ['client_secret_post', 'none']` alongside `grant_types_supported`.

### Minor (Consider)

- [ ] **R4 — `client_secret` is not declared on `TokenRequestDto`.** `TokenClientGuard` reads it from the raw
  body, which works today because guards run before pipes, but the type documents only part of the request
  contract for two endpoints.
- [ ] **R5 — `error_description` distinguishes "Unknown client_id" from "Client authentication failed"**,
  allowing client-id enumeration. Worth collapsing for confidential clients if that matters.
- [ ] **R6 — `unsupported_grant_type` reflects attacker-controlled input.** `OAuthError.unsupportedGrantType`
  interpolates `String(body.grant_type)` into `error_description`. Safe as JSON, but it is reflected input on a
  public endpoint; a bounded value would be safer if any consumer renders it as markup.
- [ ] **R7 — `invalid_grant` and `unsupported_grant_type` map to `errorCode: 'VALIDATION_ERROR'`.** The
  catalogue has no better fit, but "validation error" is misleading for an expired or already-used
  authorization code. Either add an OAuth-appropriate catalogue code or omit `errorCode` where none is
  meaningful.
- [ ] **R8 — C2's fix introduces a revoked-vs-unknown oracle.** `401 TOKEN_REVOKED` and `400 invalid_grant` now
  reveal whether a presented `jti` previously existed. Impractical to exploit against random UUIDs, and the
  trade is deliberate, but it should be a conscious choice rather than a side effect.
- [ ] **R9 — `OAuthErrorFilter` and `oauth-error.ts` have no unit spec.** Both are covered end-to-end by the
  e2e suite, which is stronger evidence than a unit test here; noted for completeness rather than as a gap.

### Still open from the first pass (unchanged)

`M1` (no global `ValidationPipe` — **blocks Task 7's DTOs**), `M2` (token rate limit keys on IP, not
`clientId`+IP), `M3` (unvalidated `OAUTH_CLIENTS_JSON` cast), `M4` (bare `catch { }` in `authorize` — still
present and still the broadest defect on this surface), `M5` (the mislabelled scope-narrowing test and the
empty-scope case), `M8` (success responses still lack `Cache-Control: no-store` — only error responses now
carry it), `M9` (`main.ts` bootstrap), and `N1`–`N5`, `N7`–`N15`.
`N6` (`isPublic` dead) is **closed** by C3.

### Positive Notes

- The C1 fix is scoped correctly and conservatively: `@Catch(OAuthError)` means the global RFC 7807 filter
  keeps serving the other seven BFF services, and non-OAuth failures on OAuth routes still produce problem
  documents. This is the right shape rather than a global behaviour change.
- The e2e suite earned its keep twice in this pass — it caught the missed `AuthorizePageGuard` conversion and
  now pins the envelope, the `no-store` header and the confidential-client paths.
- C2's change is a genuine improvement in test quality: the previously incorrect assertion was inverted so the
  test now proves the intended behaviour rather than the accidental one.
- `verifySecret` fails closed for a confidential client with no configured secret — the safe default.
- No `any`, no `!`, no TODO markers, and `readonly` interfaces throughout the new code.

## Definition of Done (Standard tier)

| Item | Status |
| --- | --- |
| No uncommitted changes belonging to the task | ⚠️ 21 entries still uncommitted; branch has no commits of its own |
| Skill-prefix file naming | ✅ `code-reviewer-backend-rereview-report.md` |
| Tests pass | ⚠️ scoped suites pass (12/106 unit, 2/25 e2e); `test --all` incomplete and cannot pass (`auth-service` Postgres spec) |
| Lint passes | ✅ |
| Build succeeds | ✅ |
| No TypeScript errors | ✅ |
| New code has test coverage | ✅ unit + e2e for all three fixes |
| No OWASP Top 10 regressions | ⚠️ R2 (missing authorization on revocation) |
| Reviewed against `GOLDEN-PRINCIPLES.md` | ✅ for the change set |

## Context Summary

The C1–C3 fixes are effective and verified where it matters: the RFC 6749 envelope now survives to the wire
with correct scoping, `TOKEN_REVOKED` is produced for revoked and rotated refresh tokens, and the token
endpoint genuinely authenticates clients while enforcing `isPublic`. No new Critical was introduced. The
outstanding concerns are that C2's chosen status code contradicts the API spec and needs a decision (R1),
revocation has no ownership check (R2), and discovery does not publish the auth methods C3 depends on (R3).

**Next Steps (STOP — choose one):**

**Next by flow:** `/verify` — the review loop is closed; C1–C3 are resolved. Note that `/verify` will fail the
Standard-tier test item until the Postgres integration spec can run or skip, so consider that fix first.

**Alternatives:**
- `/coder` — done 2026-10-06: R1(b)+R2+R3 and M1/M4 are closed, and the guard-layer denylist check that
  R1(b) depends on is implemented and covered by `apps/auth-service/test/oauth.e2e-spec.ts`.
- `/docs-generator` — done 2026-10-06: the API spec and the OAuth docs were amended for R1(b), the `sid`
  claim and the discovery fields.
- Still open from this pass: M2, M3, M5, M8, M9, R4–R9, N1–N5/N7–N15.
