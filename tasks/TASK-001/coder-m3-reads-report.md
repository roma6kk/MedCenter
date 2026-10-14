# coder-m3-reads-report.md

**Skill:** coder (backend) · **Задача плана:** Task 12 — `appointment-service`, чтение записей (FR-004/006/009) ·
**API:** `specs/api-designer-spec.md` §6.2, §6.3, §6.5 · **Порт:** 3005 · **Дата:** 2026-10-14

> Возобновлённый прогон: предыдущая попытка прервалась по лимиту. Её незакоммиченная работа в
> `apps/appointment-service/**` проверена и сохранена: читающая сторона (6.2/6.3/6.5), обогащение
> именами, `scope-policy`, аудит с `X-Request-Id`, health, rate-limit в `main.ts`, e2e-стенд на
> HAPI (Testcontainers) оказались реализованы и зелёными. Дубликатов модулей нет. В этом прогоне
> закрыты два пробела (см. «Исправления») и подтверждены проверки.

## Что реализовано

| # | Эндпоинт | Доступ | Реализация |
| --- | --- | --- | --- |
| 6.1 | `POST /api/v1/appointments` | `PATIENT` + `patient/*.write` | уже было (M3): `AppointmentsService.book` |
| 6.2 | `GET /api/v1/appointments?upcoming=&page=&pageSize=&sortOrder=` | `PATIENT` + `patient/*.read` | `AppointmentQueriesService.listForPatient` |
| 6.3 | `GET /api/v1/appointments/{id}` | владелец-пациент (`patient/*.read`), участник-врач / `ADMIN` (`user/*.read`) | `AppointmentQueriesService.findById` |
| 6.4 | `POST /api/v1/appointments/{id}/cancel` | владелец-пациент / `ADMIN` | уже было (M3) |
| 6.5 | `GET /api/v1/doctor/appointments?from=&to=&page=&pageSize=&sortOrder=` | `DOCTOR` + `user/*.read`, участник через `fhirUser` | `AppointmentQueriesService.listForDoctor` |
| 6.6 | `POST /api/v1/doctor/appointments/{id}/noshow` | `DOCTOR` + `user/*.write`, участник через `fhirUser` | уже было (M3) |
| — | `GET /health` | `@Public()` | liveness для compose |

### Структура чтения

```
appointment-queries.service.ts   listForPatient / findById / listForDoctor; _count/_offset/_total=accurate, _sort=±date
appointment-view.mapper.ts       toAppointmentView: AppointmentResponseDto + doctorName / serviceName / patientName из _include
dto/appointment-view.dto.ts      AppointmentViewDto extends AppointmentResponseDto (имена опциональны)
dto/page-query.dto.ts            page (1…1000), pageSize (1…100, по умолчанию 20), sortOrder (asc по умолчанию)
dto/list-appointments-query.dto  upcoming=true|false; поля `patient` НЕТ (whitelist-pipe отбрасывает его, ADR-013)
dto/list-doctor-…-query.dto      from/to: RFC 3339 дата или date-time с зоной; from > to → 400 VALIDATION_ERROR
doctor-appointments.controller   6.5 и 6.6 (маршрут /api/v1/doctor/appointments)
compartment.ts                   resolveViewer / assertViewerCanSee / requireDoctorRoleRef (fail closed до обращения к HAPI)
scope-policy.ts                  scope выбирается по роли для маршрутов, общих для пациента и персонала (6.3, 6.4)
fhir-reference.ts, fhir-id.pipe  разбор ссылок (относительные, абсолютные, /_history/n), валидация `{id}` → 400
```

### Поведение

- **6.2.** Пациент берётся только из claim `patient` (`Patient/{id}`); поиск `Appointment?patient=…`,
  сортировка по `start`, `upcoming=true` добавляет `date=ge<сейчас>`. Ответ — `PaginatedResponseDto`
  (`items`, `meta{page,pageSize,totalItems,totalPages}`). Query-параметр `patient` игнорируется.
- **6.3.** Поиск `Appointment?_id=` вместо `read`, чтобы одним запросом получить имена через `_include`.
  Компартмент решается из токена до обращения к HAPI; затем проверка участия: пациент-владелец,
  врач-участник (`PractitionerRole` из `fhirUser`), `ADMIN` без ограничений. Чужая запись →
  `403 COMPARTMENT_VIOLATION`; неизвестный id → `404 NOT_FOUND`; id не FHIR → `400 VALIDATION_ERROR`.
- **6.5.** `Appointment?actor=PractitionerRole/{id}`, фильтр `date=ge{from}&date=le{to}` (включительно,
  дата без времени покрывает весь день). Токен без `fhirUser = PractitionerRole/{id}` →
  `403 COMPARTMENT_VIOLATION` без обращения к HAPI.
- **Имена для клиента.** `frontend/src/components/appointments/appointment-card.tsx` ожидает
  `doctorName` и `serviceName`; журнал врача — имя пациента. `AppointmentViewDto` добавляет
  `doctorName` (`Practitioner.name` за `PractitionerRole`, ФИО), `serviceName` (`HealthcareService.name`)
  и `patientName`. Имена приходят из того же поиска (`_include=Appointment:actor`,
  `_include:iterate=PractitionerRole:practitioner`), без дополнительных запросов; если связанного
  ресурса нет, поле отсутствует, а не подменяется.
- **No-show (6.6).** Врач определяется по `fhirUser = PractitionerRole/{id}` — ровно тот claim,
  который auth-service теперь выдаёт врачам (`apps/auth-service/src/modules/oauth/identity.ts`).
  Проверка участия идёт до проверки статуса; чужой врач → `403 COMPARTMENT_VIOLATION`, запись в
  HAPI не происходит. e2e `should mark a no-show when the participant doctor calls it` подтверждает
  работу для участника-врача с токеном нового формата. Закрыта зависимость, описанная в
  `specs/coder-m3-booking-spec.md` §2a.

## Исправления в этом прогоне

1. **Id из одних точек (`.`, `..`).** `FHIR_ID_PATTERN` пропускал `.` и `..` (R4-regex
   `[A-Za-z0-9\-.]{1,64}` их допускает). Как сегмент URL они сворачивают `Slot/{id}` в `Slot/`
   (поиск) или в базу сервера. Это достижимо через `slotId` в `POST /appointments`, `{id}` в путях
   6.3/6.4/6.6 и claim `patient`. Тот же дефект уже исправлен в patient-service
   (`coder-patient-service-report.md`). Теперь шаблон `^(?!\.+$)…`, такое же правило в
   `REFERENCE_PATTERN` (ссылка `Slot/..` не разбирается). Тесты: `fhir-reference.spec.ts`,
   `fhir-id.pipe.spec.ts` (новый), `create-appointment.dto.spec.ts`.
2. **Публикация событий без unit-тестов.** `AppointmentPublisherService` имел покрытие 36 %.
   Добавлен `appointment-publisher.service.spec.ts` (4 теста): конверт `appointment.booked.v1` /
   `appointment.cancelled.v1`, уникальный `eventId`, сбой брокера логируется и не ломает ответ
   по уже зафиксированной записи.

## Самопроверка существующего кода M3

| Пункт | Результат |
| --- | --- |
| Атомарность, `If-Match`, `409 SLOT_CONFLICT` | соответствует `coder-m3-booking-spec.md` §2 и §4 (оптимистичный CAS вместо блокировки — принятое отклонение) |
| Аудит (ADR-014) на каждой записи | есть: `auditWrite` в `book`/`cancel`/`markNoShow`; в `AuditEvent` — актор, пациент, `X-Request-Id` |
| Единый формат ошибок, коды только из `ERROR_CODES` | да; `VALIDATION_ERROR`, `NOT_FOUND`, `COMPARTMENT_VIOLATION`, `FORBIDDEN_ROLE/SCOPE`, `SLOT_CONFLICT`, `APPOINTMENT_NOT_CANCELLABLE`, `CONFLICT` |
| Валидация входа (class-validator на всех DTO) | да |
| `any`, `!`, файлы > 300 строк, TODO | не найдено; функции > 30 строк только в `describe`-блоках тестов |
| Перевод строк | файлы M3 в HEAD были с CRLF, остальной репозиторий — LF; нормализованы в LF (поэтому `git diff` по ним большой) |
| `patientRef ?? ''` в `appointment.cancelled.v1` | оставлено: для пациента-владельца ссылка гарантирована проверкой владения; для `ADMIN` и записи без Patient-участника значение пустое. Бронирование всегда создаёт участника Patient, поэтому на практике недостижимо |

## Отклонения от спецификации и принятые решения

- `AppointmentResponseDto.cancelReason` из `Appointment.cancelationReason.text`: в R4 поле
  называется `cancelationReason` (`statusReason` появился в R5). Это уже зафиксировано в
  `coder-m3-booking-spec.md`.
- Идентификаторы слота/услуги валидируются как FHIR `id`, а не `@IsUUID()`: catalog-service
  выдаёт слоту id из 64 hex-символов, HAPI — числовые id (отклонение уже есть в M3).
- Даты `from`/`to` без времени передаются в HAPI как есть. HAPI трактует их в часовом поясе
  сервера (UTC), а клиника работает по Минску (UTC+3). Для приёмов в рабочие часы это не меняет
  результат; записи с `start` между 00:00 и 03:00 по Минску у границы суток могут попасть в
  соседний день. Клиенту безопаснее передавать `date-time` с зоной.
- Нет `@nestjs/swagger` и pino в зависимостях (проверено в `package.json`), поэтому, как и в
  шаблонных сервисах, Swagger-декораторов и pino-логгера нет; используется `Logger` NestJS.

## Расхождения с frontend (frontend/ не менялся)

1. `frontend/src/app/(patient)/appointments/page.tsx` вызывает `GET /api/v1/me/appointments`, а
   `appointment-detail-view.tsx` — `GET /api/v1/me/appointments/{id}`. Спецификация и Traefik
   (`infra/traefik/dynamic.yml`) используют `/api/v1/appointments` и `/api/v1/appointments/{id}`.
   Реализовано по спецификации; фронту нужно перейти на пути §6.2/§6.3.
2. `frontend/src/app/(doctor)/doctor/appointments/page.tsx` вызывает
   `GET /api/v1/doctor/appointments?date=YYYY-MM-DD` и читает элементы `{ id, time, patientName, status }`.
   Спецификация задаёт `from`/`to`, а элемент — `AppointmentViewDto` (`start` вместо `time`).
   `date` в whitelist-DTO не объявлен и молча отбрасывается, поэтому до правки фронта журнал врача
   вернёт все записи, а не записи дня, и без `time`. Для дня достаточно `from=to=YYYY-MM-DD`,
   `time` строится из `start`.
3. Карточка записи (`appointment-card.tsx`) читает `doctorName`/`serviceName` — поля есть в
   `AppointmentViewDto` (6.2, 6.3). Ответы 6.1/6.4/6.6 их не содержат (`AppointmentResponseDto`),
   фронт использует из них только `id`.

## Проверки (реальные результаты)

| Проверка | Команда | Результат |
| --- | --- | --- |
| unit | `npx nx test appointment-service --maxWorkers=2 --skip-nx-cache` | `Test Suites: 17 passed, 17 total` · `Tests: 138 passed, 138 total` |
| lint | `npx nx lint appointment-service` | `✔ All files pass linting` · `Successfully ran target lint` |
| typecheck | `npx tsc --noEmit -p apps/appointment-service/tsconfig.app.json` | без ошибок (exit 0) |
| build | `npx nx build appointment-service --skip-nx-cache` | `Successfully ran target build for project appointment-service and 6 tasks it depends on` |
| e2e | `npx nx e2e appointment-service --skip-nx-cache` | `Test Suites: 4 passed, 4 total` · `Tests: 25 passed, 25 total` |

- Покрытие unit, измеренное до правок этого прогона: 96 % строк по сервису, слабое место —
  `appointment-publisher.service.ts` (36 %); для него добавлены тесты. После правок покрытие
  повторно не снималось.
- e2e: `jwt-perimeter`, `appointment-reads` и `appointment-writes-access` идут с фальшивым HAPI.
  `booking-concurrency` поднимает настоящий HAPI в Testcontainers (нужен Docker): гонка за слот
  (один 201, один 409 `SLOT_CONFLICT`) и чтение 6.2/6.3/6.5 с именами через `_include` проверены на
  реальном сервере, включая `403` для чужого врача.
- Первый запуск `nx build` упал на `messaging:build` (`Cannot find module '@medcenter/contracts'`):
  параллельные агенты одновременно собирали общий `dist/`. Повтор прошёл. Файлы `libs/*` не менялись.

## Файлы

Изменено/добавлено в `apps/appointment-service/**` (часть — из прерванного прогона):

- чтение: `appointment-queries.service.ts`, `appointment-view.mapper.ts`, `doctor-appointments.controller.ts`,
  `dto/appointment-view.dto.ts`, `dto/page-query.dto.ts`, `dto/list-appointments-query.dto.ts`,
  `dto/list-doctor-appointments-query.dto.ts`, `fhir-id.pipe.ts`, `scope-policy.ts`
- правки: `appointments.controller.ts`, `appointments.service.ts`, `appointments.module.ts`,
  `compartment.ts`, `audit.ts`, `fhir-reference.ts` (в этом прогоне), `fhir-transaction.ts`,
  `app.module.ts`, `main.ts`, `idempotency/redis-idempotency.store.ts`
- `health/` (controller, module, spec)
- тесты: `appointment-queries.service.spec.ts`, `appointment-view.mapper.spec.ts`, `compartment.spec.ts`,
  `scope-policy.spec.ts`, `audit.spec.ts`, `appointments-audit.spec.ts`, `fhir-transaction.spec.ts`,
  `appointment-resource.spec.ts`, `fhir-reference.spec.ts`, `fhir-id.pipe.spec.ts` (новый),
  `events/appointment-publisher.service.spec.ts` (новый), `dto/*.spec.ts`, `idempotency/*.spec.ts`
- e2e: `test/app-harness.ts`, `test/test-tokens.ts`, `test/appointment-reads.e2e-spec.ts`,
  `test/appointment-writes-access.e2e-spec.ts`, `test/booking-concurrency.e2e-spec.ts`,
  `test/jwt-perimeter.e2e-spec.ts`

Общие файлы (`libs/*`, `package.json`, `infra/*`, `specs/*`, `frontend/*`) не менялись.

## Остаётся

- Правка frontend под пути и форму ответа (см. «Расхождения с frontend»).
- Transactional outbox для `appointment.*.v1` (отклонение M3 №3).
- `specs/coder-m3-booking-spec.md` §2a и §4 п. 6 устарели (6.2/6.3/6.5 реализованы, `fhirUser` выдаётся);
  `specs/*` не мои — обновить при следующей ревизии спецификации.
