# coder-patient-service-report.md

**Skill:** coder (backend) · **Задача плана:** Task 11 — `patient-service` (FR-001/002/018) ·
**API:** `specs/api-designer-spec.md` §3.1–3.3 · **Порт:** 3004 · **Дата:** 2026-10-13

> Возобновлённый прогон: предыдущая попытка прервалась по лимиту. Её незакоммиченная работа в
> `apps/patient-service/**` проверена и сохранена. Исправлены три дефекта (см. «Исправления»),
> контроллеры разнесены по файлам, добавлены недостающие тесты. Дубликатов модулей нет.

## Что реализовано

| # | Эндпоинт | Доступ | Реализация |
| --- | --- | --- | --- |
| 3.1 | `GET /api/v1/me/patient` | `PATIENT` + `patient/*.read` | `MePatientController` → `PatientsService.getMePatient()`. Пациент берётся только из claim `patient` токена (ADR-013). Query-параметр `patient` не читается. |
| 3.2 | `GET /api/v1/patients/{id}` | `DOCTOR`/`ADMIN` + `user/*.read`; `PATIENT` + `patient/*.read` — только свой id | `PatientsController` → `PatientsService.getById()`: сначала компартмент, потом `read Patient/{id}`. |
| 3.3 | `GET /api/v1/patients/{id}/related?page=&pageSize=` | как 3.2 | `RelatedPersonsController` → `RelatedPersonsService.listForPatient()`: компартмент → проверка существования Patient → `search RelatedPerson?patient=Patient/{id}`. Ответ в конверте `PaginatedResponseDto`. |
| — | `GET /health` | `@Public()` | liveness для `HEALTH_PATH` из `docker-compose.yml` |

`/api/v1/patients/{id}/history|prescriptions` здесь не реализованы: их обслуживает encounter-service
(маршрут `encounter-patient-history` в Traefik, priority 60). Patient не создаётся: его создаёт
auth-service при регистрации (API §2.2.6).

### Структура `apps/patient-service`

```
src/main.ts                         zod-валидация env, Redis для rate-limit, глобальный ValidationPipe
src/app/app.module.ts               APP_GUARD: JwtAuthGuard → ScopeGuard → RoleGuard → RateLimitGuard; ProblemDetailsFilter; RequestIdMiddleware
src/config/patient-service-env.ts   envSchema.pick(...) + PORT=3004, FHIR_CLIENT_ID/SECRET (только парой)
src/modules/fhir/                   FhirModule (createFhirClientProvider, токен FHIR_CLIENT)
src/modules/access/                 PatientAccessService (политика чтения), patient-identity (id из токена, FHIR id)
src/modules/patients/               me-patient.controller, patients.controller, patients.service, dto/, mappers/patient.mapper
src/modules/related-persons/        controller, service, dto/ (пагинация), mappers/related-person.mapper
src/modules/health/                 HealthController
src/shared/fhir-datatypes.mapper.ts чтение HumanName/ContactPoint/Identifier/CodeableConcept из нетипизированного JSON
test/                               jwt-perimeter, me-patient, patients (e2e, HAPI замокан), test-issuer (локальный JWKS), boot-app
```

### Политика доступа (`PatientAccessService.assertCanRead`, ADR-013 defence in depth)

- **Scope по роли:** `PATIENT` → `patient/*.read`, `DOCTOR`/`ADMIN` → `user/*.read`. Иначе
  `403 FORBIDDEN_SCOPE`. Неизвестная роль → `403 FORBIDDEN_ROLE`. `@RequiresScopes` требует *все*
  перечисленные scopes, поэтому для общего маршрута scope выбирается по роли в сервисе. Тот же
  приём использует `appointment-service/scope-policy.ts`.
- **PATIENT:** `id` должен совпадать с claim `patient` (голый id; `Patient/{id}` нормализуется).
  Иначе `403 COMPARTMENT_VIOLATION`, и HAPI не вызывается.
- **DOCTOR:** личность врача берётся из `fhirUser = PractitionerRole/{id}`. Если claim отсутствует
  или ссылается не на PractitionerRole, ответ `403 COMPARTMENT_VIOLATION` (fail closed).
  Связь доказывается двумя поисками в HAPI (`_count=1`):
  `Appointment?patient=Patient/{id}&actor=PractitionerRole/{roleId}&status=booked,arrived,checked-in,fulfilled`,
  а если ничего не найдено — `Encounter?patient=…&participant=…&status=planned,…,finished`.
  Найденный ресурс **перепроверяется в процессе** (тип, статус, оба участника). Поэтому параметр
  поиска, который HAPI молча проигнорирует, не расширит доступ.
- **ADMIN:** без компартмента.
- Компартмент проверяется **до** чтения Patient.

### Маппинг `Patient` R4 → `PatientResponseDto`

`{ id, active, fullName, lastName, firstName, middleName?, birthDate?, gender?, telecom[], identifiers[] }`.

- Имя: приоритет `official` → `usual` → первое не-`old`. Порядок «Фамилия Имя Отчество»
  (`family`, `given[0]`, `given[1]`). `fullName` берётся из `HumanName.text`, если тот задан.
- `gender` проходит только из ValueSet AdministrativeGender.
- `telecom`/`identifier` без `value` и с `use=old` отбрасываются.

`RelatedPersonResponseDto` дополнительно содержит `patientId` и `relationship[]`. Для каждого
CodeableConcept берутся `system`/`code` первой coding, а `display` — по приоритету
`text` → `display` → `code`.

## Исправления относительно частичной работы

1. **Пагинация RelatedPerson.** В поиске использовался `_getpagesoffset`. В HAPI это параметр
   ссылок постраничного перехода, и он действует только вместе с `_getpages`. В обычном поиске он
   игнорируется, поэтому `page>1` молча возвращал первую страницу. Заменён на `_offset`, как в
   `appointment-service` и `catalog-service`.
2. **Граница `page`.** Добавлено ограничение `@Max(1000)` (`MAX_PAGE`, как в `appointment-service`).
   Без него клиент мог заставить HAPI делать неограниченный `_offset`-скан.
3. **Id из одних точек.** `.` и `..` проходят regex R4 `[A-Za-z0-9\-.]{1,64}`. Но в пути URL
   (`fetch`/WHATWG URL) `Patient/..` сворачивается в базовый URL сервера, а `Patient/.` — в поиск
   всех пациентов. `FHIR_ID_PATTERN` теперь отвергает id из одних точек (`(?!\.+$)`). Это
   защищает и `:id` в пути (`400 VALIDATION_ERROR`), и claim `patient` токена.
4. Два контроллера разнесены по файлам (`me-patient.controller.ts`, `patients.controller.ts`)
   согласно правилу «один класс на файл».
5. Добавлены спецификации `related-person.mapper.spec.ts` и `fhir-datatypes.mapper.spec.ts`.
   В e2e добавлены проверки трансляции `page=3&pageSize=10` → `_offset=20` и `page=1001` → 400.

## Отклонения и решения

1. **PATIENT допущен к `GET /patients/{id}`.** В таблице API §3 указан только `user/*.read`
   (DOCTOR/ADMIN). План Task 11 и постановка требуют для чужого id у PATIENT-токена ответ
   `403 COMPARTMENT_VIOLATION`, а не `FORBIDDEN_ROLE`. Поэтому роль PATIENT пропускается
   RBAC-guard'ом и затем ограничивается своим компартментом: свой id → 200, чужой → 403.
2. **Неизвестный id у DOCTOR → 403, а не 404.** `404 NOT_FOUND` получают ADMIN и пациент для
   собственного отсутствующего id. Для врача компартмент проверяется до чтения, а у
   несуществующего пациента не может быть общих Appointment/Encounter. Кроме того, HAPI на
   reference-поиск по неизвестному client-assigned id отвечает 404, и это трактуется как «связи
   нет». Так врач не может перебором выяснить, какие id существуют.
3. **«Активный Appointment/Encounter» (API §3).** Связь подтверждают Appointment в статусах
   `booked|arrived|checked-in|fulfilled` и Encounter в `planned|arrived|triaged|in-progress|onleave|finished`.
   Завершённый приём сохраняет доступ: врачу нужна карточка повторного пациента. Статусы
   `cancelled`, `noshow`, `entered-in-error` и `proposed/pending/waitlist` доступа не дают.
4. **AuditEvent не пишется.** Все эндпоинты сервиса только читают данные, а ADR-014 и API §0
   требуют аудит на create/update/delete.
5. **RabbitMQ не подключён.** Сервис не публикует событий. В architect §5 производителем
   `patient.registered.v1` указан patient-service, но Patient создаёт auth-service (API §2.2.6),
   поэтому событие относится к нему. Из env-схемы `RABBITMQ_URL` исключён.
6. **`nestjs-pino` и `@nestjs/terminus` не установлены** (как и в остальных сервисах). Логирование
   идёт через Nest `Logger`, а `/health` — это простой liveness без проверки HAPI.

## Найдено, но не изменено (общие файлы)

- **`libs/common` `JwtAuthGuard` не преобразует ошибки `jose` в 401.** Подделанная подпись
  (`ERR_JWS_SIGNATURE_VERIFICATION_FAILED`) или просроченный токен уходят в `ProblemDetailsFilter`
  как необработанная ошибка: `500 INTERNAL` вместо контрактного `401 UNAUTHENTICATED` (API §1).
  Утечки данных нет, HAPI не вызывается, что проверяет e2e `me-patient` «forged signature».
  Дефект затрагивает все 8 BFF-сервисов. Рекомендуемое исправление в `verifyBearerToken()`:
  `JOSEError` с кодами `ERR_JWT_*`, `ERR_JWS_*`, `ERR_JWKS_NO_MATCHING_KEY` → 401, а недоступность
  JWKS (`ERR_JWKS_TIMEOUT`, сетевые ошибки) оставить 5xx. После исправления e2e-проверку нужно
  ужесточить до 401.

## Расхождения с фронтендом

- `frontend/` не вызывает 3.1–3.3. Страница `/(doctor)/patients/[patientId]` показывает только
  историю (`/patients/{id}/history`, encounter-service), хотя `frontend-design-spec` §маршруты
  ожидает на ней `PatientHeader`/`RelatedPersons` (API 3.2, 3.3). Профиль пациента берёт данные
  из `/api/v1/me` (auth-service). Имена полей `firstName`/`lastName` совпадают с
  `PatientResponseDto`. Конфликта форм нет, фронтенд не менялся.

## Verification evidence (DOD Standard)

| Проверка | Команда | Результат |
| --- | --- | --- |
| Unit | `npx nx test patient-service --maxWorkers=2 --skip-nx-cache` | ✅ `Test Suites: 10 passed, 10 total` · `Tests: 83 passed, 83 total` |
| E2E | `npx nx e2e patient-service --skip-nx-cache` | ✅ `Test Suites: 3 passed, 3 total` · `Tests: 24 passed, 24 total` |
| Lint | `npx nx lint patient-service --skip-nx-cache` | ✅ `All files pass linting` |
| Typecheck | `npx tsc --noEmit -p apps/patient-service/tsconfig.app.json` и `…/tsconfig.spec.json` | ✅ exit 0 / exit 0 |
| Build | `npx nx build patient-service --skip-nx-cache` | ✅ `Successfully ran target build for project patient-service and 4 tasks it depends on` |
| TDD | новые тесты (`_offset`, `page>1000`, id из точек) | 🔴 6 failed → 🟢 после исправлений |

E2E поднимает настоящий `AppModule`: guard-стек, `ValidationPipe`, problem+json-фильтр. JWT
подписываются локальным RS256-издателем (`test/test-issuer.ts`), и `JwtAuthGuard` проверяет их
по его JWKS. HAPI заменён Jest-моком через `overrideProvider(FHIR_CLIENT)`.

## Покрытие тестами

- `access/patient-access.service.spec.ts`: 14 тестов. Покрывает свой и чужой пациент, scope по
  роли, врача с общим Appointment и с общим только Encounter, чужой и отменённый Appointment,
  отсутствие `fhirUser`, ответ HAPI 404 → COMPARTMENT_VIOLATION, проброс 503, ADMIN и
  неизвестную роль.
- `access/patient-identity.spec.ts`: claim `patient` (голый id или ссылка, мусор), `fhirUser`,
  FHIR id (включая `.`/`..`), сопоставление ссылок.
- `patients/patients.service.spec.ts`: тесты плана Task 11 (`getMePatient` → `9f2c`; чужой id →
  `COMPARTMENT_VIOLATION`), а также NOT_FOUND.
- `patients/mappers/patient.mapper.spec.ts`, `related-persons/mappers/related-person.mapper.spec.ts`,
  `shared/fhir-datatypes.mapper.spec.ts`: маппинг R4 → DTO.
- `related-persons/related-persons.service.spec.ts`: конверт пагинации, `_offset`, компартмент,
  404, отбрасывание чужих записей.
- DTO: `patient-id-params.dto.spec.ts`, `list-related-persons-query.dto.spec.ts`;
  конфигурация: `patient-service-env.spec.ts`.
- e2e: `jwt-perimeter` (401 на всех трёх маршрутах, `/health` публичный), `me-patient` (200,
  игнорирование `?patient=`, FORBIDDEN_SCOPE/ROLE, COMPARTMENT_VIOLATION, 404 без утечки URL HAPI,
  поддельная подпись), `patients` (ADMIN/DOCTOR/PATIENT, 404, 400 для id и пагинации, related-список).
