Status: done

Examined (attempt 1, ~78 tool calls):
- reports: controller, service, repository SQL, clinical-report.source, DTOs, service spec (encounters/services parts), e2e spec head
- shared/date-range.ts, date-range-query.dto.ts, date-range.spec.ts, clock.ts
- audit: controller, service, repository, event mapper, sync service, sync scheduler (startup retry 1+2+4+8+16 s then 15 s ticks: OK), env config
- worker: analytics.worker (reconnect loop, retry queue, DLQ), delivery.processor, ingestion.service, read-model.writer (ledger ON CONFLICT DO NOTHING + fact in one tx: correct, cancel-before-booking handled), analytics-event validator (matches libs/contracts and the producers), specialty.resolver; libs/messaging topology
- database: entities, 3 migrations, typeorm.config (advisory-lock migrations), database.module; health controller; traefik routes; compose service block
- authz: all 4 routes @RequiresScopes(USER_READ) + @RequiresRoles(ADMIN); ADMIN token carries user/*.read; e2e perimeter spec exists. Revocation of tokens is not wired outside auth-service: already filed as be-auth-oauth-02 (+ -01 for the in-memory denylist), not duplicated here
- frontend consumers: use-analytics, analytics-panel, group-table/bars, unnamed-groups, analytics-math/insights, audit-filter, report-range, analytics-period/series, clinic-time, api-fetch (Accept-Language), query-keys; frontend/e2e/admin-reports.spec.ts; tools/stack-smoke (uses default windows only)
- bruno/10-analytics; specs/api-designer-spec §0, §5.2, §9; libs/fhir client error mapping; libs/common guards

Findings written (5):
- be-analytics-01 (bug, medium): date-only from/to read as UTC day vs Europe/Minsk; catalog-service already reads them as clinic days; e2e has a workaround comment (TASK-005 T8 bullet 4 reclassified as plain bug, needsDecision=false)
- be-analytics-02 (i18n, low): 9.2 hardcodes Russian 'Специальность не указана'; frontend's localized unnamed-group branch is unreachable
- be-analytics-03 (i18n, low): 9.3 service names ignore Accept-Language although translations exist (520db7b); analytics query key has no locale
- be-analytics-04 (docs, low): Bruno 9.1 docs/asserts lack the fulfilled group
- be-analytics-05 (question, low, needsDecision): 9.3 total/Share computed from the top-N sum, not from all bookings

Deliberately NOT reported (speculative, contrived, already owner-listed or owned by another unit):
- year-9999 `to` -> '+010000-...' to HAPI -> 400 mapped to 500 (contrived input)
- audit sync could stall only if >5000 AuditEvents share one 60 s window (theoretical)
- per-column chart requests vs 120 req/min rate limit (TASK-005 T8 bullet 1, needs a new endpoint)
- 9.2 specialty names stay Russian in English UI (needs a design choice: extra column vs request-time HAPI lookup); mentioned inside be-analytics-03 as the separate follow-up, no standalone finding
- relay marking events sent with no bound analytics queue (be-notification-outbox-02), past-slot bookings distorting reports (be-appointment-01/-08)
- lenient Date.parse in event validator, `stored` log count includes ignored rows, unbounded processed_event ledger (no retention)

Remaining:
- nothing for this unit
