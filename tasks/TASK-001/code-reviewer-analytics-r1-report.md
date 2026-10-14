# Code Review — analytics-service (Task 15, M5), раунд 1

Дата: 2026-10-13. **Skill:** code-reviewer · **Объект:** незакоммиченные изменения `apps/analytics-service/**`
(весь каталог новый, untracked) · **Отчёт исполнителя:** `coder-m5-analytics-report.md`.
**Источники:** `writing-plans-plan.md` Task 15, `specs/api-designer-spec.md` §0/§1/§9,
`specs/architect-architecture.md` §4.4/§5, ADR-011/013/014, `.claude/GOLDEN-PRINCIPLES.md`.
Изменения в shared-библиотеках: нет (`git status libs/` чистый).

## Проверки (DoD Standard)

| Проверка | Команда | Результат |
| --- | --- | --- |
| Unit | `npx nx test analytics-service --maxWorkers=2 --skip-nx-cache` | ✅ 14 suites, 119 tests passed |
| E2E | `npx nx e2e analytics-service --skip-nx-cache` | ✅ 4 suites; 35 passed, 1 skipped (`it.skip` — дефект `libs/common`, см. ниже). Testcontainers-сьют `read-model` **выполнялся** (Docker доступен) |
| Lint | `npx nx lint analytics-service --skip-nx-cache` | ✅ All files pass linting |
| Typecheck | `npx tsc --noEmit -p apps/analytics-service/tsconfig.app.json` и `tsconfig.spec.json` | ✅ exit 0 |
| Build | `npx nx build analytics-service --skip-nx-cache` | ✅ `dist/apps/analytics-service/src/main.js` совпадает с `CMD` в `nest-service.Dockerfile` |
| Именование / размер | kebab-case, все файлы ≤ 300 строк, функции ≤ 30 строк, нет `any` и `!`-assertion (кроме definite assignment в entity — как в auth-service) | ✅ |

## Summary

Сервис сделан аккуратно и по шаблону appointment/catalog-service: `APP_GUARD`-стек, `ProblemDetailsFilter`,
глобальный validation pipe, rate-limit, `/health`, Traefik-маршруты совпадают. Все четыре эндпоинта §9
закрыты `user/*.read` + `ADMIN`; SQL параметризован; worker идемпотентен по `eventId` в одной транзакции с
фактом, ack только после commit; гонка двух доставок и «отмена раньше записи» проверены на реальном
PostgreSQL. Формы ответов совпадают с фронтендом (`analytics-dashboard.tsx` читает плоские
`booked/cancelled/noshow`, `audit-table.tsx` — `items/meta` со строковыми полями).

Блокирует одна **Major**-находка: синхронизация журнала аудита из HAPI не проверяет длины полей, и одна
«ядовитая» запись `AuditEvent` навсегда останавливает FR-021 журнал. Остальное — Minor/Nit.

| Severity | Кол-во |
| --- | --- |
| Critical | 0 |
| Major | 1 |
| Minor | 6 |
| Nit | 5 |

## Issues Found

### Critical (Must Fix)

Нет.

### Major (Should Fix)

- [ ] **MJ-1. Одна запись `AuditEvent` с длинным полем навсегда замораживает синхронизацию журнала (FR-021).**
  `apps/analytics-service/src/modules/audit/audit-event.mapper.ts:49-57` (`userIdOf`), `:69-84` (`requestIdOf`),
  `:86-89` (`sourceOf`), `:16` (`RELATIVE_REFERENCE` — тип ресурса `[A-Z][A-Za-z]+` без верхней границы);
  колонки `migrations/1760342400000-AnalyticsInit.ts:84-89` (`varchar(128)` / `varchar(64)`);
  `audit.repository.ts:76-87`; `audit-sync.service.ts:61-71, 85-90`; `audit-sync.scheduler.ts:44-50`.
  Цепочка (проверена по коду):
  1. маппер копирует `agent.who.identifier.value` / `who.reference` / `altId`, `source.observer.display`,
     `entity.detail.valueString` из HAPI без ограничения длины;
  2. `insertMany` вставляет всю страницу (до 200 строк) **одним** `INSERT … ON CONFLICT DO NOTHING`;
     PostgreSQL отвечает `value too long for type character varying(128)` на всю страницу;
  3. `syncOnce` падает до `advanceCursor`, следующий тик через 15 с читает тот же `_lastUpdated=ge…`
     с того же `_offset` и падает снова — бесконечно. Все более новые `AuditEvent` в журнал больше не
     попадают, а единственный сигнал — `warn` в логе.

  Сегодняшние издатели (appointment/encounter/auth-service) пишут короткие значения (`sub` = UUID,
  `requestId` ≤ 128 по `RequestIdMiddleware`), поэтому сбой латентный. Но HAPI для синхронизации — внешний
  источник (AGENTS.md: «MUST validate at system boundaries (… external APIs)»), издателей `AuditEvent`
  становится больше (каждый мутирующий эндпоинт всех 8 сервисов), а у worker'а та же проблема уже решена
  проверкой длин в `analytics-event.ts:12-19`. Цена сбоя — потеря журнала аудита целиком.
  **Fix:** в маппере обрезать `userId`/`source`/`requestId` до ширины колонок (как `clip` в
  `ingestion.service.ts:12-14`) и ограничить `RELATIVE_REFERENCE` (`[A-Z][A-Za-z]{1,63}`); дополнительно
  — при ошибке пакетной вставки повторить построчно и пропустить/залогировать (`id`) только
  неисправимую строку, чтобы курсор двигался. Тесты: unit на маппер с 200-символьным `who.identifier.value`
  и Testcontainers-кейс «страница с длинным полем сохраняется, курсор сдвинут».

### Minor (Consider)

- [ ] **MN-1. §9.1: `booked/cancelled` и `noshow` считаются по разным популяциям.**
  `reports.service.ts:45-58`, `clinical-report.source.ts:28-35`. `booked`/`cancelled` — только записи, чьи
  события дошли до worker'а (после его запуска; издатель теряет события при сбое брокера —
  `appointment-publisher.service.ts:32-38`, outbox нет), а `noshow` — все неявки периода в HAPI. На уже
  наполненном HAPI (dev-стенд после M3) дашборд покажет, например, `booked 0 / cancelled 0 / noshow 3`, а
  исторические неявки вычитаются из `booked` других записей; пол `max(…, 0)` скрывает только отрицательные
  значения, не неверные. Отклонение задокументировано, поэтому Minor.
  **Fix:** считать неявки только по записям, известным read-model (HAPI `status=noshow&_elements=id` за
  период ∩ `appointment_fact`), либо разовый backfill read-model из HAPI при первом запуске; как минимум —
  явно описать ограничение в spec §9.1.
- [ ] **MN-2. Временный сбой HAPI > ~20 с навсегда выбрасывает приём из §9.2.**
  `delivery.processor.ts:16-17, 46-54`, `specialty.resolver.ts:75-93`, `ingestion.service.ts:67-82`.
  5 попыток × 5 с, затем DLQ; механизма redrive нет, и `encounter_fact` недосчитывает приёмы.
  Специальность — метка, а не сам факт.
  **Fix:** на последней попытке сохранять факт со специальностью `unknown` (итог §9.2 остаётся верным),
  либо увеличить бюджет/экспоненциальную задержку для этой ветки; задокументировать ручной redrive DLQ.
- [ ] **MN-3. События аккаунтов auth-service попадают в журнал без ресурса и не фильтруются по `entity`.**
  `audit-event.mapper.ts:59-67` читает только относительные ссылки, а auth-service для изменений аккаунта
  без FHIR-ресурсов пишет только `entity.what.identifier{system: https://api.medcenter.by/sid/auth-user}`
  (`apps/auth-service/src/modules/audit/audit-event.builder.ts:67-74`). В `audit-table.tsx:28` такая строка
  выглядит как `"/"`. **Fix:** согласовать с auth-service представление System Object (например
  `resourceType='auth.user'`, `resourceId=<identifier.value>`) и расширить маппер + `ENTITY_FILTER_PATTERN`.
- [ ] **MN-4. Даты пониженной точности принимаются и трактуются как мгновение.**
  `shared/date-range-query.dto.ts:10-16` (`@IsISO8601({ strict: true })` пропускает `2026` и `2026-10` —
  проверено), `shared/date-range.ts:33-46`. `?from=2026-10&to=2026-10` даёт окно в 1 мс и `200` с нулями
  вместо месяца или `400`. §0 требует RFC 3339. **Fix:** `@Matches` на `YYYY-MM-DD` или полный RFC 3339
  date-time (с `Z`/смещением или без — как сейчас); тест на `2026-10` → 400.
- [ ] **MN-5. Ретенция копии журнала расходится с HAPI.** `audit.repository.ts:76-87` — только
  insert-or-ignore, удаления нет. ADR-014: «ретенция аудита следует ретенции HAPI»; удалённые/expunged в HAPI
  `AuditEvent` остаются в `analytics.audit_event` навсегда. **Fix:** задокументировать как отклонение от
  ADR-014 либо добавить периодическую сверку/очистку по сроку ретенции.
- [ ] **MN-6. Пробелы в тестах.** Нет unit-спека для `FhirClinicalReportSource` (`clinical-report.source.ts`):
  `total` отсутствует → `0`; сбой поиска имён → голые id + `warn`. В `test/reports.e2e-spec.ts:78-89` 403
  проверен только для §9.1; 401 и 403 для §9.2/§9.3 не проверены. Нет теста на MJ-1.

### Nit

- [ ] **NT-1. Имена тестов без `when`** (GOLDEN-PRINCIPLES «should … when …»): `test/read-model.e2e-spec.ts:96,104,125,133,151,173`,
  `audit-sync.scheduler.spec.ts:35`, `analytics-event.spec.ts:78`, `AnalyticsInit.spec.ts:53,59,67`,
  `audit-sync.service.spec.ts:57,107`, `audit.service.spec.ts:80`, `reports.service.spec.ts:99`,
  `test/audit.e2e-spec.ts:147,183`, `test/reports.e2e-spec.ts:27`, `test/jwt-perimeter.e2e-spec.ts:30`
  (тест плана `reports.service.spec.ts:27` можно оставить дословно).
- [ ] **NT-2. Идентификаторы событий проверяются только по длине.** `analytics-event.ts:29-55` —
  `appointmentId`/`serviceId`/`encounterId` не сверяются с FHIR id `[A-Za-z0-9\-.]{1,64}`; `serviceId` уходит в
  `_id=` (`clinical-report.source.ts:46-50`). Инъекции нет (URL-кодирование), но запятая в id разобьёт поиск.
- [ ] **NT-3. Группировка §9.2 только по `specialty_code`.** `reports.repository.ts:53-65`; при отсутствии
  coding текст становится кодом (`specialty.resolver.ts:42-44`). Одинаковые коды разных систем сольются.
  Достаточно группировать по `(specialty_system, specialty_code)`.
- [ ] **NT-4. Testcontainers-сьют молча пропускается** без `/var/run/docker.sock` (`read-model.e2e-spec.ts:12-13`):
  в CI без Docker SQL-покрытие исчезнет без сигнала. Достаточно `console.warn` при пропуске.
- [ ] **NT-5. Неточность в `coder-m5-analytics-report.md:61`** («ни один сервис его не пишет»): новый
  `audit-event.builder.ts` auth-service (`:36-44, 75`) пишет BALP `XrequestId`, и маппер его уже читает.
  Находка `:104` остаётся верной только для appointment/encounter-service.

### Вне области (подтверждено, не влияет на вердикт)

- **`libs/common/src/lib/guards/jwt-auth.guard.ts:115`** — `verifyBearerToken` вызывается без `try/catch`, а
  `ProblemDetailsFilter` не знает ошибок `jose`. Поддельный/просроченный токен → **500 `INTERNAL`** вместо
  401 `UNAUTHENTICATED` во всех 8 сервисах. Находка исполнителя подтверждена чтением кода; `it.skip` в
  `test/jwt-perimeter.e2e-spec.ts:43` с пояснением — корректный способ зафиксировать дефект чужого пути.
  Требует отдельной задачи для `libs/common`.

### Positive Notes

- **Идемпотентность worker'а:** `INSERT … ON CONFLICT DO NOTHING RETURNING` в реестр и факт в одной
  транзакции, ack после commit; конкурирующая доставка ждёт на PK. Проверено на PostgreSQL 16, включая
  гонку двух доставок (`read-model.e2e-spec.ts:104-111`).
- **Коммутативность booked/cancelled:** запись, пришедшая после отмены, не возвращает статус
  (`read-model.writer.ts:57-79`); проверено в `read-model.e2e-spec.ts:113-123`.
- **Граница брокера:** строгая валидация события (тип, `v`, длины под колонки) и мгновенный DLQ для
  некорректных сообщений; retry через `<queue>.retry` с заголовком попытки; reconnect-цикл; `settle`
  переживает закрытый канал.
- **Безопасность:** все эндпоинты `user/*.read` + `ADMIN` (403 `FORBIDDEN_ROLE` для DOCTOR, 403
  `FORBIDDEN_SCOPE` для PATIENT, 401 без токена — e2e); весь SQL параметризован; FHIR-параметры кодируются
  `URLSearchParams`; секретов в коде нет, пароль БД обязателен и без дефолта (zod).
- **Период:** единый полуоткрытый `[from, toExclusive)` для SQL и HAPI (`ge`/`lt`), UTC для дат без
  смещения, включительный `to`, 366 дней с учётом високосного года — всё покрыто тестами.
- **Миграции:** `synchronize: false`, схема `analytics`, advisory lock для одновременного старта реплик,
  повторный запуск проверен (`read-model.e2e-spec.ts:68-69`).
- **Журнал:** cursor только вперёд (`GREATEST`), окно перекрытия 60 с, insert-or-ignore по `AuditEvent.id`,
  маппер совместим с форматами appointment-, encounter- и auth-service.
- Хорошо задокументированные отклонения от плана (факты вместо `measure-report.entity`, read-model журнала,
  no-show из HAPI) с обоснованием по CapabilityStatement.

## Вердикт

**request-changes** — исправить MJ-1 (небольшая правка маппера + тест). Minor MN-1…MN-6 желательно закрыть
в том же раунде или явно задокументировать как принятые отклонения.

## Context Summary

Ревью analytics-service (Task 15, M5), раунд 1: 0 critical, 1 major, 6 minor, 5 nit; unit 119/119, e2e 35 + 1
skip (дефект `libs/common`), lint/tsc/build зелёные. Major: синхронизация журнала из HAPI не ограничивает
длины полей, и одна длинная запись `AuditEvent` навсегда останавливает FR-021 журнал. Сильные стороны —
идемпотентный worker с ack после commit, проверенный на реальном PostgreSQL, строгая авторизация и
параметризованный SQL.

## Next Steps

- **Next by flow:** `/test-generator [analytics-service M5 r1: тесты на длинные поля AuditEvent, FhirClinicalReportSource, 401/403 для §9.2/§9.3]`
- **Альтернативы:**
  - `/coder [analytics-service: исправить MJ-1 (ограничение длин в audit-event.mapper + построчный fallback вставки), MN-1…MN-6 по code-reviewer-analytics-r1-report.md]`
  - `/finishing-branch` — только после закрытия MJ-1.
