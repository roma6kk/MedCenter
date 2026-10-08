# Code Review — re-review of M2, N4, M5

Date: 2026-10-08. Source: `code-reviewer-fixes-report.md` → `coder-auth-review-fixes-report.md`.

## Verification

| Check | Result |
|-------|--------|
| `npx nx run-many -t test lint -p auth-service common --skip-nx-cache` | ✅ 15 suites passed / 1 skipped; 147 passed / 2 skipped; lint clean |
| e2e | ⚠️ Not run (needs the Postgres/Redis stack) |

## Summary

N4 and M5 are fixed. M2 is fixed in code, but the fix depends on `request.ip`, and that value is wrong behind Traefik.

| Item | Verdict |
|------|---------|
| M2 | ⚠️ Fixed in code. Its main protection does not work in the deployed setup (see below) |
| N4 | ✅ Closed |
| M5 | ✅ Closed |

## Issues Found

### Major (Should Fix)

- [ ] **M2: `request.ip` is the Traefik IP, so the lockout is back in the deployed stack** —
  `apps/auth-service/src/main.ts:9` (no `trust proxy`), `libs/common/src/lib/guards/rate-limit.guard.ts:62`.
  auth-service runs behind Traefik (commit d1a9214), and Express does not trust proxy headers by default.
  So `request.ip` is the proxy's container address for every caller. The key `client_id|ip` then becomes
  `medcenter-web|<traefik-ip>` for everyone, and 21 requests/min from any host block the real web client.
  The unit tests pass only because they set `ip` directly.
  **Fix:** `app.getHttpAdapter().getInstance().set('trust proxy', <hop count or Traefik subnet>)`. Do not use
  `true`, because then a caller could spoof `X-Forwarded-For`. Read the setting from env.

### Minor (Consider)

- [ ] **M2: `originalUrl` in the key includes the query string** — `rate-limit.guard.ts:67`.
  `POST /oauth/token?n=1`, `?n=2`, … each get a new bucket from the same IP, so the 20/min limit can still
  be bypassed. This is older than M2, but it undoes what M2 is for. Use the path only, for example
  `request.route?.path` or `originalUrl.split('?')[0]`.
- [ ] **N4: `response_type` errors return 400 instead of a redirect.** `ClientGuard` has already checked
  `redirect_uri`, so RFC 6749 §4.1.2.1 would prefer a redirect with `error=invalid_request`/
  `unsupported_response_type`. This is acceptable for now, but it is inconsistent with M5.
- [ ] **M5: `error_description` is not forwarded on the redirect.** It is optional in the RFC, but it would help debugging.

### Positive Notes

- M2: an authenticated `sub` takes priority over the body `client_id`, which closes the bucket rotation
  on `/oauth/token/revoke`. The 64-character cap and the `-` fallback are covered by tests.
- N4: `!== 'code'` also rejects an array (`?response_type=code&response_type=code`). The frontend BFF and
  the e2e helper send the parameter.
- M5: there is an allow-list of codes permitted on the redirect, and `invalid_grant` is mapped to `access_denied`.
  The controller test asserts `error=invalid_scope` and that no `code` is present. `redirect_uri` is still
  checked by `ClientGuard` before any redirect, so there is no open redirect.

## Context Summary
Re-review of the three fixes. N4 and M5 are closed. M2 is correct in code, but behind Traefik it still allows
the client lockout until `trust proxy` is configured.

## Next Steps
- **Next by flow:** `/test-generator` — e2e for the rate limit behind a proxy (X-Forwarded-For).
- `/coder` — set `trust proxy` and remove the query string from the rate-limit key.
- `/finishing-branch` — if you accept M2 as is.
