# Code Review — analytics-service (Task 15, M5), раунд c1 (повторная проверка после исправлений r1)

Дата: 2026-10-14. **Skill:** code-reviewer · **Объект:** незакоммиченные изменения `apps/analytics-service/**`
(весь каталог новый, untracked) · **Отчёт исполнителя:** `coder-m5-analytics-report.md` (раздел «Исправления по
code review (раунд 1)») · **Предыдущий отчёт ревью:** `code-reviewer-analytics-r1-report.md`.
**Источники:** `writing-plans-plan.md` Task 15, `specs/api-designer-spec.md` §0/§1/§9, `specs/architect-architecture.md`
§4.4/§5, ADR-009/011/013/014, `.claude/GOLDEN-PRINCIPLES.md`, контракты публикаторов
(`appointment-publisher.service.ts`, `encounter-publisher.service.ts`), фронтенд (`analytics-dashboard.tsx`, `audit-table.tsx`).
Изменения в shared-библиотеках: нет (`git status libs/` чист, `sharedChanges: []` подтверждено).

## Проверки (DoD Standard), выполнены повторно ревьюером

| Проверка | Команда | Результат |
| --- | --- | --- |
| Unit | `npx nx test analytics-service --maxWorkers=2 --skip-nx-cache` | ✅ 16 suites, 186 tests passed |
| E2E | `npx nx e2e analytics-service --skip-nx-cache` | ✅ 5 suites; 59 passed, 1 skipped (`it.skip` — дефект `libs/common`). Testcontainers-сьюты `read-model` и `audit-journal` **выполнялись** (в логе нет `SKIPPED`) |
| Lint | `npx nx lint analytics-service --skip-nx-cache` | ✅ «Successfully ran target lint» |
| Typecheck | `npx tsc --noEmit -p apps/analytics-service/tsconfig.app.json` и `tsconfig.spec.json` | ✅ exit 0 оба |
| Build | `npx nx build analytics-service --skip-nx-cache` | ✅ `dist/apps/analytics-service/src/main.js` совпадает с `CMD` в `nest-service.Dockerfile` |
| Стиль | kebab-case; все файлы ≤ 300 строк (максимум 249); функции ≤ 30 строк; нет `any` и `!`-assertion; имена тестов `should … when …` (единственное исключение — дословный тест плана `reports.service.spec.ts:27`) | ✅ |

## Summary

Все находки r1 закрыты, и закрыты по существу, а не «заплаткой». Самое важное, MJ-1 (одна «ядовитая» запись
`AuditEvent` замораживала журнал), решён тремя независимыми слоями: маппер ограничивает каждое поле шириной
колонки и срезает NUL, `AuditSyncService` вставляет страницу построчно при отказе БД **по данным** (SQLSTATE
класса 22/23), а сбой БД **не по данным** по-прежнему пробрасывается и не двигает курсор. Это доказано на реальном
PostgreSQL 16 (запись с `recorded` до 4713 до н. э. даёт `22008`, остальные строки сохраняются, курсор сдвигается;
классификатор `isRowRejection` проверен на настоящей ошибке драйвера). MN-1 сделан правильнее, чем предлагал r1:
HAPI отдаёт только id неявок, а один SQL (`CASE … = ANY($3::varchar[])`) переводит `booked` в `noshow`, так что три
счётчика всегда разбивают одну популяцию. Контракты событий сверены с реальными публикаторами
(`appointmentId`/`serviceId`/`encounterId` — голые FHIR id, `patientRef`/`practitionerRoleRef`/`slotRef` — `Type/id`),
гарантия авторизации (`user/*.read` + `ADMIN` на всех четырёх эндпоинтах, 401/403 покрыты e2e для §9.1–§9.4),
параметризация SQL, кодирование FHIR-параметров через `URLSearchParams` и ack только после commit подтверждены
чтением кода.

Новых critical/major находок нет. Остались две Minor и пять Nit; ни одна не блокирует мерж.

| Severity | Кол-во |
| --- | --- |
| Critical | 0 |
| Major | 0 |
| Minor | 2 |
| Nit | 5 |

## Верификация исправлений r1

| Находка r1 | Статус | Что проверено |
| --- | --- | --- |
| **MJ-1** замораживание журнала | ✅ закрыта | `audit-event.mapper.ts:15-22` (ширины колонок), `:48-58` (`asString` срезает NUL, `fit()` обрезает), `:91-113` (`FHIR_ID` и `RELATIVE_REFERENCE` с верхней границей), `:149-168` (`toAuditEventRow`). `audit-sync.service.ts:91-127`: построчный повтор только при `isRowRejection`, лог `auditEventId`. Unit: 200-символьные значения, NUL, длинные тип/id; Testcontainers: страница с длинными полями сохранена, `22008` обработан, курсор сдвинут |
| **MN-1** разные популяции | ✅ закрыта | `reports.repository.ts:49-54` (`CASE … ANY($3::varchar[])`), `clinical-report.source.ts:43-67` (только id, пагинация по реально полученному, `NO_SHOW_MAX_PAGES` с громким отказом). Testcontainers: 6 кейсов, включая отменённую запись, неизвестный id, вне периода и 5001 id массивом |
| **MN-2** сбой HAPI > ~20 с | ✅ закрыта | `delivery.processor.ts:43`, `ingestion.service.ts:92-112`: на последней попытке приём сохраняется как `unknown`; сбой БД не прощается |
| **MN-3** события аккаунтов | ✅ закрыта | `audit-event.mapper.ts:24-30, 91-113`: `AuthUser/{id}`, FHIR-ссылка приоритетнее; фильтр `entity=AuthUser` работает (e2e) |
| **MN-4** даты пониженной точности | ✅ закрыта | `date-range.ts:16`, `date-range-query.dto.ts`: `2026`, `2026-10`, `20261001`, `T10`, пробел-разделитель, `+0300` → 400. Проверено выполнением: `@IsISO8601({strict})` дополнительно отсекает `2026-02-30` и `T24:00` |
| **MN-5** ретенция | ✅ принято | задокументировано в `audit.repository.ts:37-44` и в отчёте как отклонение от ADR-014 с условием пересмотра |
| **MN-6** тесты | ✅ закрыта | `clinical-report.source.spec.ts` (13 кейсов), `describe.each` 401/403 для §9.1–§9.3, MJ-1 на unit и Testcontainers |
| **NT-1…NT-5** | ✅ закрыты | имена тестов (grep), FHIR id событий, группировка `(system, code)` (SQL + DTO `system?`), `console.warn` при пропуске Testcontainers, исправление отчёта (но см. NT-4 ниже) |

## Issues Found

### Critical (Must Fix)

Нет.

### Major (Should Fix)

Нет.

### Minor (Consider)

- [ ] **MN-1. Сбой самой БД расходует бюджет повторов worker'а, а потерянные события не восстановить.**
  `apps/analytics-service/src/modules/worker/delivery.processor.ts:47-53` (`attempt < MAX_DELIVERY_ATTEMPTS` без
  различия причин), `analytics.worker.ts:127-141` (`dead-letter` → `nack(requeue=false)`),
  `libs/messaging/src/lib/topology.ts:11` (`RETRY_DELAY_MS = 5_000`).
  Цепочка (проверена чтением кода): PostgreSQL недоступен дольше ~20 с (перезапуск контейнера, failover, миграция
  соседа) → каждая доставка падает 5 раз по 5 с → `dead-letter` → событие лежит в `analytics.*.dlq`. Redrive для
  DLQ нет (отчёт: «разбирается вручную в RabbitMQ UI»), backfill read-model из HAPI тоже нет (отчёт: «отдельная
  задача»). Итог: короткая авария БД необратимо занижает §9.1–§9.3. Журнал аудита от такой аварии застрахован
  (курсор не двигается), worker — нет; это асимметрия. Отчёт описывает только «сбой БД на последней попытке»,
  но не масштаб: под удар попадают **все** события за время аварии, а не одно.
  **Fix:** различать причину. Для сбоев не по данным (тот же признак, что `isRowRejection`: отсутствие SQLSTATE
  класса 22/23, `ECONNREFUSED`, `57P01`, `40P01`) не сжигать попытки: либо отдельный увеличенный бюджет
  (например, 60 попыток с нарастающей задержкой), либо `nack(requeue=true)` с паузой потребителя до восстановления
  соединения. В DLQ отправлять только данные, которые БД отвергла (`22/23`), и некорректные сообщения. Тест:
  `delivery.processor.spec` — «ошибка соединения не ведёт в DLQ на пятой попытке».

- [ ] **MN-2. В логи попадают привязанные параметры SQL (ссылки на пациентов, идентификаторы пользователей).**
  `delivery.processor.ts:47-52` (`{ err: error, … }` при сбое upsert), `audit-sync.service.ts:108, 123`
  (`{ err: error, … }`). Проверено выполнением: `util.inspect({ err: new QueryFailedError(sql, ['Patient/123',
  'user-uuid'], driverError) })` печатает `query` и `parameters`. Значит, лог ошибки вставки факта содержит
  `patientRef`, `practitionerRoleRef`, а лог отказа страницы журнала — значения до 200 строк (`sub`, `requestId`).
  Ссылки псевдонимны, но это персональные идентификаторы в медицинском сервисе, а логи обычно уходят в общий
  стек; сам объект ошибки в лог при этом не нужен — для разбора хватает `code` и `message`.
  **Fix:** небольшой хелпер `describeError(error): { code?: string; message: string }` и лог
  `{ errorCode, errorMessage, … }` вместо `err` в этих трёх местах (в остальных `err: error` для брокера и HAPI
  параметров запроса не содержит). Тест: spy на `Logger.prototype.warn` не получает объект с `parameters`.

### Nit

- [ ] **NT-1. Пагинация неявок сортируется по `_lastUpdated`, а это нестабильный порядок для `_offset`.**
  `clinical-report.source.ts:51`. Запись, изменённая между страницами, уходит в хвост выдачи, а следующие записи
  сдвигаются на одну позицию к началу: граничная запись пропускается и неявка недосчитывается. Окно узкое
  (админский отчёт), но порядок бесплатный. **Fix:** `_sort: '_id'` — идентификаторы неизменны, при вставках
  новые ресурсы попадают только в конец. (Для синхронизации журнала `_lastUpdated` нужен курсору и остаётся.)
- [ ] **NT-2. Валидатор события отмены строже, чем нужно read-model.** `analytics-event.ts:46-53` требует
  непустой `patientRef`, хотя `appointment_fact.patient_ref` допускает `NULL`, а отмене нужен только
  `appointmentId`. Публикатор отправляет `patientRef: patientRef ?? ''`
  (`apps/appointment-service/src/modules/appointments/appointments.service.ts:108`), так что в случае записи без
  ссылки на пациента отмена уходит в DLQ, и запись навсегда остаётся `booked`. Сегодня недостижимо (запись создаётся
  только с пациентом), поэтому Nit. **Fix:** для `appointment.cancelled.v1` принимать `patientRef` как строку любой
  длины ≤ 128 и писать `NULL` для пустой.
- [ ] **NT-3. Сообщение «is not a calendar date» в `resolveDateRange` не соответствует поведению.**
  `shared/date-range.ts:44-48`: `new Date('2026-02-30')` в V8 не `Invalid Date`, а 2 марта (проверено), поэтому
  несуществующие даты отсекает только `@IsISO8601({ strict })` в DTO. Заявление отчёта «сервисы вызываются не только
  из HTTP» верно для regex, но не для календарной проверки. Сегодня сервис вызывает только контроллер, поэтому Nit.
  **Fix:** либо убрать из сообщения «calendar date», либо сверить `instant.toISOString().startsWith(value)` для
  date-only значений.
- [ ] **NT-4. Устаревшее утверждение в отчёте исполнителя.** `coder-m5-analytics-report.md`, раздел «Находки»
  («`requestId` не попадает в `AuditEvent` appointment-/encounter-service») и пункт 5 решений: рабочее дерево
  `apps/appointment-service/src/modules/appointments/audit.ts` уже пишет BALP `XrequestId`
  (параллельный агент), маппер аналитики его читает. Верно остаётся только для encounter-service
  (`audit-event.ts` без `requestId`). При слиянии отчётов поправить формулировку.
- [ ] **NT-5. Булевы поля без префикса `is/has/can/should`** (GOLDEN-PRINCIPLES, «Naming»):
  `audit-sync.scheduler.ts:17` (`running`), `analytics.worker.ts:33` (`stopped`), `enabled` в `WorkerConfig` и
  `AuditSyncConfig` (`config/analytics-env.ts`). Шаблонные сервисы делают так же, поэтому исключительно косметика.

### Вне области и действия оркестратора (не влияют на вердикт)

- **`specs/api-designer-spec.md` §9.1** не описывает ограничение популяции: записи, сделанные до запуска worker'а,
  не входят ни в `booked`, ни в `cancelled`, ни в `noshow` (на dev-стенде после M3 дашборд покажет нули, пока
  не пройдут новые события). Исполнитель просит дописать это в спецификацию; файл вне его путей. Разовый backfill
  read-model из HAPI (отдельная задача) снимает ограничение полностью и заодно закрывает хвост MN-1.
- **`libs/common/src/lib/guards/jwt-auth.guard.ts:115`** — поддельный/просроченный токен → 500 `INTERNAL` вместо
  401 `UNAUTHENTICATED` во всех 8 сервисах; `it.skip` в `test/jwt-perimeter.e2e-spec.ts:43` с пояснением —
  корректная фиксация дефекта чужого пути. Нужна отдельная задача для `libs/common`.
- **Фронтенд:** `audit-table.tsx` запрашивает только `?page=N`, поэтому видны последние 30 дней; формы ответов
  §9.1 (`booked/cancelled/noshow` плоско) и §9.4 (`items/meta`, строковые поля) совпадают с контрактом.
- **Swagger** не подключён (`@nestjs/swagger` не установлен, как и в M2/M3) — отклонение от спеки §10, общее для
  всех сервисов.

### Positive Notes

- **Три слоя защиты журнала** (маппер → построчный повтор → проброс сбоев БД) и классификатор `isRowRejection`,
  проверенный на реальной ошибке PostgreSQL, а не только на синтетической.
- **Партиция §9.1 одним SQL-запросом**: пол `max(…, 0)` и вычитание ушли, счётчики не могут разойтись; `ANY($3)` с
  одним массивом вместо `IN (...)` снимает ограничение на число параметров (покрыто тестом на 5001 id).
- **Идемпотентность и порядок событий:** `INSERT … ON CONFLICT DO NOTHING RETURNING` и факт в одной транзакции, ack
  после commit, гонка двух доставок и «отмена раньше записи» проверены на PostgreSQL 16; UPSERT-ы коммутативны.
- **Граница брокера:** строгая валидация события (включая FHIR id, чтобы запятая не разбила `_id=` поиск), мгновенный
  DLQ для некорректных сообщений, цикл переподключения, `settle` переживает закрытый канал.
- **Безопасность:** `user/*.read` + `ADMIN` на всех эндпоинтах (403 `FORBIDDEN_ROLE`/`FORBIDDEN_SCOPE`, 401 без
  токена — e2e для каждого из четырёх), весь SQL параметризован, `entity`/`userId`/`top`/`page` ограничены regex и
  `@Min/@Max`, секретов в коде нет, пароль БД обязателен без дефолта (zod).
- **Период:** единый полуоткрытый `[from, toExclusive)` для SQL и HAPI (`ge`/`lt`), UTC для дат без смещения,
  включительный `to`, 366 дней, `period` в ответе включительный как в `MeasureReport.period`.
- **Качество тестов:** тесты доказывают поведение (SQL выполняется на реальной БД, HAPI и брокер — управляемые
  двойники), а не повторяют реализацию; отказные пути (`HAPI down`, обрыв посреди построчного повтора,
  `ECONNREFUSED`) проверены явно.

## Вердикт

**approve** — critical и major отсутствуют, все находки r1 закрыты и подтверждены повторным запуском проверок.
Minor MN-1 (бюджет повторов при аварии БД) и MN-2 (параметры SQL в логах) желательно закрыть до выкладки в
окружение с реальным трафиком; Nit можно взять попутно.

## Context Summary

Повторное ревью analytics-service (Task 15, M5) после исправлений r1: 0 critical, 0 major, 2 minor, 5 nit; unit
186/186, e2e 59 passed + 1 skipped (дефект `libs/common`), Testcontainers-сьюты выполнялись, lint/tsc/build зелёные.
MJ-1 (заморозка журнала аудита) закрыт тремя слоями и доказан на реальном PostgreSQL; MN-1 (популяция §9.1) решён
одним SQL-запросом. Остались: авария БД > 20 с необратимо отправляет события в DLQ (нет redrive/backfill) и
`QueryFailedError` в логах печатает привязанные параметры (ссылки на пациентов).

## Next Steps

- **Next by flow:** `/test-generator [analytics-service M5 c1: тест «ошибка соединения с БД не ведёт в DLQ на пятой попытке», тест «лог не содержит parameters»]`
- **Альтернативы:**
  - `/coder [analytics-service: MN-1 (классификация сбоев БД в delivery.processor, отдельный бюджет повторов), MN-2 (describeError вместо err в логах), NT-1…NT-5 по code-reviewer-analytics-c1-report.md]`
  - `/finishing-branch` — можно приступать: блокирующих находок нет; перед этим дописать ограничение §9.1 в `specs/api-designer-spec.md`.
