# coder-m2-catalog-spec.md

Живая спецификация M2 (Catalog, read side). Источник решения — план
`tasks/TASK-001/writing-plans-plan.md` §M2; отчёт о реализации — `tasks/TASK-002/coder-m2-catalog-report.md`.

## 1. Библиотеки

### `libs/terminology`
- `FHIR_BY` — единственное место canonical-URL `fhir.by` (ADR-002): ICD-10 ValueSet, НСИ CodeSystem
  услуг/наблюдений, ATC, UCUM.
- Валидаторы-маски: `isValidIcd10Code` (`^[A-Z]\d{2}(\.\d{1,2})?$`), `isValidAtcCode`
  (`^[A-Z][0-9]{2}[A-Z]{2}([0-9]{2})?$` — level-4/level-5), `isKnownUcumUnit` (закрытый набор + `$expand`).
  Регэкспы — только первая линия; авторитетная проверка — серверный `$expand` (BR-004).

### `libs/fhir`
- `FHIR_CLIENT` (injection token) + `FhirClient` интерфейс (`search`/`read`/`create`/`update`/`delete`).
- `HttpClient` — реализация без сторонних зависимостей (global `fetch`, `application/fhir+json`).
- `createFhirClientProvider(env)` — фабрика NestJS; читает `FHIR_BASE_URL`/`FHIR_CLIENT_ID`/`FHIR_CLIENT_SECRET`
  из окружения (никогда не из кода).

### `libs/fhir-mappers`
- Парный маппинг `XToFhirMapper` / `FhirToXMapper`: `toSlotResponseDto`, `toAppointmentResponseDto`,
  `toDoctorResponseDto`.

## 2. `apps/practitioner-service` (FR-002/016/017)

| Метод | Путь | Доступ |
| --- | --- | --- |
| `GET` | `/api/v1/doctors` | public (`@Public`) |
| `GET` | `/api/v1/doctors/{id}` | public |
| `GET` | `/api/v1/rooms` | `user/*.read` |
| `POST` | `/api/v1/admin/rooms` | `ADMIN` |
| `PATCH` | `/api/v1/admin/rooms/{id}` | `ADMIN` |
| `DELETE` | `/api/v1/admin/rooms/{id}` | `ADMIN` → `409 ROOM_IN_USE` если есть активный `Schedule` |

`Location.physicalType=room` — дискриминатор кабинета. Guard-стек закреплён через `APP_GUARD` (ADR-009);
`test/jwt-perimeter.e2e-spec.ts` подтверждает 401 без токена.

## 3. `apps/catalog-service` (FR-003/016/020)

| Метод | Путь | Доступ |
| --- | --- | --- |
| `GET` | `/api/v1/services`, `/api/v1/services/{id}` | public |
| `POST/PATCH/DELETE` | `/api/v1/admin/services[/{id}]` | `ADMIN` (`DELETE` → `409 SERVICE_IN_USE`) |
| `POST/GET/PATCH/DELETE/POST :id/generate/GET :id/slots` | `/api/v1/admin/schedules[...]` | `ADMIN` |

- `ServicesService` валидирует `typeCode` против засеянного НСИ ValueSet → `422 TERMINOLOGY_NOT_FOUND` (ADR-002).
- `SlotGeneratorService` раскрывает недельные окна `planningHorizon` в R4 `Slot(status=free)`;
  **идемпотентен** (повторный запуск → `generated: 0`), горизонт ≤ 90 дней (`planningHorizon`), id детерминирован.
- `SchedulesService` отклоняет пересекающиеся окна того же `PractitionerRole` → `409 SCHEDULE_OVERLAP` (BR-007).
- `RedisCacheService` кэширует `catalog:services` (5 мин) и `slots:{schedule}:{from}:{to}` (15 с, NFR-005);
  стора — через опциональный `CacheStore` (in-memory в тестах, Redis в проде).

## 4. Отклонения от плана

1. `@nestjs/swagger`/`@nestjs/mapped-types` не установлены → DTO только на `class-validator`; `Update*Dto` явные.
2. `fhir-kit-client` не установлен → собственный `HttpClient` за токеном `FHIR_CLIENT`.
3. ATC-регэкспп исправлен (`^[A-Z][0-9]{2}[A-Z]{2}([0-9]{2})?$`), т.к. шаблон из плана не матчит `J01FA10`.
4. `@RequiresRoles` — только method-декоратор (навешивается на каждый маршрут).
5. Контракт идемпотентности генерации: любой существующий слот в диапазоне ⇒ `skipped`, `generated: 0`.
