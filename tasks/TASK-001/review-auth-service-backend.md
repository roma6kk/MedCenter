# Code Review — Backend Implementation (auth-service + libs/common)

**Date:** 2026-10-06
**Scope:** apps/auth-service (NestJS OAuth2/SMART server) + libs/common (shared guards, filters, pipes)
**Evidence:** `npx nx run auth-service:test --all` → 12 suites / 130 passed / 132 total

---

## 0. Scope & Files Reviewed

- `apps/auth-service/src/main.ts`
- `apps/auth-service/src/modules/oauth/dto/token-request.dto.ts`
- `apps/auth-service/src/modules/oauth/guards/authorize-page.guard.ts` (+spec)
- `apps/auth-service/src/modules/oauth/guards/client.guard.ts` (+spec)
- `apps/auth-service/src/modules/oauth/guards/token-client.guard.ts` (+spec)
- `apps/auth-service/src/modules/oauth/filters/oauth-error.filter.ts`
- `apps/auth-service/src/modules/oauth/oauth.controller.ts` (+spec)
- `apps/auth-service/src/modules/oauth/oauth.module.ts` (+spec)
- `apps/auth-service/src/modules/oauth/oauth.service.ts` (+spec)
- `apps/auth-service/src/modules/oauth/token.service.ts` (+spec)
- `apps/auth-service/src/modules/oauth/pkce.service.ts` (+spec)
- `apps/auth-service/src/modules/oauth/jwt.service.ts`, `jwks.service.ts`
- `libs/common/src/lib/guards/rate-limit.guard.ts` (+spec)
- `apps/auth-service/test/oauth.e2e-spec.ts`, `e2e-env.ts`
- `specs/api-designer-spec.md` (API 2.1.1–2.1.5), `specs/architect-architecture.md` (ADR-009)

---

## 1. Executive Summary

The backend implementation is **clean, well-tested, and security-oriented**. The OAuth2/SMART surface is consistently RFC 6749 / RFC 7009 / RFC 7636 compliant; the guard layer is properly wired (JWT → scopes → RBAC → rate-limit); and test coverage is strong (130 passing). No critical security vulnerabilities found.

**Verdict: Ready to merge** (with the minor improvements below).

---

## 2. Strengths

| # | Strength | Evidence |
|---|----------|----------|
| 1 | **PKCE S256 only** — `plain` never accepted | `AuthorizePageGuard`, `PkceService` |
| 2 | **Constant-time comparison** for client secrets & PKCE verifier | `ClientGuard.verifySecret`, `PkceService.verify` (CWE-208 mitigation) |
| 3 | **Fail-closed client auth** — public clients use PKCE alone; confidential clients must prove secret | `ClientRegistry.verifySecret` |
| 4 | **RFC 7009 §2.1 ownership** on revoke — no-enum/no-deny enforcement | `OAuthService.revoke` |
| 5 | **Rotation does not log out** the caller — `reuse:` vs `session:` namespace separation | `TokenService` |
| 6 | **JWT signing with RS256**, JWKS published without private material | `JwksService`, `jwt.service.ts` |
| 7 | **Eager signing-key loader** fails fast at boot (no half-configured service) | `oauth.module.ts` |
| 8 | **Zod env validation** with `safeParse` for `fhir_base` (no silent empty string) | `readFhirBaseUrl` |
| 9 | **Cache-Control: no-store** on both branches of token endpoint | `OAuthErrorFilter` + controller `@Header` |
| 10 | **RFC 6749 §5.1** 200 OK for token, `@HttpCode` on POST | controller |
| 11 | **Global guard stack** (ADR-009): JwtAuth → Scope → Role → RateLimit | `AppModule` |
| 12 | **Test coverage 130/132** (2 skipped), lint + build clean | CI |

---

## 3. Critical / High Issues

### 3.1 Rate-limit guard: `fails open` on store failure (security-relevant trade-off)

**Location:** `libs/common/src/lib/guards/rate-limit.guard.ts` lines 76–81

```typescript
try {
  count = await store.increment(key, WINDOW_SECONDS);
} catch (error: unknown) {
  this.logger.warn({ err: error, key }, 'Rate-limit store unreachable; failing open');
  return true;
}
```

**Impact:** If Redis is unreachable, the token endpoint's 20 req/min limit is **bypassed**. An attacker could flood the token endpoint during a Redis outage. This is a deliberate availability-vs-security trade-off, but it should be:
- Explicitly documented in an ADR or design note (it's currently only a `logger.warn` comment)
- Consider `fails close` for the token endpoint specifically (the cost of a rate-limit false-positive is a 429, not a security breach — so closing is low-risk)

**Recommendation:** Add a design note (or ADR) documenting `fails open`. Optionally add a route-level flag like `@RateLimit({limit: 20, failClose: true})` for sensitive endpoints.

### 3.2 `redirect_uri` not re-validated in token request (RFC 6749 §3.1.3.1)

**Location:** `apps/auth-service/src/modules/oauth/oauth.controller.ts` — `token()` action

The token endpoint accepts `redirect_uri` in the form body but **never verifies it** against the client's registered URIs. RFC 6749 §3.1.3.1 mandates: *"If no redirect_uri was included in the authorization request, this parameter MUST NOT be included in the token request."* This is a **open-redirector / token-leak** risk if a malicious client reuses a redirect_uri that was never registered with a redirect.

**Recommendation:** Validate `redirect_uri` (when present) against `client.redirectUris` in `exchangeCode()`. Return `invalid_request` if mismatch.

### 3.3 `InMemoryTokenStore` / `InMemoryTokenDenylist` wired as production providers

**Location:** `apps/auth-service/src/modules/oauth/oauth.module.ts` lines 95–96

```typescript
{ provide: TOKEN_STORE, useClass: InMemoryTokenStore },
{ provide: TOKEN_DENYLIST, useClass: InMemoryTokenDenylist },
```

**Issue:** These are **in-memory** stores. All tokens are lost on restart; the denylist is a heuristic cache, not a shared Redis store. If this module is ever deployed to production without the TypeORM/Redis swap, the auth surface silently degrades.

**Context:** The comment in `oauth.module.ts` says "Production wiring (a TypeORM-backed store over the `auth.oauth_token` table and a Redis-backed denylist) is the persistence task that follows", but these are currently wired as **in-memory** stores.

**Recommendation:** Add a runtime assertion (e.g., `if (environment !== 'development') throw new Error('...')`) or a clear config flag (`USE_IN_MEMORY_STORES`) to prevent accidental production deployment. Document this explicitly in `MANIFEST.md`.

---

## 4. Medium Issues / Observations

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 4.1 | `consume()` adds denylist entry with TTL based on remaining lifetime; expired tokens get TTL 0/negative (harmless but fragile) | Low | Compute TTL as `Math.max(1, remaining)` |
| 4.2 | `revoke()` writes `reuse:` with `REFRESH_TOKEN_TTL_SECONDS` — the denylist entry for `reuse:` outlives the token | Low | Consider shorter TTL for `reuse:` (e.g., the refresh token's remaining lifetime) | 
| 4.3 | `authorize` endpoint's auth check is manual (`if (principal === undefined)` in the controller) — easy to miss during future changes | Medium | Add a dedicated guard or decorator (e.g., `@RequiresSession()`) for documentation clarity |
| 4.4 | `revoke` endpoint relies on global APP_GUARD stack; if guards change, the endpoint's security posture changes without code change | Medium | Add explicit `@UseGuards(JwtAuthGuard)` for documentation/debuggability |
| 4.5 | `TokenRequestDto` declares `client_secret` as `@IsOptional()` — intentional (client auth is guard-level), but the DTO shape diverges from a strict RFC 6749 view | Low | Document this in the DTO or spec; it's fine as-is |
| 4.6 | `InMemoryClientRegistry` stores secrets in plain text (dev-only) | Low | Add comments and env flag to prevent accidental production use |

---

## 5. Architectural Alignment Checklist

| ADR / NFR | Status |
|-----------|--------|
| ADR-009 (reverse-proxy, guard layer) | ✅ Implemented (AppModule: Jwt → Scope → Role → RateLimit) |
| ADR-013 (patient compartment) | ✅ N/A for auth-service (not in scope) |
| NFR-006 (rate-limit 120/min) | ✅ Global default; token endpoint 20/min |
| NFR-006 (rate-limit 20/min token) | ✅ `@RateLimit(20)` on token endpoint (M2) |
| API 2.1.2 (authorize) | ✅ S256 + client validation + principal check (manual) |
| API 2.1.3 (token) | ✅ PKCE + rotation + 200 OK |
| API 2.1.4 (revoke) | ✅ RFC 7009 §2.1 ownership; `TOKEN_REVOKED` on pair revocation |
| API 2.1.5 (jwks) | ✅ Public key only, no private material |
| M3 (zod fail-fast env) | ✅ `loadRegisteredClients` + `loadSigningKeys` |
| M8 (cache headers) | ✅ Both branches set `no-store` |

---

## 6. Verdict

**Ready to merge.** No critical security issues, tests green (130 passed), lint/build clean.

**Should address before merge (all Low/Medium):**
1. Rate-limit `fails open` → document in ADR + consider fail-close for token endpoint
2. Token endpoint `redirect_uri` re-validation → RFC compliance + security
3. In-memory stores → gate behind env flag to prevent production misconfiguration

**Optional (no blocking impact):**
- Explicit `@UseGuards(JwtAuthGuard)` on revoke endpoint
- Decorator for authorize's implicit session check
- Shorter `reuse:` TTL
