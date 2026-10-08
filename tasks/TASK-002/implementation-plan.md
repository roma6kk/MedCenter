# M2 — Catalog (read side) Implementation Plan

M2 from `tasks/TASK-001/writing-plans-plan.md`. Deliverables:

## Task 8 : libs/fhir, libs/fhir-mappers, libs/terminology
- `libs/terminology/src/lib/canonical-urls.ts`, `validators/icd10.ts`, `validators/atc.ts`, `validators/ucum.ts`
- `libs/terminology/src/lib/validators/terminology.spec.ts`
- `libs/fhir/src/lib/fhir-client.provider.ts`, `libs/fhir/src/index.ts`
- `libs/fhir-mappers/src/lib/{slot,appointment,practitioner}.mapper.ts`, `libs/fhir-mappers/src/index.ts`
- `libs/fhir-mappers/src/lib/slot.mapper.spec.ts`

## Task 9 : apps/practitioner-service (FR-002/016/017)
- `modules/doctors/{doctors.controller,doctors.service}.ts`
- `modules/rooms/{rooms.controller,rooms.service}.ts`
- `modules/rooms/dto/{create-room,update-room}.dto.ts`
- `modules/{doctors,rooms}/dto/room-response.dto.ts`
- `modules/rooms/rooms.service.spec.ts`, `test/rooms.e2e-spec.ts`, `test/jwt-perimeter.e2e-spec.ts`

## Task 10 : apps/catalog-service (FR-003/016/020, M2 gate)
- `modules/services/{services.controller,services.service}.ts`
- `modules/schedules/{schedules.controller,schedules.service,slot-generator.service}.ts`
- `modules/schedules/dto/{create-schedule,update-schedule,weekly-window,generate-slots}.dto.ts`
- `modules/cache/redis-cache.service.ts`
- `modules/schedules/slot-generator.service.spec.ts`, `test/schedules.e2e-spec.ts`

M2 gate: doctors/services/slots queryable via Redis cache · slot generation idempotent & non-duplicating · 90-day horizon + SCHEDULE_OVERLAP · COMPARTMENT_VIOLATION -> 403.
