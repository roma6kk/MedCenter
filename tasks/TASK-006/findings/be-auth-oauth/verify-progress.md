Status: done

Examined:
- oauth.controller.ts, oauth.service.ts, token.service.ts, oauth.module.ts, oauth-error.ts, authorize.controller.ts
- guards: client.guard, token-client.guard, authorize-page.guard; filters/oauth-error.filter; dto/token-request.dto
- login/: login.controller, login-page.responder, login-page.ts, login-form.dto, login-redirect, authorize-query, login-session.service/guard, login-cookies, login-keys, signed-value, login-throttle, login-attempt-store, login-rate-limit.filter, login-messages, login-assets.controller
- credentials.service (timing OK: dummy hash), identity.ts, user-identity.resolver, auth-env.ts, jwt.service, jwks.service, pkce.service, password-hasher
- libs/common: jwt-auth.guard, token-revocation, rate-limit.guard, scope/role guards, problem-details.filter, validation.pipe, http-edge/trust-proxy
- app.module.ts, main.ts, credential-route.middleware.ts, app.controller, health.controller; admin-users/admin-terminology/terminology/account controllers (guard decorators OK)
- frontend (only to cross-check the auth-service contract): session-broker, callback-flow, return-to, authorize route, locale cookie
- specs: api-designer-spec 2.1.x + error catalogue, architect section 7 / ADR-008/009/011, compose notes, auth-service README, TASK-005 open questions (no overlap), sibling findings (tz-matrix-03 is a self-declared duplicate of be-auth-oauth-03)
- Decided NOT to report (documented/owner-accepted): redirect_uri not checked at token exchange (spec 2.1.3 says so), per-account lockout DoS (README trade-off), fail-open of guard denylist, RFC7807 on 429 at /oauth/token (spec lists RATE_LIMITED), 20/min token budget (NFR-006), 10/min login per IP (spec), 14d sliding refresh (spec), single signing key / no rotation (not in TZ), returnTo/open redirect (frontend sanitizer + registered redirect_uri exact match are sound), CSRF double-submit + cookies (sound), enumeration via login errors/timing (sound)

Findings written (12): 
01 in-memory token store/denylist in prod (bug, high)
02 revocation not wired in the 7 other BFFs (security, medium)
03 login page ru-only, no ui_locales/Accept-Language (i18n, medium)
04 non-atomic rotation, consume before DB resolve (robustness, medium)
05 no applyHttpEdge + duplicated trust-proxy (robustness, low)
06 spec example patient bare id + README drift (docs, low)
07 signing keys not validated at boot + PKCS#1-only _B64 sniffing (robustness, low)
08 reuse does not revoke active session (security, low, needsDecision)
09 raw JSON on browser-facing 5xx/4xx of authorize/login (ux, low)
10 login page a11y: aria-invalid on any error + toggle label+pressed (a11y, low)
11 no AuditEvent for authentication events (question, low, needsDecision)
12 OAUTH_CLIENTS_JSON redirectUris not validated as absolute http(s) URIs (robustness, low)

Remaining: nothing required.
Optional leftovers (not reported, negligible): refresh error_description differs between "revoked/rotated" and "unknown" (jti unguessable, no exploit); state > 2048 chars dropped by sanitizeAuthorizeQuery (edge).
