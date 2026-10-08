# Code Review — auth-service priority-fix batch (M2, M3, M5, M8, M9, N4, N5, N7, N8, R4)

Scope: uncommitted changes under `apps/auth-service` and `libs/common/src/lib/guards/rate-limit.guard.ts`
(as listed in `review-findings-final-checklist.md`).

## Summary

Most fixes are correct and well tested (M3 zod fail-fast, M8 headers, M9 bootstrap, N7, N8, R4).
Changes requested: **M2 adds a rate-limit bypass and a way to lock out a legitimate client**, and
two other fixes only partly do what the checklist says (N4, M5 on the HTTP surface).

## Issues Found

### Critical (Must Fix)

- [ ] **M2: the rate-limit key now comes from a `client_id` the caller controls, and the IP is dropped** —
  `libs/common/src/lib/guards/rate-limit.guard.ts:767-777`.
  `RateLimitGuard` is an `APP_GUARD` (`apps/auth-service/src/app/app.module.ts:52`), so it runs
  **before** `TokenClientGuard` checks the client. `body.client_id` is unauthenticated input, and when
  it is present it replaces the IP in the key entirely:
  1. *Bypass:* an attacker sends `client_id=x1`, `x2`, … and gets a new 20/min bucket on every request.
     This removes the brute-force limit on `/oauth/token` (secret guessing for confidential clients,
     code/refresh-token probing).
  2. *Lockout:* anyone on any IP can send 21 requests/min with `client_id=medcenter-web`, which
     exhausts that client's single shared bucket for every real user. The fix makes the noisy-neighbour
     problem it was meant to solve worse.
  3. *Too broad:* the guard is global. On any POST whose body has a `client_id`, that value now
     replaces `user.sub`. `POST /oauth/token/revoke` accepts `client_id`, so a signed-in user can also
     rotate buckets there.

  **Fix:** combine the two values instead of replacing one with the other: `${clientId ?? '-'}|${ip}`.
  Only read `body.client_id` when there is no authenticated principal. Optionally cap it at a short
  length. Add tests that (a) two `client_id`s from the same IP get separate buckets **and** (b) one IP
  rotating `client_id` cannot grow past N buckets, or at least still keys on the IP.

### Major (Should Fix)

- [ ] **N4: a missing `response_type` is still accepted** — `guards/authorize-page.guard.ts:200-205`.
  The `responseType !== undefined &&` short-circuit lets `/oauth/authorize` without `response_type`
  issue a code. RFC 6749 §4.1.1 says `response_type` is REQUIRED. Use `if (responseType !== CODE_RESPONSE_TYPE)`
  and add a test for the "absent" case. Check first that the frontend BFF always sends it (it should).
- [ ] **M5: `invalid_scope` never reaches the client over HTTP** — `oauth.controller.ts:93-100, 193-206`.
  `OAuthService.authorize` now throws `OAuthError.invalidScope`. The controller catches every `OAuthError`
  and redirects with `errorRedirect`, which hard-codes `error=access_denied`. So the SMART client cannot
  branch on `invalid_scope`, which is the reason given in `oauth-error.ts:244-247`. Pass the error's
  `error` code into `errorRedirect` (RFC 6749 §4.1.2.1). Add a controller or e2e test that asserts
  `error=invalid_scope` in the `Location` header. Today only the service is tested.

### Minor (Consider)

- [ ] **N5 still fails silently** — `oauth.controller.ts:345-350`. A malformed `FHIR_BASE_URL` is now
  advertised as `''` exactly as before, with nothing logged. Either log a warning once, or move
  `FHIR_BASE_URL` into the env schema and fail at boot as M3 does. Also, `z.url()` (zod 4) accepts any
  scheme. Use `z.url({ protocol: /^https?$/ })` to restrict it to http(s).
- [ ] **M3 schema does not encode the confidential-client rule** — `oauth.module.ts:455-461`.
  `{ isPublic: false }` with no `clientSecret` passes validation. That client then fails every token call
  with `401 invalid_client` (`verifySecret` fails closed, so this is safe), which is the "looks like
  a real auth failure" symptom M3 was meant to remove. Add `.refine(c => c.isPublic || !!c.clientSecret)`.
- [ ] **M5 edge case:** a client registered with `scopes: []` and an empty request still gets a token with
  an empty scope (`oauth.service.ts:582-584`), although the comment says this "must never be minted".
- [ ] **N7 wording** — `oauth.service.ts:604`: `const defaultRole: string = Role.PATIENT` widens the type
  just to satisfy `??`. Writing `stored.role ?? Role.PATIENT` inline should typecheck too.
- [ ] **M9 duplication** — `main.ts:90-91`: `process.env['PORT'] ?? 3001` appears twice. Read it once into
  a `port` const. The comment "terminate (not just warn) on a signal so in-flight requests drain"
  oversells `enableShutdownHooks()`, which only runs lifecycle hooks.
- [ ] **Checklist accuracy** — `review-findings-final-checklist.md:34-45` lists
  `filters/oauth-error.filter.ts` and `client.guard.spec.ts` as changed, but neither is in the diff.
  "R5–R9 … no new test file needed" gives no evidence for each item. Line 9 reports "13 suites / 130 passed";
  the current run is 15 suites / 144.

### Positive Notes

- M3: replacing the `as` cast with a zod schema and failing at boot is the right call, and the specs
  cover malformed JSON, non-array, `null`, missing `redirectUris` and empty `clientId`.
- M5: the old test passed because PKCE failed, which proved nothing. The new one runs the full
  authorize → exchange flow and asserts on `scope`.
- M8: `@Header` on the success path plus an e2e test that asserts both headers.
- N5 spec: restoring `process.env` in `afterEach` fixes a test that leaked between suites.
- N8: one `readQueryString` with a docstring explaining why.

## Verification Evidence (DOD Standard tier)

| Check | Result |
|-------|--------|
| `npx nx run-many -t test lint -p auth-service common --skip-nx-cache` | ✅ 15 suites passed / 1 skipped; 144 tests passed / 2 skipped; lint clean |
| e2e (`auth-service:e2e`) | ⚠️ Not run in this review (needs Postgres/Redis stack) |
| File naming | ✅ `code-reviewer-fixes-report.md` |
