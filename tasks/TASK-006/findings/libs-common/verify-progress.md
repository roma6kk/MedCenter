Status: done
Examined:
- libs/common: jwt-auth.guard, role/scope guards, token-revocation, decorators, request-context, request-id middleware, audit-actor, patient-compartment, rate-limit guard + redis store, ProblemDetailsFilter, validation pipe, idempotency service, swagger helpers, http-edge, trust-proxy
- libs/config env.schema (+ patient-service / analytics env parsers); zod stringbool/blank behaviour tested
- libs/fhir: fhir-client.provider (HttpClient, FhirClientError), audited-write, fhir-transaction, write-audit, outbox, active-consent, patient-read-audit, consent.ts, consent-audit.ts
- libs/fhir-mappers: appointment, slot, practitioner, translation
- libs/terminology: validators (icd10, atc, ucum), canonical urls, extension urls, consent codes
- all 9 apps/*/src/main.ts + catalog/practitioner bootstrap.ts
- Experiments (scratchpad/libs-common): body-parser errors through ProblemDetailsFilter; rate-limit key per URL; Redis hang vs commandTimeout; route guard-metadata scan
Findings written: libs-common-01 (rate limit per URL), 02 (body-parser errors -> 500, requestId unknown), 03 (Redis clients without commandTimeout in 6 services + idempotency store), 04 (blank env values), 05 (dead isKnownUcumUnit disagrees with seed), 06 (Problem Details title / WWW-Authenticate / dead fromValidationError)
Checked and NOT findings:
- Admin write routes of catalog/practitioner without @RequiresScopes: spec 4.4-4.6, 5.1.3-5.1.5 list role ADMIN only, rooms-access e2e documents "only reads demand a scope".
- auth-service without applyHttpEdge: already be-auth-oauth-05. TOKEN_REVOCATION only in auth-service: already be-auth-oauth-02. Idempotency concurrency: be-appointment-04. Cache-Control: be-appointment-10. Pino/structured logs: tz-matrix-07. No retry in HttpClient: not in specs (NFR-005 asks for timeout only).
- REQUEST_ID_TYPE, MAX_PAGE, totalPages formula: identical across services (no divergence bug). METHOD_NOT_ALLOWED unused by design (spec 1).
- JWT: RS256, no aud claim issued, refresh tokens opaque, jose error mapping fine.
- Not filed (speculative, needs infra check on the running stack): anonymous per-IP rate-limit buckets behind web (Next rewrite) -> Traefik with TRUST_PROXY=1 and no Traefik forwardedHeaders.trustedIPs: req.ip is likely the web container for every visitor, so public routes share one bucket. Also Retry-After is always 60 s instead of the time left in the window (polish).
Remaining:
- nothing (unit complete)
