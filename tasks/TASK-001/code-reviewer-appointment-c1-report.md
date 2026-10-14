# Code Review — `appointment-service`, чтение записей (Task 12, API §6.2/§6.3/§6.5), раунд 1

- **Ревьюер:** code-reviewer skill
- **Дата:** 2026-10-14
- **Ветка:** `feature/clinic-platform-wip` (незакоммиченные изменения в `apps/appointment-service/**`, часть файлов untracked)
- **Scope:** `git status`/`git diff` по `apps/appointment-service/**` (14 изменённых + ~30 новых файлов) и отчёт
  `coder-m3-reads-report.md`. `sharedChanges: []` согласуется с деревом: `libs/*` без изменений (единственное, от чего
  зависит приложение); изменённые `docker-compose.yml`, `infra/traefik/dynamic.yml`, `package.json`, `frontend/*`, `tools/*`
  относятся к параллельным работам других агентов и в scope этого ревью не входят.
- **Источники истины:** `api-designer-spec.md` §0/§1/§6, `architect-architecture.md` ADR-009/012/013/014,
  `coder-m3-booking-spec.md`, `writing-plans-plan.md` Task 12, контракт claims из `auth-service/.../identity.ts`,
  FHIR R4 (`get_fhir_resource Appointment`: search-params, structure).
- **DOD tier:** Standard

## Вердикт

**APPROVE.** Критических и major-замечаний нет. Читающая сторона (6.2/6.3/6.5) соответствует спецификации: компартмент
берётся только из токена и резолвится до обращения к HAPI, личность врача — только из `fhirUser = PractitionerRole/{id}`
с fail-closed, ввод валидируется до формирования FHIR-запроса, ошибки идут через `ProblemDetailsFilter` только с кодами
из `ERROR_CODES`. Найдено 5 minor и 3 nit (+ 1 информационная запись о frontend); одно из minor (нестабильная
пагинация при равных `start`) подтверждено на живом HAPI и исправляется одной строкой — рекомендую взять в ближайший
проход, но блокирующим оно не является.

| Severity | Кол-во |
| --- | --- |
| Critical | 0 |
| Major | 0 |
| Minor | 5 |
| Nit | 4 (3 + 1 информационная) |

## Verification evidence (прогнано независимо)

| Проверка | Команда | Результат |
| --- | --- | --- |
| Unit | `npx nx test appointment-service --maxWorkers=2 --skip-nx-cache --coverage` | ✅ `Test Suites: 17 passed` · `Tests: 138 passed`; покрытие 98.1 % stmts / 81.7 % branches / 97.6 % funcs |
| E2E (с реальным HAPI в Testcontainers) | `npx nx e2e appointment-service --skip-nx-cache` | ✅ `Test Suites: 4 passed` · `Tests: 25 passed` (71 с) |
| Lint | `npx nx lint appointment-service` | ✅ `All files pass linting` |
| Typecheck | `npx tsc --noEmit -p apps/appointment-service/tsconfig.app.json` | ✅ exit 0 |
| Стиль | grep по `src`/`test` | ✅ нет `any`, нет `!`-assertions, нет TODO/`console.log`; макс. файл — 286 строк (spec), `appointments.service.ts` 181; функции ≤ 30 строк (`book` — ровно 30) |
| Мёртвый код | экспорты без внешних потребителей | ✅ каждый экспорт используется в коде или spec |

Дополнительно проверено эмпирически на одноразовом контейнере `hapiproject/hapi:latest` (изолированный порт, контейнер
остановлен, общий dev-HAPI на :8080 не трогался):

| Гипотеза | Результат |
| --- | --- |
| HAPI отдаёт устаревшие результаты повторного поиска (search-cache 60 с) после cancel/нового бронирования | ❌ не подтвердилась: идентичный запрос сразу показал `cancelled` и новую запись |
| `_offset` за пределами выборки (`page=500`) даёт 4xx → `500 INTERNAL` | ❌ не подтвердилась: `200`, пустой `entry`, `total` корректен |
| Дата с зоной `+03:00` в `date=ge…` доходит до HAPI | ✅ работает (при `URLSearchParams`-кодировании `%2B`) |
| `_sort=date` при равных `start` стабилен между страницами | ⚠️ **нет** — см. AC1-01 |
| Date-only `from/to` смещают приём у границы суток (отклонение №4 из отчёта) | ❌ не подтвердилось на этой сборке HAPI: `00:30+03:00` попадает в «свои» сутки по локальной дате записи (см. примечание ниже) |

## Что проверено и подтверждено

**Соответствие API.**

- 6.2 `GET /api/v1/appointments` — `@RequiresRoles(PATIENT)` + `@RequiresScopes(patient/*.read)`; `page`/`pageSize`
  (1…100, по умолчанию 20), `sortOrder` (asc по умолчанию), `upcoming`; ответ — `{ items, meta }`. 200.
- 6.3 `GET /api/v1/appointments/{id}` — `PATIENT|DOCTOR|ADMIN`, scope выбирается по роли (`scope-policy.ts`), владелец /
  участник-врач / админ; чужое → `403 COMPARTMENT_VIOLATION`, нет записи → `404 NOT_FOUND`, `{id}` не FHIR id → `400`.
- 6.5 `GET /api/v1/doctor/appointments` — `DOCTOR` + `user/*.read`, `actor=PractitionerRole/{id}` из `fhirUser`,
  `from`/`to` RFC 3339 (дата или date-time с зоной), `from > to` → `400 VALIDATION_ERROR`.
- 6.6 no-show и 6.1/6.4 не менялись по смыслу; статусы 201/200/200/200 соответствуют §6.
- Traefik: `appointment-doctor` (priority 60) и `appointments` совпадают с контроллерами, конфликтов с `/api/v1/doctor/schedule`
  (catalog) нет.

**Безопасность (ADR-013).**

- Пациент: `requirePatientReference(claims)` → `Patient/{id}` из claim `patient`; query `patient` нигде не читается
  (поле отсутствует в DTO, контроллер собирает запрос из явно выбранных полей); e2e подтверждает (`patient=Patient/someone-else`
  → поиск идёт по `Patient/pat-1`).
- Врач: `requireDoctorRoleRef` — fail-closed `403 COMPARTMENT_VIOLATION` без обращения к HAPI, если `fhirUser` нет или он не
  `PractitionerRole/…` (unit + e2e + на 6.3/6.5/6.6). Формат claim совпадает с `auth-service` (`identity.ts: toIdentityClaims`).
- Порядок «компартмент → FHIR → проверка владения → статус» исключает утечку состояния чужой записи в no-show/cancel.
- Инъекции в FHIR-поиск: `{id}` — `FhirIdPipe` (`^(?!\.+$)[A-Za-z0-9\-.]{1,64}$`, запятая/слэш/точки-только отвергаются);
  `from/to` — строгий regex RFC 3339 + `@IsISO8601({strict})`; `page`/`pageSize`/`sortOrder`/`upcoming` — числа/enum;
  ссылки из токена нормализуются `parseReference` с тем же правилом. `REFERENCE_PATTERN` ограничен по длине — ReDoS нет.
- `RequestIdMiddleware` санитизирует клиентский `X-Request-Id` перед записью в `AuditEvent`.
- Секретов в коде нет; `REDIS_URL`/`FHIR_*` — только из env.

**FHIR R4.**

- `Appointment`: `participant[].status`, `start/end`, `slot`, `reasonCode`, `cancelationReason` (R4-имя, не `statusReason`),
  `created` (dateTime) — соответствуют структуре R4. Параметры поиска `actor`, `patient`, `date` (= `Appointment.start`)
  существуют в R4. `_include=Appointment:actor` + `_include:iterate=PractitionerRole:practitioner` отрабатывают на реальном HAPI.
- Транзакционный Bundle: `PUT` с `ifMatch` + `POST AuditEvent`; порядок записей в ответе HAPI используется
  (`entries[1]`) — подтверждено e2e на реальном HAPI (1×201 + 1×409 `SLOT_CONFLICT` при гонке).
- `AuditEvent` содержит обязательные для R4 поля (`type`, `action`, `recorded`, `outcome`, `agent[].requestor`,
  `source.observer`), `entity` с ролью пациента и `X-Request-Id`.

**Качество.** Слои соблюдены (controller → services → FHIR client), чтение вынесено в `AppointmentQueriesService`,
один запрос с `_include` вместо N+1, `FhirClientError` не глотается (404/409/5xx маппятся в каталожные коды), единственный
`catch` в `fhir-transaction.ts` пробрасывает всё, кроме 409.

## Замечания

### Critical

Нет.

### Major

Нет.

### Minor

- [ ] **AC1-01. Нестабильная пагинация при равных `Appointment.start`** — `appointment-queries.service.ts:34`.
  `_sort: 'date' | '-date'` без вторичного ключа. На живом HAPI 7 записей пациента с одинаковым `start`, `_count=3`:
  стр. 1 `[t7,t6,t5]`, стр. 2 `[t6,t3,t2]` (t6 повторилась), стр. 3 `[t4]` — `t1` потерялась. Равные `start` реальны:
  отмена и повторная запись на тот же слот оставляют в HAPI две записи (cancelled + booked) с одним `start` и тем же
  `PractitionerRole`; журнал врача (6.5) не фильтрует по статусу. При размере страницы 20 (по умолчанию) и границе страницы
  внутри группы одинаковых `start` врач может не увидеть пациента или увидеть дубль.
  Исправление (проверено на HAPI): `_sort: query.sortOrder === 'desc' ? '-date,_id' : 'date,_id'` — результат
  `[t1,t2,t3] [t4,t5,t6] [t7]`. Добавить unit-проверку `_sort` и e2e/интеграционный сценарий с ≥ 2 записями на один `start`.
- [ ] **AC1-02. Тесты не доказывают значения по умолчанию и фильтр `upcoming`** — `dto/page-query.dto.ts:33-39`,
  `appointments.controller.ts:55`, `test/booking-concurrency.e2e-spec.ts:126`.
  (а) `toPageQuery` (дефолты `page=1`, `pageSize=20`, `sortOrder=asc`, API §0) не выполняется ни одним unit-тестом
  (покрытие: `page-query.dto.ts` 0 % веток, строка 34 не покрыта); e2e проверяет только явное `pageSize=10`.
  (б) отображение `upcoming === 'true'` в контроллере не тестируется напрямую; сценарий с реальным HAPI берёт запись на
  2030 год — он проходит и при выключенном фильтре. Нет теста «прошедшая запись исключается при `upcoming=true`».
  (в) нет spec для `ListAppointmentsQueryDto` (`upcoming=maybe` → 400); в `dateRange` не покрыта граница «только `to`».
  Исправление: unit-тесты на `toPageQuery`, DTO-spec для `upcoming`, e2e-проверка `search` с `date: [ge…]` при
  `upcoming=true` и без `date` при отсутствии параметра; в сценарии с HAPI добавить прошедшую запись.
- [ ] **AC1-03. `doctorId` согласован не во всех ответах** — `appointment-view.mapper.ts:72-74`,
  `libs/fhir-mappers/src/lib/appointment.mapper.ts:57`.
  Общий маппер ищет участника `Practitioner/…`, которого в записи нет (есть только `PractitionerRole`), поэтому ответы
  6.1/6.4/6.6 содержат `doctorId: ''`, а 6.2/6.3/6.5 подставляют id Practitioner через `_include`. Тип `AppointmentResponseDto`
  один, а значение поля различается; при отсутствии include на чтении тоже возвращается `''`, а не отсутствие поля.
  Для текущего frontend безопасно (из 6.1/6.4/6.6 он читает только `id`), но контракт неоднороден. Решение: либо
  опускать `doctorId`, когда он неизвестен (`undefined`), либо договориться, что id врача — это `practitionerRoleId`.
  Общий маппер не менять без согласования (shared lib).
- [ ] **AC1-04. Сбой записи в Redis после успешной брони превращается в 500** — `idempotency/idempotency.service.ts:83-85`
  (M3-код, в этот раунд попал изменением стора).
  `await this.store.set(...)` вне `try/catch`: если Redis недоступен в момент `SET` (клиент настроен `maxRetriesPerRequest: 1`),
  клиент получает 500, хотя слот уже занят и Appointment создан; повтор с тем же ключом даёт `409 SLOT_CONFLICT`.
  Кэш ответа — best-effort после коммита; предложение: логировать `warn` с `Idempotency-Key`-контекстом и возвращать
  результат. Тест: `set` бросает → `run` возвращает ответ операции.
- [ ] **AC1-05. Гейт BR-001 запускается на `hapiproject/hapi:latest`** — `test/booking-concurrency.e2e-spec.ts:78`.
  Плавающий тег делает единственный интеграционный тест на `If-Match`/поиск невоспроизводимым: обновление образа
  может поменять семантику `_include`/сортировки/`ifMatch` без изменений в коде. Тот же тег в `docker-compose.yml:155`,
  поэтому замечание общее: закрепить версию (в тесте — через `E2E_HAPI_IMAGE` с pinned-значением по умолчанию).

### Nit

- [ ] **AC1-06.** `dto/page-query.dto.ts:5` импортирует тип `PageQuery` из `appointment-queries.service.ts` — DTO зависит
  от сервиса (обратное направление по слоям). Вынести `PageQuery` в отдельный файл (`dto/page-query.ts`) или в сам DTO.
- [ ] **AC1-07.** Нормализация CRLF → LF заявлена в отчёте как выполненная, но `src/modules/events/appointment-publisher.service.ts`
  и `test/e2e-env.ts` остались с CRLF (в HEAD — тоже CRLF, в `git status` не изменены). Кроме того, 69 строк исходников (5 %)
  длиннее `printWidth: 100` из `.prettierrc` (у `catalog-service` — 21 из 2096, у `patient-service` — 25 из 972); lint это не ловит.
- [ ] **AC1-08.** API §0 перечисляет `sortBy` («enum per-endpoint»); для 6.2/6.5 параметра нет, значение молча отбрасывается
  whitelist-пайпом (сортировка всегда по `start`). Это разумно — стоит зафиксировать в отчёте как принятое отклонение.
- [ ] **INFO-FE (запись, правок в этом сервисе не требуется).** `frontend/` не менялся, расхождения верно зафиксированы
  исполнителем и подтверждены ревьюером: (1) `frontend/src/app/(patient)/appointments/page.tsx:13` и
  `components/appointments/appointment-detail-view.tsx:12` вызывают `/api/v1/me/appointments[/{id}]` — в `infra/traefik/dynamic.yml`
  такого маршрута нет (есть только `me/history`, `me/prescriptions`, `me/patient`), то есть на реальном стеке страница получит
  404 на периметре; спецификация — `/api/v1/appointments`. (2) `frontend/src/app/(doctor)/doctor/appointments/page.tsx:18`
  вызывает `?date=YYYY-MM-DD` и читает `time`; `date` отбрасывается whitelist-пайпом, поэтому журнал вернёт первую страницу
  записей врача по возрастанию `start` за всё время, а не за день; нужны `from=to=YYYY-MM-DD` и вывод времени из `start`.
  (3) `AppointmentCard` ждёт `doctorName`/`serviceName` — есть в `AppointmentViewDto`.

## Примечания и вне объёма

- **Существование записи (403 vs 404).** `GET /appointments/{id}` различает «чужая» (403) и «нет такой» (404). Это прямо
  предписано контрактом (cross-patient → `403 COMPARTMENT_VIOLATION`), идентификаторы HAPI числовые и подбираются, но решение
  принято на уровне спецификации — не замечание к реализации.
- **Rate-limit (общая библиотека, не этот раунд).** `libs/common/.../rate-limit.guard.ts` строит ключ как
  `sub:METHOD:path:minute`, где `path` включает `{id}`; перебор `GET /appointments/{id}` не упирается в 120 req/min, так как
  каждый id — отдельное ведро. Стоит учесть при ревью `libs/common` (нормализация до route-шаблона).
- **Отклонение №4 из отчёта (date-only и часовой пояс)** на проверенной сборке HAPI не проявляется: запись
  `2031-02-06T00:30:00+03:00` находится запросом `ge/le 2031-02-06` и не находится запросом за `2031-02-05`; `2031-02-07T02:00:00+03:00`
  — за 07-е, не за 06-е (HAPI сравнивает по дате, сохранённой с исходным смещением). Рекомендация клиентам слать date-time
  с зоной остаётся безопасной, но формулировку риска в отчёте можно смягчить.
- **Покрытие после правок** отчётом не снималось; ревьюер снял: 98.1 % stmts, 81.7 % branches (слабые места — `page-query.dto.ts`,
  `appointment-resource.ts` ветка `createdAppointmentId`, `fhir-transaction.ts` строки 39/80).
- **Хорошее:** `FHIR_ID_PATTERN` с запретом точек-только закрывает реальный URL-collapse (`Slot/..`) во всех входах
  (путь, тело, claim) и покрыт тестами; `scope-policy.ts` аккуратно решает ограничение `@RequiresScopes` для общих маршрутов;
  `AppointmentPublisherService` получил unit-тесты (было 36 %); e2e-стенд (`app-harness`, `test-tokens` с реальным JWKS)
  прогоняет настоящий guard-стек, а не моки.

## Context Summary

Чтение записей (6.2/6.3/6.5) реализовано корректно и безопасно: компартмент и личность врача берутся только из токена и
fail-closed, ввод строго валидируется, FHIR-запросы и маппинг соответствуют R4, проверки (138 unit, 25 e2e с реальным HAPI,
lint, tsc) зелёные и независимо воспроизведены. Critical 0, Major 0, Minor 5 (главное — нестабильная пагинация при равных
`start`, подтверждено на живом HAPI; фикс `_sort=date,_id`), Nit 3 + запись о расхождениях с frontend.

## Next Steps

**Next by flow:** `/test-generator` — закрыть пробелы AC1-02 (дефолты пагинации, `upcoming`, DTO-spec) и добавить сценарий
с равными `start` для AC1-01.

**Alternatives:**
- `/coder` — взять AC1-01 (однострочный фикс сортировки), AC1-04 (best-effort `set`), AC1-05 (закрепить образ HAPI).
- `/finishing-branch` — завершать можно: блокирующих замечаний нет (frontend-пути правит владелец `frontend/`).
