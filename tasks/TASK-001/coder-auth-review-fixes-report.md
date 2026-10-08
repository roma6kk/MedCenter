# Coder — fixes for `code-reviewer-fixes-report.md` (Critical + Major)

Scope: the Critical item (M2) and the two Major items (N4, M5 over HTTP) of
`code-reviewer-fixes-report.md`. Minor items are **not** addressed here.

## Fixes

### M2 (Critical) — rate-limit key no longer controlled by an unauthenticated `client_id`
`libs/common/src/lib/guards/rate-limit.guard.ts` — `readBucketIdentity()`:
- An authenticated principal keeps its `sub` bucket. The body `client_id` is ignored, which closes
  bucket rotation on `POST /oauth/token/revoke`.
- When there is no principal, the key is `${client_id}|${ip}`. The IP is always in the key, and a
  missing `client_id` becomes `-`.
- `client_id` is capped at 64 characters.
- Result: a client can no longer be locked out from another IP. Rotating `client_id` from one IP
  only creates buckets for ids that `TokenClientGuard` rejects with 401 before checking any secret
  or code.

Tests (`rate-limit.guard.spec.ts`):
- the key is `client_id|ip`
- rotating `client_id` keeps the IP in the key
- a different IP gets a different bucket for the same `client_id`
- an authenticated principal ignores the body `client_id`
- the length cap
- the ip-only fallback

### N4 (Major) — missing `response_type` rejected
`guards/authorize-page.guard.ts` now requires `response_type === 'code'` (RFC 6749 §4.1.1).
- Callers: the frontend BFF (`frontend/src/app/api/auth/authorize/route.ts:23`) always sends
  `response_type=code`. The e2e helper `authorizeQuery()` now sends it by default.
- New unit test for the "absent" case. Existing guard tests now pass `response_type: 'code'`.

### M5 (Major) — `invalid_scope` reaches the client on the redirect
`oauth.controller.ts`:
- `errorRedirect()` takes the RFC code as a parameter.
- `toAuthorizeRedirectError()` forwards `invalid_request` and `invalid_scope`. Codes that RFC 6749
  §4.1.2.1 does not allow on the authorize redirect (`invalid_grant`, `invalid_client`,
  `unsupported_grant_type`) are still reported as `access_denied`.

Tests (`oauth.controller.spec.ts`):
- the real service asserts `error=invalid_scope` (and no `code`) on the redirect
- `invalid_request` is forwarded
- `invalid_grant` still becomes `access_denied`

## Verification Evidence (DOD Standard tier)

| Check | Result |
|-------|--------|
| `npx nx run-many -t test lint -p auth-service common --skip-nx-cache` | ✅ 15 suites passed / 1 skipped; 147 tests passed / 2 skipped; lint clean |
| `tsc --noEmit` on auth-service app/spec and common lib/spec tsconfigs | ✅ no errors |
| e2e (`auth-service:e2e`) | ⚠️ Not run (needs Postgres/Redis stack). `authorizeQuery()` updated for N4. |
| File naming | ✅ `coder-auth-review-fixes-report.md` |

## Found while fixing (not changed)

- `docker-compose.yml:79`: the auth-service healthcheck expects `302` from a bare `GET /oauth/authorize`.
  With no `client_id`, `ClientGuard` already answers `401`, so this probe fails today, independent of
  these fixes. A probe on `/.well-known/smart-configuration` (200) would be a better fit.
