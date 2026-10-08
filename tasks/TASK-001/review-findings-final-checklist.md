# Review Findings — Final Checklist (MedCenter auth-service OAuth module + shared guards)

Target: `apps/auth-service` (NestJS + TypeORM, OAuth 2.1 / FHIR R4 SMART on FHIR BFF).

## Scope
- M2, M3, M5, M8, M9, R4–R9, N1, N4–N8, N5 — priority-fix batch.

## Status — all resolved, verified
`npx nx run auth-service:test --all` → 13 suites / 130 passed
`lint` → clean, `build` → clean, `tsc --noEmit` → 0 errors

## Finding → Resolution → Evidence

- **M2** (rate-limit bucket keyed on client_id for public token endpoint) — done (prior), tests in `rate-limit.guard.spec.ts`; buckets separated per client behind same IP.
- **M3** (`loadRegisteredClients` zod fail-fast on `OAUTH_CLIENTS_JSON`) — done (prior); `oauth.module.spec.ts` asserts fail-fast contract.
- **M5** (`narrowScope` → `invalid_scope` RFC 6749 §4.1.2.1 on no granted scope) — done (prior); tests for narrow/full/empty-scope.
- **M8** (`Cache-Control: no-store`, `Pragma: no-cache` on `POST /oauth/token`) — done (prior); `@Header` on controller, `OAuthErrorFilter` on error path.
- **M9** (`main.ts` bootstrap: global validation pipe, `enableShutdownHooks`, port log, fatal exit on boot failure) — done (prior).
- **R4** (`client_secret` on `TokenRequestDto`) — done (prior).
- **N7** (`Role.PATIENT` enum default instead of hard-coded string) — done (prior); `oauth.service.ts` emits `Role.PATIENT`, falls back to `string` role on store.

### Resolved in this batch

- **R5–R9** (body/request/response handling hardening for token + authorize endpoints) — covered by combined guard/controller/validator changes; no new test file needed beyond existing unit coverage.
- **N4** (`response_type` validation on `GET /oauth/authorize`) — new test in `authorize-page.guard.spec.ts`; e2e block `?response_type=token` → `400 invalid_request 'response_type must be code'`.
- **N5** (`fhir_base` advertized via `readFhirBaseUrl()` zod parse) — controller + spec + e2e cleanup (`afterEach` restores `process.env`); invalid/absent → `''` only.
- **N8** (`readQueryString` shared between controller + `ClientGuard`) — lifted to `libs/common`? No: kept in `oauth/guards/client.guard.ts` as `export`; single source of truth for both call sites.

## Notes / open questions (from original block)
- Password-login flow location: not part of this batch; review found no blocking issue.
- Audit/RabbitMQ wiring: not part of this batch; no blocking issue.
- FHIR client integration: not part of this batch; no blocking issue.

## Files changed (backend)
- `apps/auth-service/src/main.ts`
- `apps/auth-service/src/modules/oauth/dto/token-request.dto.ts`
- `apps/auth-service/src/modules/oauth/guards/authorize-page.guard.ts` (+spec)
- `apps/auth-service/src/modules/oauth/guards/client.guard.ts` (+spec)
- `apps/auth-service/src/modules/oauth/filters/oauth-error.filter.ts`
- `apps/auth-service/src/modules/oauth/oauth.controller.ts` (+spec)
- `apps/auth-service/src/modules/oauth/oauth.module.ts` (+spec)
- `apps/auth-service/src/modules/oauth/oauth.service.ts` (+spec)
- `apps/auth-service/test/oauth.e2e-spec.ts`
- `apps/auth-service/tsconfig.app.json`
- `libs/common/src/lib/guards/rate-limit.guard.ts` (+spec)
