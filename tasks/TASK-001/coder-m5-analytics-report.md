# coder-m5-analytics-report.md

**Skill:** coder (backend) · **Milestone:** M5 — Analytics · **Plan:** `tasks/TASK-001/writing-plans-plan.md` Task 15
· **API:** `specs/api-designer-spec.md` §9.1–9.4 · **Требования:** FR-019, FR-021, BR-007, ADR-011/014

Дата: 2026-10-13. Запуск возобновлён после прерывания: частичная работа предыдущей попытки
(сущности, `ReportsService`, `AuditService`, `AuditSyncService`, маппер `AuditEvent`, `date-range`)
проверена и сохранена. Исправлена ошибка компиляции в `audit-event.mapper.ts`, из-за которой падали
2 сьюта. Остальное дописано: конфигурация, TypeORM + миграция, worker, контроллеры, bootstrap и e2e.

## Что сделано

| Часть | Реализация | Статус |
| --- | --- | --- |
| Сервис (порт 3008) | `apps/analytics-service`: шаблон appointment/catalog-service. Guard-стек `APP_GUARD` из `libs/common`, `ProblemDetailsFilter`, `RequestIdMiddleware`, глобальный `createValidationPipe()`, Redis rate-limit в `main.ts`, `GET /health` (`@Public`, совпадает с `HEALTH_PATH` в compose) | ✅ |
| 9.1 `GET /api/v1/admin/analytics/appointments` | read-model `appointment_fact` + id no-show из HAPI (раздел «Исправления», MN-1). Ответ в форме `MeasureReport` (`measure`, `scoring: 'cohort'`, `period`, `total`, `groups[]`) и плоские поля `booked/cancelled/noshow` для `analytics-dashboard.tsx` | ✅ |
| 9.2 `GET /api/v1/admin/analytics/encounters` | `encounter_fact`, группировка по `PractitionerRole.specialty`. Специальность определяется один раз, при приёме события | ✅ |
| 9.3 `GET /api/v1/admin/analytics/services-popularity?top=` | топ `HealthcareService` по числу записей без отменённых. `top` от 1 до 50, по умолчанию 10. Названия услуг берутся из HAPI (`_id=…&_elements=name`); если HAPI недоступен, отдаются голые id | ✅ |
| 9.4 `GET /api/v1/admin/audit?from=&to=&entity=&userId=&page=&pageSize=` | `PaginatedResponseDto<AuditEventDto {id, occurredAt, userId, action, resourceType, resourceId, requestId}>` из read-model `audit_event`, сначала новые записи | ✅ |
| Доступ (BR-007) | у всех 4 эндпоинтов `@RequiresScopes('user/*.read')` + `@RequiresRoles(ADMIN)`. DOCTOR получает 403 `FORBIDDEN_ROLE`, PATIENT — 403 `FORBIDDEN_SCOPE`, без токена — 401 | ✅ |
| Диапазон | `from ≤ to` и не больше 366 дней, иначе 400 `VALIDATION_ERROR` (RFC 7807). Без границ берутся последние 30 дней | ✅ |
| Worker | `analytics.worker.ts` слушает `appointment.booked.v1`, `appointment.cancelled.v1`, `encounter.completed.v1` из `medical.events` через **свои** очереди `analytics.*` + `.dlq` + `.retry` (`bindQueueWithDlq`) | ✅ |
| Схема `analytics` | TypeORM `DataSource` (`synchronize: false`), миграция `AnalyticsInit1760342400000`. Схема и миграции применяются под `pg_advisory_lock`, поэтому реплики, стартующие одновременно, не мешают друг другу | ✅ |

## Архитектурные решения и отклонения от плана

1. **Факты вместо `measure-report.entity`.** В плане указана сущность `MeasureReport`. Но предагрегаты
   не отвечают на произвольный период `?from=&to=`. Поэтому read-model хранит **по строке на субъект**
   (`appointment_fact`, `encounter_fact`), а DTO в форме `MeasureReport` собирается при чтении
   (`GROUP BY` по индексированным `start_at`/`completed_at`). Отчёт по-прежнему строится только из
   read-model и не пересчитывается по HAPI (ADR-011).
2. **No-show (9.1) — read-model + HAPI.** События неявки нет, поэтому её знает только HAPI
   (после раунда 1 — см. «Исправления», MN-1). Сервис пагинирует `Appointment?status=noshow&date=ge{from}&date=lt{toExclusive}&_elements=id`
   и передаёт id в read-model. Тот в **одном SQL-запросе** переводит записи со статусом `booked`, чьи id
   есть в списке, в `noshow`. R4-параметр `Appointment.date` — это `Appointment.start`, то же измерение,
   по которому фильтрует read-model, и обе половины считают один полуоткрытый период. Все три числа
   (`booked`/`cancelled`/`noshow`) описывают одну популяцию — записи, о которых знает read-model, —
   и всегда её разбивают. Запись, сделанная до запуска worker'а, не попадает ни в одно из чисел.
3. **Специальность (9.2) определяется при приёме события.** Для `PractitionerRole/{id}` выполняется `read`.
   Для `Practitioner/{id}` выполняется `PractitionerRole?practitioner=…&_elements=specialty`: пример
   контракта в `libs/contracts` использует `Practitioner/2`, а encounter-service шлёт `PractitionerRole/…`,
   поэтому поддержаны оба варианта. Берётся первый `coding`, а при его отсутствии — `text`. Если роли
   нет (404/410), запись попадает в группу `unknown` («Специальность не указана»). Любой другой сбой
   HAPI пробрасывается, и доставка уходит на retry: лучше повторить, чем сохранить неверную метку.
   Исключение — последняя попытка: приём сохраняется с `unknown` (раздел «Исправления», MN-2).
4. **Журнал аудита (9.4) — read-model, который пополняется из HAPI.** Спецификация (§9.4 «read-model»,
   ADR-014, architect §5 «по событиям/расписанию») требует read-model, а событий аудита нет. Прямой
   поиск в HAPI не годится. Сервисы пишут пользователя в `agent.who.identifier`, и стандартный
   параметр `agent` (reference) по нему не ищет — это проверено по `CapabilityStatement` HAPI 8.12. Фильтра «только тип ресурса» для
   `entity` нет. Пагинация с пост-фильтрацией дала бы неверный `totalItems`. Поэтому
   `AuditSyncScheduler` раз в `AUDIT_SYNC_INTERVAL_MS` (по умолчанию 15 с) вызывает `AuditSyncService`.
   Тот читает HAPI запросом `AuditEvent?_lastUpdated=ge{cursor−60s}&_sort=_lastUpdated&_count=200&_offset=…`
   (до 25 страниц за прогон). Строки вставляются по принципу insert-or-ignore по `AuditEvent.id`, а
   курсор только растёт (`GREATEST`). Окно перекрытия в 60 с ловит поздние коммиты HAPI. Запуски не
   пересекаются, и параллельная работа реплик безопасна.
   *Цена решения:* журнал отстаёт от HAPI не больше чем на интервал синхронизации. HAPI остаётся системой записи.
5. **Маппинг `AuditEvent` → строка журнала** (`audit-event.mapper.ts`) учитывает формат
   appointment/encounter-service `audit.ts`:
   - `userId` = `agent[requestor].who.identifier.value`, то есть JWT `sub`. Запасные варианты — `who.reference` и `altId`.
   - `action`: restful `subtype` (`create`/`update`/`delete`), иначе код R4 `C/U/D`. Записи `R`/`E` в журнал не попадают.
   - `resourceType/resourceId` берутся из первой относительной ссылки `entity[].what`, суффикс `_history` отбрасывается.
   - `requestId` читается из `entity[].detail[type=requestId]` или из BALP-сущности `XrequestId`.
     auth-service уже пишет BALP `XrequestId` (`audit-event.builder.ts`), поэтому для его событий поле
     заполнено; appointment-/encounter-service пока не пишут (см. «Находки»).
6. **Идемпотентность worker'а.** Используется таблица-реестр `processed_event` (PK `event_id`):
   - `INSERT … ON CONFLICT DO NOTHING RETURNING` и upsert факта выполняются в **одной транзакции**.
     Повторная доставка, пришедшая одновременно с первой, ждёт на PK и затем видит конфликт.
   - **ack только после commit.** Сбой даёт до 5 попыток через `<queue>.retry` (задержка 5 с,
     заголовок `x-analytics-attempt`), после чего сообщение уходит в DLQ через `nack(requeue=false)`.
     Некорректное сообщение уходит в DLQ сразу: оно проверяется на границе (`analytics-event.ts`),
     включая длины полей против колонок.
   - Есть цикл переподключения, как в notification-service: `error`/`close` у соединения и канала,
     а также отмена consumer'а брокером.
   - Worker отключается через `CONSUMER_ENABLED=false`.
7. **Порядок событий.** Booked и cancelled идут по разным очередям, поэтому отмена может прийти раньше.
   Тогда она создаёт строку со статусом `cancelled`, а пришедшая позже запись заполняет поля
   бронирования, **не** возвращая статус `booked`. Это проверено на реальной PostgreSQL.
8. **Период.**
   - Дата без времени в `to` включает весь день (UTC).
   - Дата-время в `to` — включительный момент.
   - Дата-время без смещения трактуется как UTC, а не как зона сервера.
   - SQL и HAPI получают один и тот же полуоткрытый интервал `[from, toExclusive)`.
   - В ответе `period` указан включительно, как в `MeasureReport.period`.
9. **`down()` миграции не удаляет схему**, потому что в ней лежит таблица `migrations` TypeORM.
10. **Swagger не подключён:** `@nestjs/swagger` не установлен (как и в M2/M3).

## Переменные окружения (валидация zod — `src/config/analytics-env.ts`)

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME` | fallback `POSTGRES_*`, затем `localhost:5432/medcenter` | read-model. Пароль обязателен, по умолчанию его нет. Совпадает с `x-db-env` в compose |
| `CONSUMER_ENABLED` | `true` | `false` отключает RabbitMQ-worker |
| `RABBITMQ_URL` | — | обязателен, если worker включён |
| `AUDIT_SYNC_ENABLED` / `AUDIT_SYNC_INTERVAL_MS` | `true` / `15000` (от 1 с до 1 ч) | синхронизация журнала из HAPI |
| `FHIR_BASE_URL`, `JWT_*`, `REDIS_URL`, `RATE_LIMIT_PER_MINUTE` | как у остальных BFF | `libs/fhir`, `libs/common` |

## Находки (вне моих путей; файлы не менялись)

- **Major — `libs/common/src/lib/guards/jwt-auth.guard.ts:115`.** `canActivate` не перехватывает
  ошибки `jose` (`JWSSignatureVerificationFailed`, `JWTExpired`, `JWTClaimValidationFailed`). Из-за этого
  поддельный или просроченный токен получает **500 `INTERNAL`** вместо 401 `UNAUTHENTICATED` (API §1).
  Это затрагивает все 8 сервисов: истёкший токен фронт видит как 500 и не запускает refresh.
  Воспроизведено e2e-тестом. Он оставлен в `test/jwt-perimeter.e2e-spec.ts` как `it.skip` с пояснением
  и должен быть включён после исправления.
  **Исправление:** обернуть `verifyBearerToken` в `try/catch` и бросать
  `UnauthorizedException({ errorCode: 'UNAUTHENTICATED' })`.
- **Minor — `requestId` не попадает в `AuditEvent` appointment-/encounter-service.**
  `apps/appointment-service/.../audit.ts` и `apps/encounter-service/src/common/audit/audit-event.ts` не
  записывают correlation id, поэтому `AuditEventDto.requestId` для их записей пустой, и кнопка
  «копировать» в `audit-table.tsx` копирует пустую строку (события auth-service уже несут `XrequestId`).
  **Исправление:** добавить в первую `entity` элемент `detail: [{ type: 'requestId', valueString: <X-Request-Id> }]`.
  Маппер аналитики это уже читает, тест есть.

## Расхождения с фронтендом (`frontend/` не менялся)

- `audit-table.tsx` запрашивает только `?page=N`, без `from/to`. По спецификации это допустимо, и
  сервис берёт последние 30 дней. Но более старые события таблица не покажет, пока в UI не появятся
  поля периода.
- `analytics-dashboard.tsx` использует только §9.1 и читает плоские `booked/cancelled/noshow`. Они
  отдаются рядом с `groups[]`, так что совместимо. §9.2/§9.3 во фронтенде пока не используются.

## Проверки (DoD Standard)

Финальные результаты — после исправлений раунда 1 (см. раздел «Исправления»).

| Проверка | Команда | Результат |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit -p apps/analytics-service/tsconfig.app.json` и `tsconfig.spec.json` (+ `test/**` через scratch-tsconfig) | ✅ exit 0 |
| Lint | `npx nx lint analytics-service --skip-nx-cache` | ✅ «All files pass linting» |
| Unit | `npx nx test analytics-service --maxWorkers=2 --skip-nx-cache` | ✅ 16 suites, 186 tests passed |
| E2E | `npx nx e2e analytics-service --skip-nx-cache` | ✅ 5 suites; 59 passed, 1 skipped (документированный дефект `libs/common`, см. «Находки»). Testcontainers-сьюты выполнялись (Docker доступен) |
| Build | `npx nx build analytics-service --skip-nx-cache` | ✅ «Successfully ran target build for project analytics-service and 5 tasks it depends on» |
| Именование | `coder-m5-analytics-report.md`, файлы в kebab-case, файлы ≤ 300 строк | ✅ |

E2E включает Testcontainers PostgreSQL 16 с рабочей миграцией: `test/read-model.e2e-spec.ts` (worker,
агрегаты §9.1–9.3, классификация no-show) и `test/audit-journal.e2e-spec.ts` (журнал и синхронизация с
враждебными записями HAPI). Без Docker оба сьюта пропускаются, но теперь с `console.warn` (общий хелпер
`test/postgres-fixture.ts`).

## Тесты

- Unit (`src/**`):
  - `analytics-env`, `AnalyticsInit` (миграция), `typeorm.config` (advisory lock)
  - `date-range` (366 дней, `from>to`, UTC, включительный `to`, даты пониженной точности → 400)
  - `reports.service` (тесты плана: `rejects.toThrow('range')`, группировка по статусу, no-show через id из HAPI,
    группы по `(system, code)`), `clinical-report.source` (пагинация no-show, лимит, имена услуг)
  - `audit.service`, `audit-event.mapper` (границы колонок, NUL, `AuthUser`), `audit-sync.service`
    (построчный fallback), `audit.repository` (`isRowRejection`), `audit-sync.scheduler`
  - `analytics-event` (валидация на границе, FHIR id), `specialty.resolver`, `ingestion.service`
    (specialty `unknown` на последней попытке), `delivery.processor`, `analytics.worker` (fake amqplib:
    bind, ack, nack→DLQ, retry, reconnect, shutdown)
- E2E (`test/**`):
  - `jwt-perimeter` — 401 без токена, публичный `/health`
  - `audit` — mocked FHIR → sync → HTTP: фильтры, пагинация, дедуп, 30 дней по умолчанию, 400/401/403,
    запись с длинными полями, `AuthUser`
  - `reports` — форма §9.1–9.3, запрос no-show в HAPI, 400 (в т.ч. `2026-10`), 401/403 для всех трёх эндпоинтов
  - `read-model`, `audit-journal` — Testcontainers PostgreSQL 16

## Исправления по code review (раунд 1)

Источник: `code-reviewer-analytics-r1-report.md` (0 critical, 1 major, 6 minor, 5 nit). Предыдущая попытка
исправлений была прервана до первой правки (ни один файл не изменился после ревью), поэтому всё ниже
сделано в этом запуске. Закрыты все находки; shared-файлы и `frontend/` не менялись.

| Находка | Решение | Доказательство |
| --- | --- | --- |
| **MJ-1** одна «ядовитая» запись `AuditEvent` замораживает журнал | Три слоя. (1) `audit-event.mapper.ts` ограничивает каждое поле шириной колонки (`userId`/`requestId`/`source` — 128), срезает NUL (PostgreSQL отвергает `\u0000`), проверяет `AuditEvent.id` и `resourceId` по FHIR `[A-Za-z0-9\-.]{1,64}`, тип ресурса — `[A-Z][A-Za-z]{1,63}`. (2) `AuditSyncService` при отказе БД по **данным** (SQLSTATE класса 22/23, `isRowRejection`) вставляет страницу построчно, пропускает только неисправимую строку (лог `error` с `auditEventId`), курсор двигается. (3) Отказ БД не по данным (`ECONNREFUSED`, `57P01`, deadlock) пробрасывается: курсор не двигается, следующий тик повторяет страницу | unit: 200-символьные значения, NUL, длинные тип/id, сбой посреди построчного повтора; Testcontainers: страница с длинными полями сохраняется, курсор сдвинут; запись с `recorded` до 4713 до н. э. проходит маппер, но PostgreSQL отвечает `22008` — остальные строки сохранены, курсор сдвинут; классификатор проверен на реальной ошибке драйвера |
| **MN-1** `booked/cancelled` и `noshow` — разные популяции | HAPI отдаёт только **id** no-show за период (`_elements=id`, пагинация по реально полученным записям, лимит 100 страниц × 200 — дальше громкая ошибка, а не заниженное число). Read-model одним запросом `CASE … = ANY($3::varchar[])` переводит записи `booked` из списка в `noshow`. Пол `max(…, 0)` и вычитание больше не нужны: счётчики разбивают одну популяцию | unit `reports.service`, `clinical-report.source`; e2e `reports`; Testcontainers (6 кейсов: перевод, неизвестный id, отменённая запись, вне периода, 5001 id массивом) |
| **MN-2** сбой HAPI > ~20 с навсегда выбрасывает приём из §9.2 | `DeliveryProcessor` передаёт `isLastAttempt`; на последней попытке `IngestionService` при сбое `SpecialtyResolver` сохраняет приём со специальностью `unknown` (лог `error`), итог §9.2 верен. До последней попытки сбой по-прежнему уходит в retry — метка остаётся точной. Сбой БД на последней попытке не прощается: DLQ | unit `ingestion.service`, `delivery.processor` |
| **MN-3** события аккаунтов auth-service без ресурса | Маппер читает `entity.what.identifier` системы `https://api.medcenter.by/sid/auth-user` (константа продублирована: приложения не импортируют друг друга) как `resourceType='AuthUser'`, `resourceId=<id>`; относительная ссылка FHIR по-прежнему приоритетнее. Фильтр `entity=AuthUser` работает без изменения `ENTITY_FILTER_PATTERN` | unit `audit-event.mapper`, e2e `audit` |
| **MN-4** `2026`, `2026-10` принимались как мгновение | `RFC3339_DATE_OR_DATE_TIME` (`YYYY-MM-DD` или date-time, смещение `Z`/`±hh:mm`) в `@Matches` DTO **и** в `resolveDateRange` (сервисы вызываются не только из HTTP); `@IsISO8601({strict})` остаётся для несуществующих дат | unit `date-range` (6 значений), e2e `reports` и `audit` (`2026-10`, `2026`, `2026-02-30` → 400) |
| **MN-5** копия журнала не повторяет ретенцию HAPI | **Принятое отклонение от ADR-014, задокументировано** (`audit.repository.ts`, интерфейс `AuditRepository`). В этом развёртывании у HAPI нет ни ретенции `AuditEvent`, ни expunge-задачи (`infra/`, `docker-compose.yml` их не содержат), поэтому копия и оригинал совпадают по содержимому. Автоматическая очистка ввела бы политику, которой в спецификации нет. Когда у HAPI появится ретенция, копии понадобится соответствующая очистка (`DELETE … WHERE occurred_at < …`) | — |
| **MN-6** пробелы в тестах | Новый `clinical-report.source.spec.ts`; 401/403 `FORBIDDEN_ROLE`/`FORBIDDEN_SCOPE` для §9.1, §9.2 и §9.3 (`describe.each`); тесты на MJ-1 (unit + Testcontainers) | см. выше |
| **NT-1** имена тестов без `when` | Переименованы все (кроме дословного теста плана `reports.service.spec.ts:27`) | `grep` по `src`/`test` |
| **NT-2** id событий только по длине | `analytics-event.ts`: `appointmentId`/`serviceId`/`encounterId` — FHIR id `[A-Za-z0-9\-.]{1,64}`; запятая в `serviceId` больше не разобьёт `_id=` поиск | unit `analytics-event` |
| **NT-3** §9.2 группировка только по `specialty_code` | `GROUP BY (specialty_system, specialty_code)`; в группу добавлено необязательное поле `system` (аддитивно, §9.2 фронтенд не использует) | unit, e2e, Testcontainers |
| **NT-4** Testcontainers-сьют молча пропускается | Общий хелпер `test/postgres-fixture.ts`: без Docker — `console.warn` с именем сьюта | — |
| **NT-5** неточность отчёта | Исправлена строка про `requestId` и «Находки»: auth-service пишет BALP `XrequestId`, appointment-/encounter-service — нет | — |

### Отклонения и ограничения, которые остались

- **Популяция §9.1.** Записи, сделанные до запуска worker'а (например, на dev-стенде после M3), не входят ни в
  `booked`, ни в `cancelled`, ни в `noshow`. Раньше no-show по ним попадал в `noshow` и вычитался из `booked`
  других записей; теперь числа согласованы, но неполны, пока read-model не заполнен. Разовый backfill
  read-model из HAPI не делался: это отдельная задача. Нужно явно описать в `specs/api-designer-spec.md` §9.1
  (spec — не мои пути).
- **`unknown` — навсегда.** Приём, записанный на последней попытке с `unknown`, сам не перемаркируется.
  Если это станет заметно в §9.2, понадобится разовый скрипт пересчёта специальности из HAPI.
- **Ручной redrive DLQ** по-прежнему отсутствует (`analytics.*.dlq` разбирается вручную в RabbitMQ UI);
  для приёмов это теперь редкий случай (только сбой БД на последней попытке или некорректное сообщение).
- **`it.skip`** в `test/jwt-perimeter.e2e-spec.ts` остаётся: дефект `libs/common/src/lib/guards/jwt-auth.guard.ts:115`
  (поддельный/просроченный токен → 500 вместо 401) не исправлен (`git status libs/` чист), это отдельная задача.
