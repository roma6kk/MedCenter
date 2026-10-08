# coder-m2-catalog-report.md

**Skill:** coder (backend) · **Milestone:** M2 — Catalog (read side) · **Plan:** `tasks/TASK-001/writing-plans-plan.md` §M2

## Scope delivered

| Task | Deliverable | Status |
| --- | --- | --- |
| 8 | `libs/terminology` (canonical URLs + ICD-10/ATC/UCUM validators), `libs/fhir` (FHIR client provider), `libs/fhir-mappers` (slot/appointment/practitioner mappers) | ✅ |
| 9 | `apps/practitioner-service` — doctors catalog (FR-002/016), rooms admin CRUD with `ROOM_IN_USE` guard (FR-017) | ✅ |
| 10 | `apps/catalog-service` — services (FR-003), schedules + idempotent slot generation (FR-020), Redis cache | ✅ |

## M2 gate verification

- **Doctors/services/slots queryable** — `DoctorsService`/`ServicesService`/`SchedulesService.listSlots` implemented; slot reads go through `RedisCacheService` (`slots:{schedule}:{from}:{to}`, TTL 15 s).
- **Slot generation idempotent & non-duplicating** — `SlotGeneratorService.generate()` returns `{ generated, skipped }`; a second run over the same range reports `generated: 0`.
- **90-day horizon** — `PLANNING_HORIZON_DAYS = 90`; a longer range throws `planningHorizon` (`400`).
- **`SCHEDULE_OVERLAP`** — creation rejects intersecting weekly windows for the same practitioner role (`409`).
- **Compartment violation → 403** — inherited from the global guard stack (ADR-009, ADR-013); unchanged by M2.

## Architectural decisions & deviations from the plan

1. **No `@nestjs/swagger` / `@nestjs/mapped-types`.** The plan's sample DTOs use `@ApiProperty`/`PartialType`, but neither package is installed in the workspace. DTOs use `class-validator` only; `Update*Dto` types are written explicitly. Documented inline.
2. **FHIR client is dependency-free.** The plan mentions `fhir-kit-client`; it is not installed. `libs/fhir` ships a small `HttpClient` (global `fetch`) behind the `FHIR_CLIENT` injection token, so any client can be swapped without touching consumers.
3. **ATC regex corrected.** The plan/frontend quote `^[A-Z][0-9]{2}[A-Z]{2}([0-9]{2}[A-Z]{2})?$`, which cannot match the plan's own accepted value `J01FA10`. Implemented as `^[A-Z][0-9]{2}[A-Z]{2}([0-9]{2})?$` (level-4 `J01F` / level-5 `J01FA10`).
4. **Idempotency contract.** Generation treats any pre-existing slot in the range as a skip for the whole range; `skipped` reports the existing count, matching the plan's test (`skipped: 1, generated: 0`).
5. **`@RequiresRoles` is a method decorator only** — applied per route, not at class level.

## Verification evidence

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit -p tsconfig.base.json` | ✅ exit 0 |
| Lint | `npx nx run-many --target=lint --all` | ✅ 9 projects |
| Tests | `npx nx run-many --target=test --all` | ✅ 9 projects (154 passed, 2 skipped) |
| Build | `npx nx run-many --target=build --all` | ✅ 9 projects |
| E2E | `npx nx e2e practitioner-service` / `catalog-service` | ✅ 5 passed |

## New test coverage

- `libs/terminology/src/lib/validators/terminology.spec.ts` — 20 tests (ICD-10/ATC/UCUM + canonical URLs)
- `libs/fhir/src/lib/fhir-client.provider.spec.ts` — 4 tests (read/search/error/provider)
- `libs/fhir-mappers/src/lib/slot.mapper.spec.ts` — 3 tests
- `apps/practitioner-service/src/modules/rooms/rooms.service.spec.ts` — 4 tests (`ROOM_IN_USE`)
- `apps/catalog-service/src/modules/schedules/slot-generator.service.spec.ts` — 5 tests (idempotency, horizon, overlap)
- e2e: `jwt-perimeter.e2e-spec.ts` (both services), `rooms.e2e-spec.ts`, `schedules.e2e-spec.ts`
