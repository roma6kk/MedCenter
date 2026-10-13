# Code Review — `patient-service` (Task 11, API §3.1–3.3), раунд 1

- **Ревьюер:** code-reviewer skill
- **Дата:** 2026-10-13
- **Ветка:** `feature/clinic-platform-wip` (незакоммиченные изменения, `apps/patient-service/**` — untracked)
- **Scope:** весь `apps/patient-service/**` (47 файлов, ~2200 строк TS) + отчёт `coder-patient-service-report.md`.
  Изменений в общих файлах (`libs/*`, `infra/*`, `package.json`…) нет — `sharedChanges: []` подтверждён.
- **Источники истины:** `writing-plans-plan.md` Task 11, `api-designer-spec.md` §0/§1/§3,
  `architect-architecture.md` §4.4/§5, ADR-009/013/014, шаблон `apps/appointment-service`.
- **DOD tier:** Standard

## Вердикт

**APPROVE.** Критических и major-замечаний нет. Сервис соответствует API §3.1–3.3 и плану Task 11,
guard-стек и обработка ошибок совпадают с шаблоном appointment-service, компартмент ADR-013 реализован
корректно и fail-closed. Ниже 5 minor и 4 nit — их можно закрыть отдельным проходом, они не блокируют.

| Severity | Кол-во |
| --- | --- |
| Critical | 0 |
| Major | 0 |
| Minor | 5 |
| Nit | 4 |

## Verification evidence

| Проверка | Команда | Результат |
| --- | --- | --- |
| Unit | `npx nx test patient-service --maxWorkers=2 --skip-nx-cache` | ✅ `Test Suites: 10 passed, 10 total` · `Tests: 83 passed, 83 total` (2-й прогон). ⚠️ 1-й прогон: 1 suite не запустился (69/69 тестов прошли, «worker process has failed to exit gracefully», Nx пометил задачу как flaky) — падение воркера под нагрузкой параллельных агентов, а не assertion |
| E2E | `npx nx e2e patient-service --skip-nx-cache` | ✅ `Test Suites: 3 passed, 3 total` · `Tests: 24 passed, 24 total` |
| Lint | `npx nx lint patient-service --skip-nx-cache` | ✅ `All files pass linting` |
| Typecheck | `npx tsc --noEmit -p apps/patient-service/tsconfig.app.json` / `tsconfig.spec.json` | ✅ exit 0 / exit 0 |
| Build | `npx nx build patient-service --skip-nx-cache` | ✅ `Successfully ran target build … and 4 tasks it depends on` |
| Шаблон | `diff` `project.json`, `jest.e2e.config.ts`, `app.module.ts` против appointment-service | ✅ идентичны (с заменой имени) |
| Файлы ≤ 300 строк, функции ≤ 30 строк, нет `any`, kebab-case | ручная проверка | ✅ (макс. файл — `patient-access.service.spec.ts`, 183 строки) |

## Что проверено и подтверждено

**Соответствие API.**

- `GET /api/v1/me/patient` — `@RequiresRoles(PATIENT)` + `@RequiresScopes(patient/*.read)`; пациент только из
  claim `patient` (`ownPatientId`), query `?patient=` не читается (e2e `me-patient` строки 63–71).
- `GET /api/v1/patients/{id}` и `/{id}/related` — пути совпадают с `infra/traefik/dynamic.yml` (роутеры `patients`
  priority 50, `patient-me` priority 40; `history|prescriptions` уходят в encounter-service с priority 60, `Path(/api/v1/me)`
  у auth-service точный — конфликтов нет).
- Пагинация §0: `page ≥ 1` (+ `@Max(1000)`), `pageSize 1…100`, дефолты 1/20 из `libs/contracts`, ответ —
  `PaginatedResponseDto` через `buildPaginatedResponse`. `_offset`/`_count`/`_total=accurate` — так же, как в
  appointment/catalog/encounter-service.
- Ошибки: только коды из `ERROR_CODES` (`COMPARTMENT_VIOLATION`, `FORBIDDEN_SCOPE`, `FORBIDDEN_ROLE`, `NOT_FOUND`,
  `VALIDATION_ERROR`); `FhirClientError` даёт 404/502/504 без утечки URL HAPI (e2e `me-patient` строка 115).

**Безопасность (ADR-013, контракты).**

- PATIENT: сравнение `id` с claim `patient` до любого вызова HAPI; claim `Patient/{id}` нормализуется, мусор → 403.
- DOCTOR: личность из `fhirUser = PractitionerRole/{id}`; отсутствие/иной тип → 403 `COMPARTMENT_VIOLATION` до HAPI
  (fail closed). Связь доказывается поиском `Appointment?patient&actor&status` / `Encounter?patient&participant&status`
  (параметры сверены с R4 через `get_fhir_resource`) **и** перепроверкой в процессе (тип, статус, оба участника).
  Формат участников совпадает с тем, что пишут appointment-service (`participant[].actor`, `appointments.service.ts:96-100`)
  и encounter-service (`participant[].individual`, `encounter-opening.mapper.ts:50`).
- ADMIN: без компартмента; 404 для неизвестного id.
- Инъекции в FHIR-запрос исключены: `:id`, claim `patient` и id из `fhirUser` проходят `FHIR_ID_PATTERN`
  (запятая — OR в FHIR-поиске — запрещена), `read` кодирует id через `encodeURIComponent`, поиск — `URLSearchParams`.
  Исправление id из одних точек (`.`/`..`) корректно: WHATWG URL действительно сворачивает такие сегменты.
- Перебор id врачом невозможен: неизвестный и чужой пациент дают одинаковый 403 (компартмент до чтения).
- Секреты только из env, env валидируется zod при старте (`parsePatientServiceEnv`), `FHIR_CLIENT_ID/SECRET` —
  только парой.

**Отклонения из отчёта coder — оценка.**

| # | Отклонение | Оценка |
| --- | --- | --- |
| 1 | PATIENT допущен к `/patients/{id}` только для своего id | ✅ Принято: план Task 11 прямо требует `COMPARTMENT_VIOLATION`, а не `FORBIDDEN_ROLE` |
| 2 | Неизвестный id у DOCTOR → 403, а не 404 | ✅ Принято: защита от перебора; ADMIN и свой id пациента получают 404 |
| 3 | «Активный» = `booked/arrived/checked-in/fulfilled` и `planned…finished` | ✅ Принято: набор статусов Appointment совпадает с encounter-service (`history/patient-access.service.ts:10`); patient-service ещё и строже по Encounter |
| 4 | Нет AuditEvent | ✅ Принято: все эндпоинты read-only, API §0 / ADR-014 требуют аудит только на create/update/delete |
| 5 | Нет RabbitMQ / `patient.registered.v1` | ✅ Принято: API §2.2.6 и план Task 7 (строка 1209) относят публикацию к auth-service; таблица architect §4.4 устарела |
| 6 | Нет `nestjs-pino` / `@nestjs/terminus` / `@nestjs/swagger` | ✅ Принято: пакетов нет в `package.json`, ни один сервис их не использует |

**Фронтенд-контракт.** `frontend/src` не вызывает §3.1–3.3 (поиск по `me/patient`, `/patients/`, `related` находит только
`/patients/{id}/history` из encounter-service), в `frontend/src/lib/contracts.ts` нет формы пациента. Расхождений нет.

## Issues Found

### Critical (Must Fix)

Нет.

### Major (Should Fix)

Нет.

### Minor (Consider)

- [ ] **m1. Отрицательные ветки `encounterJoins` не покрыты тестами** —
  `apps/patient-service/src/modules/access/patient-access.service.ts:52-61`,
  `apps/patient-service/src/modules/access/patient-access.service.spec.ts:111-120`.
  Для Encounter есть только позитивный тест. Если удалить проверку `CARE_ENCOUNTER_STATUSES.includes(...)` или
  `referencesResource(subject, 'Patient', …)`, ни один тест не упадёт. Ни один тест также не проверяет параметр `status`,
  отправляемый в HAPI (`expect.objectContaining` без `status`). Это код авторизации, и его перепроверка — заявленная
  защита на случай, если HAPI проигнорирует параметр поиска.
  **Fix:** добавить тесты: (а) Encounter `status: 'entered-in-error'` (и `cancelled`) → `COMPARTMENT_VIOLATION`;
  (б) Encounter с `subject: Patient/other` → `COMPARTMENT_VIOLATION`; (в) Encounter без участника `PractitionerRole/role-1`
  → `COMPARTMENT_VIOLATION`; (г) в позитивных тестах добавить `status: CARE_*_STATUSES.join(',')` в `objectContaining`.

- [ ] **m2. HAPI 404 при поиске связи превращается в «связи нет» без записи в лог** —
  `apps/patient-service/src/modules/access/patient-access.service.ts:132-136`.
  Любой 404 от HAPI на `Appointment`/`Encounter`-поиск молча становится `[]`: и неизвестный Patient (задумано), и
  неизвестный `PractitionerRole` врача, и неверный `FHIR_BASE_URL`. В последнем случае все врачи получают 403
  `COMPARTMENT_VIOLATION`, а в логе есть только общий `Patient compartment violation` без причины. GOLDEN-PRINCIPLES:
  «Log errors with context».
  **Fix:** перед `return []` записать `this.logger.debug`/`warn({ resourceType, url: error.url, upstreamStatus: error.upstreamStatus }, 'FHIR search answered 404; treating as no shared care')`.
  Поведение (403) не менять.

- [ ] **m3. Лишнее чтение Patient и дублирование проверки существования** —
  `apps/patient-service/src/modules/related-persons/related-persons.service.ts:56-61` и
  `apps/patient-service/src/modules/patients/patients.service.ts:34-40`.
  Одна и та же логика («`read Patient` → `resourceType !== 'Patient'` → `NotFoundException NOT_FOUND`») скопирована в два
  сервиса. Для DOCTOR в `/related` чтение лишнее: найденный общий Appointment/Encounter уже доказывает, что Patient есть.
  В итоге запрос врача к `/related` — до 4 вызовов HAPI.
  **Fix:** вынести `PatientReader.readExisting(id)` (например, в `access/` или `patients/`) и использовать в обоих
  сервисах; при желании пропускать чтение, если `assertCanRead` вернул, что существование уже доказано.

- [ ] **m4. e2e «forged signature» проверяет только `status >= 400`** —
  `apps/patient-service/test/me-patient.e2e-spec.ts:124-136`.
  Причина задокументирована и подтверждена: `libs/common/src/lib/guards/jwt-auth.guard.ts:71-78` не перехватывает ошибки
  `jose`, поэтому поддельная подпись и **просроченный токен** дают `500 INTERNAL` вместо `401 UNAUTHENTICATED`
  (в логе e2e — `code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED'` из `ProblemDetailsFilter`). Тест доказывает главное:
  HAPI не вызывается и данные не утекают. Но он не поймает регресс 401 → 500 после исправления библиотеки, и теста на
  просроченный токен нет.
  **Fix (patient-service):** после исправления `libs/common` ужесточить до `.expect(401)` + `errorCode: 'UNAUTHENTICATED'`
  и добавить кейс с `exp` в прошлом. Сам дефект — вне scope этого ревью (см. «Наблюдения вне scope», п. 1).

- [ ] **m5. `meta.totalItems` расходится с `items`, когда отброшена чужая запись** —
  `apps/patient-service/src/modules/related-persons/related-persons.service.ts:45-46`.
  `ownedBy` отбрасывает RelatedPerson чужого пациента, но `totalItems` берётся из `result.total` HAPI. Тогда клиент видит
  `totalItems: 2` при одном элементе (тест `related-persons.service.spec.ts:101-108` воспроизводит эту ситуацию, но `meta`
  не проверяет). Путь защитный и в норме не срабатывает, поэтому minor.
  **Fix:** при `items.length < resources.length` уменьшать `totalItems` на число отброшенных записей (или не
  доверять `total`) и проверить `meta` в тесте.

### Nit

- [ ] **n1. Имена тестов без условия «when»** — `patients.service.spec.ts:44`, `:68` (дословно из плана),
  `shared/fhir-datatypes.mapper.spec.ts:41`, `:63`, `:69`, `test/jwt-perimeter.e2e-spec.ts:38`.
  GOLDEN-PRINCIPLES: `should {expected} when {condition}`.

- [ ] **n2. `referencesResource` / `relatedPatientIdOf` не понимают версионные ссылки** —
  `apps/patient-service/src/modules/access/patient-identity.ts:59-65`,
  `apps/patient-service/src/modules/related-persons/mappers/related-person.mapper.ts:19`.
  Ссылка `Patient/9f2c/_history/2` (допустимая форма R4 Reference) не сопоставляется. Врач получает ложный 403, а
  RelatedPerson отбрасывается как «чужой» с `logger.error`. Ошибка в безопасную сторону, и сейчас сервисы пишут ссылки
  без версии, поэтому это nit. `canonicalReference` в appointment-service (`fhir-reference.ts:11`) суффикс
  `/_history/n` уже учитывает — лучше взять тот же разбор. Абсолютный base URL игнорируют обе реализации одинаково.

- [ ] **n3. `RelatedPerson.period` не отдаётся и не учитывается** —
  `apps/patient-service/src/modules/related-persons/mappers/related-person.mapper.ts:24-37`.
  Доверенное лицо с истёкшим `period` (R4: «Period of time that this relationship is considered valid») отдаётся наравне
  с действующим, а клиент не может их различить: `active` в DTO есть, а `period` нет. Добавьте `period?: { start?, end? }`
  в `RelatedPersonResponseDto` или помечайте истёкшие записи.

- [ ] **n4. DTO-типы объявлены в файле маппера** —
  `apps/patient-service/src/shared/fhir-datatypes.mapper.ts:8-36`,
  `apps/patient-service/src/modules/patients/dto/patient-response.dto.ts:1-6`.
  `PersonNameDto`/`ContactPointDto`/`IdentifierDto`/`CodingDto` — это контракт ответа, но `dto/` импортирует их из
  `*.mapper.ts`. Чище вынести типы в `shared/fhir-datatypes.dto.ts`, а мапперу оставить функции.

### Positive Notes

- Компартмент проверяется **до** чтения HAPI на всех трёх маршрутах, и e2e это доказывает
  (`expect(booted.fhir.read).not.toHaveBeenCalled()`).
- Двойная защита для врача: HAPI-поиск плюс перепроверка в процессе с `_count=1`. Если HAPI проигнорирует параметр,
  доступ всё равно не расширится: ошибка возможна только в сторону отказа.
- Все входы, которые попадают в URL FHIR, проходят regex FHIR id. Отдельно закрыты запятая (OR-инъекция) и id из одних
  точек (схлопывание URL). Исправление `_getpagesoffset` → `_offset` найдено и покрыто тестом до исправления (TDD).
- Мапперы защитно сужают `unknown`: некорректные элементы отбрасываются, `gender` проверяется по обязательному ValueSet,
  `use=old` фильтруется, порядок ФИО учитывает принятый в Беларуси.
- e2e поднимают настоящий `AppModule` с локальным RS256-издателем и JWKS, то есть проверяется ровно тот guard-стек,
  который уходит в прод. Покрыты 401 на всех маршрутах и публичный `/health`.
- Отклонения задокументированы и обоснованы ссылками на спецификации. Дефект общей библиотеки описан, но общие файлы
  не тронуты (правила параллельной работы соблюдены).

## Наблюдения вне scope (на вердикт не влияют, нужна эскалация оркестратору)

1. **`libs/common` `JwtAuthGuard`: ошибки `jose` → 500 вместо 401** (`libs/common/src/lib/guards/jwt-auth.guard.ts:71-78`,
   `verifyBearerToken`). Подтверждено чтением кода и логом e2e. Затрагивает все 8 BFF-сервисов: **просроченный** access-token
   (обычная ситуация через 15 минут) даёт `500 INTERNAL` вместо `401 UNAUTHENTICATED`, поэтому клиент не может по коду
   понять, что нужно обновить токен. Для системы это уровень major. Рекомендация совпадает с отчётом coder:
   `JOSEError` с кодами `ERR_JWT_*` / `ERR_JWS_*` / `ERR_JWKS_NO_MATCHING_KEY` → 401, недоступность JWKS оставить 5xx.
2. **`libs/common` `createValidationPipe` без `exceptionFactory`** (`libs/common/src/lib/pipes/validation.pipe.ts:19-21`):
   ответ 400 не содержит `details[]` с полями, которых требует API §1 для `VALIDATION_ERROR`. Сейчас `detail` равен
   `"Bad Request Exception"`, а `ProblemDetailsFilter.fromValidationError` нигде не вызывается. Касается всех сервисов.
3. **`TOKEN_REVOCATION` привязан только в auth-service**. В patient-service, как и в остальных BFF, отозванный токен
   (`TOKEN_REVOKED`) принимается до истечения срока. Это согласуется с шаблоном, но остаётся системным пробелом.
4. **Таблица событий architect §4.4** называет издателем `patient.registered.v1` patient-service, а API §2.2.6 и план
   Task 7 — auth-service. Сейчас событие не публикует никто, хотя notification-service его потребляет.
   Нужно исправить спецификацию и реализовать публикацию в auth-service.

## Next Steps

**Next by flow:** `/test-generator` — закрыть m1 (отрицательные ветки `encounterJoins`, параметр `status`) и m5 (проверка `meta`).

**Alternatives:**

- `/coder` — исправить m2, m3, m5 и nit-замечания в `apps/patient-service`.
- `/finishing-branch` — вердикт approve, тесты есть; minor можно закрыть позже.
