Status: done

Examined (attempt 1, ~79 tool calls):
- apps/practitioner-service: doctors.controller/service/doctor-search/doctor.mapper/DTOs/swagger docs; rooms.controller/service/room-identifier/room-search/room-schedules/room-usage.service+mapper/clinic-time/DTOs; bootstrap, app.module, paging helpers, fhir-id; existing unit/e2e test tables (rooms-admin-writes, doctors query-string/language, harness)
- libs: fhir (audited-write, fhir-transaction, write-audit, FhirClientError status mapping), fhir-mappers (practitioner.mapper, translation), common validation pipe, ProblemDetailsFilter, contracts error codes
- specs/api-designer-spec.md §0, §1, §4; brainstorming-design flow 1; seed tools/demo-seed/demo-resources.ts (Location refs, translation names); frontend rooms schema/hooks/usage drawer, doctor directory/filter bar/api-fetch, booking doctor step
- Scratch probes (outside the repo): DTO validation of null / whitespace / '' on the real DTO classes; identifierKey(null) TypeError confirmed. A probe of RoomsService.update through tsx failed to compile libs/fhir (parameter decorators), so the write body for description '' is judged from code only.
- Cross-unit overlaps deliberately NOT duplicated: be-catalog-03 (updateAudited without If-Match, incl. rooms PATCH), be-catalog-12 (PractitionerRole.healthcareService never maintained), be-catalog-13 (services empty description, same mechanism as 05), be-catalog-14 (service delete mislabel, same pattern as 03), be-catalog-07 (400/422 -> 500), be-auth-users-02 (account deactivation cascade, owner), tz-matrix-10 (no doctor admin CRUD)

Findings written (8): 
- 01 medium bug/likely: doctor name search misses English names (Accept-Language en) and two-word names
- 02 medium bug/confirmed: catalogue never hides Practitioner/PractitionerRole with active=false
- 03 low bug/likely: room DELETE vs PractitionerRole.location / HealthcareService.location -> generic CONFLICT while usage says free (+ spec/Swagger wording "active Schedule")
- 04 low i18n/confirmed: room usage display strings hardcoded Russian, duplicated inactive marker
- 05 high bug/likely: room PATCH sends description '' -> HAPI 400 -> 500; floor cannot be cleared
- 06 medium robustness/confirmed: null in PATCH (identifier null -> TypeError 500), whitespace-only name, no-op PATCH audit noise
- 07 low robustness/confirmed: PATCH/DELETE/usage do not check the Location is a room
- 08 low question/needsDecision: doctor roomId declared in spec/DTO/Swagger but never populated; patients cannot see the room

Remaining: nothing required. Not examined on purpose (low value for a clinic-sized dataset): HAPI max_page_size vs ROLE_SCAN_LIMIT/ROLE_LOOKUP_LIMIT, rate-limit of public routes, _sort of unsorted pages.
