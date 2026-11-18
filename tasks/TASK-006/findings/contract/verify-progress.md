# contract unit progress

Status: done (attempt 2, ~93 tool calls)

Findings written: contract-01 (low, i18n: 500 detail 'Внутренняя ошибка сервера' printed under the EN headline), contract-02 (low, question: raw English server detail printed in banners, by design 'for support').

Dropped as duplicates of other units: fe-admin-02 (room floor cannot be cleared), be-practitioner-05/06 (room description clear -> 500, nulls), be-catalog-13 (service description clear -> 500), be-catalog-03 (PATCH without If-Match), be-catalog-08 (admin slots one HAPI page + bare date bounds read in UTC), libs-common-02 (body-parse errors as 500), libs-common-06 (Problem title = class name), infra-tools-03 (limiter sees one IP), fe-doctor-01 (journal first page only). specialtyCodes accepted-and-dropped is an acknowledged gap tied to the T3 'direction' open question.

Examined (no mismatch found, nothing to report):
- error-code catalogue: libs/contracts ERROR_CODES == frontend problem.ts ERROR_CODES == error-code-map (Record<ErrorCode,...>) == specs/api-designer-spec.md section 1 table; messages errors.<code> exist for all 22 codes in ru and en; parity/usage specs run green (51 tests)
- ValidationPipe: whitelist=true, forbidNonWhitelisted=false (unknown keys silently dropped); details[].field is a class-validator dotted path, frontend groupFieldErrors normalises [n] to .n; localizeFieldMessage patterns
- appointments (list/get/create/cancel), doctor appointments list/noshow, Idempotency-Key (UUID, fingerprint, per-intent key in booking store and slot generation dialog), mutations never retried
- encounters open/complete DTOs vs completeEncounterSchema limits; EncounterDetails arrays always present
- register DTO vs frontend schema; phone normalisation identical on both sides
- admin schedules, rooms, services, users (incl. deactivate 200 + body), terminology (value-sets, expand ?system=, import 202, IMPORT_RUNNING/SNAPSHOT_NOT_BUNDLED), audit (params and AuditEventDto), analytics 9.1-9.3, notifications
- consent endpoints (me and staff), multipart field `file`, ScanUploadInterceptor 413 -> 400, signedAt future tolerance, role-specific signedByName
- PATCH /me/patient If-Match W/"v", history/prescriptions (me and doctor), patient card, related persons, doctor schedule 5.2.7, doctor slots 5.2.8 (31-day cap vs 14-day window, clinic-day bounds)
- all list endpoints use _total=accurate; page sizes in the frontend never exceed 100; search inputs maxLength 100 equal DTO limits
- Traefik dynamic.yml: every frontend call path and every controller prefix resolves to the right service (priorities 40/50/60); Next rewrite and middleware matcher do not touch /api/v1; Bruno collection paths all exist
- detail-code keyed UX (KNOWN_DETAIL_CODES, hasDetailCode, rooms CONFLICT -> identifier taken, user form NOT_FOUND -> practitionerRoleId) vs backend 'CODE: text' messages
- OAuth token broker (refresh form body, revoke JSON body refreshToken + client_id) vs auth-service endpoints

Remaining: none in scope. Low-yield leftovers not pursued: room PATCH 409 CONFLICT from a HAPI concurrency conflict is shown as 'identifier taken' (rare); audit-types ENTITY_SUGGESTIONS comment/list is stale after ADR-020 (Location, HealthcareService, Schedule now appear in the journal; suggestions only).
