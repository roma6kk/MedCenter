# Web-приложение «Медицинский центр» — Design

**TASK-001** · Автор: brainstorming · Дата: 2026-10-04 · Фаза: understanding (→ planning)

**Источники и связи:**

- Требования: `tasks/TASK-001/requirements-analyst-requirements.md` (21 FR, 11 NFR, 9 BR)
- Задание: `list_zadanija_ananyev_clinica.docx` (БГТУ, ФИТ, каф. ПИ; гр. 7; Ананьев Р.В.)
- Политика: `AGENTS.md` (Belarusian clinic → HL7 FHIR International R4 only)
- Терминология: `fhir.by#1.4.463` (canonical `https://fhir.by/ImplementationGuide/fhir.by`)

## Problem Statement

Клинике нужно web-приложение с ролями **Пациент / Врач / Администратор** для записи на приём
и ведения клинической документации. Система должна быть **микросервисной** (TypeScript, Node.js,
NestJS; клиент React + Next.js; контейнеризация), соответствовать **HL7 FHIR R4** и опираться на
национальную терминологию **ЦИСЗ** (МКБ-10 МЗ РБ, НСИ ЦИСЗ, АТХ, UCUM). Дополнительно (НИР/ПЗ):
draw.io-схемы (UML use-case, логическая схема БД, структурная схема) и `CapabilityStatement`.

## Proposed Solution

Собственный код полностью на **TypeScript / NestJS / Next.js**. Клинические данные хранит
**off-the-shelf HAPI FHIR JPA (R4)** как отдельный контейнер; 8 NestJS-сервисов — это **BFF-слой**
(бизнес-логика, маппинг, доступ к FHIR через `fhir-kit-client`). Сервисы взаимодействуют
**синхронно (FHIR REST)** и **асинхронно (RabbitMQ, доменные события)**. Национальная терминология
поставляется **локальным R4-seed'ом** с сохранением canonical URL `https://fhir.by/...`.
Единая точка входа — **API Gateway** (NestJS). Хранилища: **PostgreSQL** (HAPI + auth + read-models),
**Redis** (кэш/rate-limit/SMART-denylist), **RabbitMQ** (события). MongoDB **не используем**.

## Ключевые решения дизайна (Design Decisions)

| ID | Решение                                                                                                                               | Обоснование                                                                                                                         | Связь              |
| -- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| D1 | HAPI FHIR JPA (**Java**) как off-the-shelf клинический движок; весь собственный код — TS/NestJS | Реальная FHIR R4-совместимость, FHIR-поиск,`CapabilityStatement`, валидация                               | KDR-1                   |
| D2 | **Локальный R4-seed** терминологии (МКБ-10, АТХ, ключевые НСИ) с URL `https://fhir.by/...`    | Автономность, нет зависимости от закрытого контура;`fhir.by` = R5, а мы фиксируем R4 | KDR-3, A-1, R-1/R-2/R-4 |
| D3 | `@node-oauth/oauth2-server` + собственные NestJS-guards для SMART-scopes и PKCE                                             | Проверенный OAuth2-движок + контроль над SMART-профилем                                                    | KDR-2                   |
| D4 | `fhir-kit-client` как FHIR-клиент NestJS-сервисов                                                                         | Готовый Node FHIR-клиент (search/read/create), меньше boilerplate                                                           | KDR-1                   |
| D5 | **RabbitMQ** + `@nestjs/microservices` (AMQP) для доменных событий                                                 | Идиоматично для микросервисов; надёжная доставка событий уведомлений              | KDR-9, FR-008           |
| D6 | **TanStack Query** (серверные данные) + **Zustand** (клиентское состояние)                     | Кэш/инвалидация серверных данных + лёгкий UI-state                                                          | NFR-008                 |
| D7 | **Tailwind CSS + shadcn/ui + react-hook-form + zod**                                                                                   | Современный, доступный, гибкий UI; типизированные формы                                           | NFR-008                 |
| D8 | Хранилища:**PostgreSQL + Redis + RabbitMQ**, без MongoDB; `jsonb` при необходимости                      | HAPI JPA требует реляционную БД; доп. хранилище не оправдано (YAGNI)                                | NFR-009                 |
| D9 | **API Gateway** (NestJS) — единая точка входа, TLS, JWT, rate-limit, CORS, логи                                   | Упрощает клиент и безопасность микросервисов                                                           | NFR-006/007             |

**Предустановлено (из требований/тулинга, без обсуждения):** Nx-monorepo; `class-validator` для
NestJS DTO; PostgreSQL + TypeORM для auth-хранилища; Jest/Testcontainers/Playwright; Docker Compose.

## Architecture

### Слои (tiers)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ CLIENT    Next.js (App Router) · TanStack Query · Zustand · shadcn/ui       │
│           SMART-PKCE клиент · i18n ru-BY (next-intl)                        │
├──────────────────────────────────────────────────────────────────────────┤
│ EDGE      API Gateway (NestJS) — единая точка входа                         │
│           TLS · JWT-проверка · маршрутизация · rate-limit(Redis) · CORS     │
│           request-id · структурные логи                                     │
├──────────────────────────────────────────────────────────────────────────┤
│ SERVICE   auth · patient · practitioner · catalog · appointment ·          │
│ (NestJS)  encounter · notification · analytics                              │
│           каждый: Controller → Service → Mapper/Repository (layered)        │
├──────────────────────────────────────────────────────────────────────────┤
│ INTEGRATION  RabbitMQ (доменные события) · Redis (кэш/лимиты/denylist)      │
├──────────────────────────────────────────────────────────────────────────┤
│ DATA      HAPI FHIR JPA (R4) + PostgreSQL  ← клинические ресурсы,           │
│           терминология (fhir.by URL), AuditEvent                            │
│           PostgreSQL (auth-схема, TypeORM) ← users/roles/oauth              │
└──────────────────────────────────────────────────────────────────────────┘
```

**Свойства:** BFF-сервисы **stateless** (вся клиническая истина в HAPI); собственная реляционная БД
только у `auth-service`; уведомления не хранят отдельную БД (FHIR `Communication`); каждый сервис
собирается в отдельный Docker-образ (NFR-001).

### Микросервисы

| Сервис             | Назначение                                                                 | FHIR-ресурсы                                                                                                            | Технология                 |
| ------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `api-gateway`          | Единая точка входа, TLS, JWT, маршрутизация, rate-limit | —                                                                                                                             | NestJS                               |
| `auth-service`         | SMART on FHIR authorization server, RBAC, пользователи                   | связи с`Patient`/`Practitioner`                                                                                      | NestJS + PG/TypeORM                  |
| `patient-service`      | Пациенты                                                                     | `Patient`, `RelatedPerson`                                                                                                 | `fhir-kit-client` → HAPI          |
| `practitioner-service` | Врачи, организация, кабинеты                                 | `Practitioner`, `PractitionerRole`, `Organization`, `Location`                                                         | `fhir-kit-client`                  |
| `catalog-service`      | Услуги, расписание, слоты                                       | `HealthcareService`, `Schedule`, `Slot`                                                                                  | `fhir-kit-client`                  |
| `appointment-service`  | Запись на приём                                                         | `Appointment`, `AppointmentResponse`                                                                                       | `fhir-kit-client`                  |
| `encounter-service`    | Клинические данные                                                  | `Encounter`, `ClinicalImpression`, `Condition`, `CarePlan`, `ServiceRequest`, `MedicationRequest`, `Observation` | `fhir-kit-client`                  |
| `notification-service` | Уведомления                                                               | `Communication`                                                                                                              | AMQP consumer                        |
| `analytics-service`    | Отчёты/аналитика                                                      | `Measure`, `MeasureReport` (read-models)                                                                                   | NestJS + HAPI                        |
| `fhir-server`          | Хранилище клинических ресурсов                           | все ресурсы FHIR R4                                                                                                  | **HAPI FHIR JPA** + PostgreSQL |

> **Почему Java-HAPI приемлем при требовании TS/NestJS:** HAPI — готовый внешний движок
> (не «разработка»), обеспечивающий FHIR R4, поиск и `CapabilityStatement` (NFR-003). Весь
> собственный код — TypeScript. Альтернатива («чистый TS FHIR-фасад») означала бы писать FHIR-поиск
> и валидацию самостоятельно — против YAGNI.

## Е2Е-потоки (End-to-End)

### Предусловие: seeding данных

Администратор через `practitioner-service`/`catalog-service` создаёт `Organization` (single-tenant),
`Practitioner` + `PractitionerRole`, `HealthcareService`, `Location`, `Schedule`; по `Schedule`
генерируются `Slot` (`status=free`). Терминология (МКБ-10, АТХ, НСИ) загружается локальным seed'ом.

### Поток №1 — «Пациент записывается на приём»

1. **Аутентификация (SMART PKCE):** Next.js → `GET /oauth/authorize` (`client_id`, `redirect_uri`,
   `scope=patient/*.read patient/*.write`, `code_challenge`) → `auth-service` логин → `code` →
   `POST /oauth/token` (`code_verifier`) → access-token (**JWT** со scope + `patient`-контекст).
   Gateway проверяет токен на каждом вызове (JWKS/подпись).
2. **Каталог услуг:** `GET /api/v1/services` → gateway → `catalog-service` → HAPI
   `HealthcareService?active=true` (кэш Redis, TTL).
3. **Врачи:** `GET /api/v1/doctors?service=X` → `practitioner-service` → HAPI
   `PractitionerRole?service=X&active=true` + `Practitioner`/`Location`.
4. **Свободные слоты:** `GET /api/v1/doctors/{id}/slots?from=&to=` → `catalog-service` → HAPI
   `Slot?schedule=…&status=free&start=ge…&start=le…` (кэш Redis).
5. **Запись:** `POST /api/v1/appointments {slotId, serviceId, reason?}` → `appointment-service`:
   - перечитать `Slot`; если не `free` → **409 Conflict** (гонка);
   - создать `Appointment` (`status=booked`, participants=Patient+PractitionerRole, `slot`,
     `serviceType`);
   - `Slot` → `status=busy`;
   - опубликовать событие **`appointment.booked`** в RabbitMQ;
   - записать `AuditEvent` (create);
   - вернуть DTO.
6. **Уведомление:** `notification-service` потребляет `appointment.booked` → создаёт `Communication`
   (recipient=Patient, sender=Organization) → in-app (`GET /api/v1/notifications`) + email-адаптер.
7. **Просмотр:** `GET /api/v1/appointments` (только свои — Patient compartment) → HAPI
   `Appointment?patient=Patient/x&_sort=-date`.

### Поток №2 — «Врач завершает приём»

1. Вход врача (scope `user/*.write`, контекст `PractitionerRole`).
2. `GET /api/v1/doctor/schedule` → `catalog-service`/`appointment-service` → HAPI `Slot`/`Appointment`
   по `PractitionerRole`.
3. **История:** `encounter-service` → HAPI `Encounter?patient=&_sort=-date`, `Condition?patient=`,
   `Observation?patient=`.
4. **Оформление приёма:** `Encounter.status=finished` + `ClinicalImpression` (summary/note) +
   `Condition` (`category=encounter-diagnosis`, `code`=МКБ-10) + `CarePlan` (рекомендации) +
   `ServiceRequest`/`MedicationRequest`/`Procedure` (назначения) + `Observation` (витальные, UCUM).
5. Событие **`encounter.completed`** → `notification-service` → `Communication` пациенту
   («результаты/назначения доступны»).
6. `AuditEvent` (create/update) на каждую запись.

**Обработка ошибок в потоке:** gateway → 401/403 (токен/scope); нет ресурса → 404 `OperationOutcome`;
гонка по слоту → 409 (Problem Details); ошибка валидации FHIR → 422 `OperationOutcome`;
прочее → 500 + лог `pino` с `request-id`.

## Data Model

### Клинические данные — FHIR R4 (в HAPI)

| Область                          | Ресурсы                                                         | Примечание                                               |
| --------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Субъекты                        | `Patient`, `RelatedPerson`                                         | пациент + доверенные лица                     |
| Персонал/организация | `Practitioner`, `PractitionerRole`, `Organization`, `Location` | `Location.physicalType=room` (кабинеты)                  |
| Каталог/расписание     | `HealthcareService`, `Schedule`, `Slot`                          | `Slot.status` = free/busy                                        |
| Записи                            | `Appointment`, `AppointmentResponse`                               | `status`: proposed → booked → cancelled; ссылка `slot` |
| Приём                              | `Encounter`, `ClinicalImpression`                                  | `Encounter.status=finished`                                      |
| Диагноз/план                 | `Condition`, `CarePlan`                                            | `Condition.category=encounter-diagnosis`                         |
| Назначения                    | `ServiceRequest`, `MedicationRequest`, `Procedure`               | лечение/процедуры                                  |
| Наблюдения                    | `Observation`                                                        | витальные,`valueQuantity` в UCUM                       |
| Коммуникации                | `Communication`                                                      | уведомления пациенту                            |
| Аудит                              | `AuditEvent`                                                         | create/update/delete                                               |
| Аналитика                      | `Measure`, `MeasureReport`                                         | агрегаты (read-models)                                     |

### Auth-хранилище — PostgreSQL (TypeORM, схема `auth`)

| Entity           | Ключевые поля                                                  | Связи                              |
| ---------------- | -------------------------------------------------------------------------- | --------------------------------------- |
| `User`         | id, email (unique), passwordHash, isActive, createdAt                      | 1—N`UserRole`, 1—1 `ExternalLink` |
| `Role`         | id, code (`PATIENT`/`DOCTOR`/`ADMIN`), name                          | N—N`User`                            |
| `UserRole`     | userId, roleId                                                             | join                                    |
| `ExternalLink` | userId, fhirResourceType (`Patient`/`Practitioner`), fhirResourceId    | → FHIR-ресурс в HAPI            |
| `OAuthClient`  | id, clientId, redirectUris, isPublic(public PKCE)                          | —                                      |
| `OAuthToken`   | id, userId, clientId, accessTokenHash, refreshTokenHash, scopes, expiresAt | —                                      |

OAuth2-сервер (`@node-oauth/oauth2-server`) использует эти таблицы как model/adapter; JWT подписываются
`auth-service`, публичный ключ — через `/.well-known/jwks.json` (gateway/сервисы проверяют подпись).

### Терминология (локальный R4 seed)

| Домен                        | Система                    | canonical URL                                          | Поле FHIR                                       |
| --------------------------------- | --------------------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| Диагнозы                  | МКБ-10 (адапт. МЗ РБ) | `https://fhir.by/ValueSet/InternClassificDiseases10` | `Condition.code`                                  |
| Услуги/процедуры   | НСИ ЦИСЗ                   | `https://fhir.by/ValueSet/…`                        | `HealthcareService.type`, `ServiceRequest.code` |
| Лекарства                | АТХ (ATC) + НСИ ЦИСЗ    | WHO /`https://fhir.by/ValueSet/…`                   | `MedicationRequest.medication`                    |
| Единицы измерения | UCUM                              | `http://unitsofmeasure.org`                          | `Observation.valueQuantity`, `Dosage`           |
| Административные  | Core ValueSets FHIR R4            | `http://hl7.org/fhir/…`                             | `status`, `gender`, `Encounter.class`         |

Seed-скрипт импортирует нужные `CodeSystem`/`ValueSet` в HAPI как **R4**-ресурсы, сохраняя
canonical URL `https://fhir.by/...` (автономно, без доступа в закрытый контур). SNOMED CT/LOINC —
вне объёма (лицензии), задел через `ConceptMap`.

## API Design

### FHIR REST (HAPI `fhir-server`)

- Базовый путь `/fhir`; поддерживаются read / search / create / update / delete, при необходимости
  `$validate` и операторные запросы.
- `GET /fhir/metadata` → `CapabilityStatement` (демонстрирует NFR-003).
- Примеры поиска: `Appointment?patient=…`, `Slot?schedule=…&status=free&start=ge…`,
  `Condition?patient=…&code=…`, `Encounter?patient=…&_sort=-date`.
- Формат обмена: `application/fhir+json`.

### BFF REST (NestJS-сервисы, публикуются через gateway под `/api/v1`)

| Метод и путь                | Сервис        | Назначение                                 | Доступ           |
| ------------------------------------- | ------------------- | ---------------------------------------------------- | ---------------------- |
| `GET /services`                     | catalog             | услуги                                         | patient/*.read, public |
| `GET /doctors?service=`             | practitioner        | врачи                                           | patient/*.read         |
| `GET /doctors/{id}/slots?from=&to=` | catalog             | свободные слоты                        | patient/*.read         |
| `POST /appointments`                | appointment         | создать запись                          | patient/*.write        |
| `GET /appointments`                 | appointment         | свои записи/история                 | patient/*.read         |
| `PATCH /appointments/{id}` (cancel) | appointment         | отмена (`status=cancelled`+`statusReason`) | patient/*.write        |
| `GET /notifications`                | notification        | in-app уведомления                        | patient/*.read         |
| `GET /doctor/schedule`              | catalog/appointment | расписание врача                      | user/*.read            |
| `GET /patients/{id}/history`        | encounter           | история обращений                    | user/*.read            |
| `POST /encounters/{id}/complete`    | encounter           | приём: диагноз/назначения      | user/*.write           |
| `GET/POST/PUT/DELETE /admin/users`  | auth                | управление пользователями    | ADMIN                  |
| `CRUD /admin/services`              | catalog             | услуги                                         | ADMIN                  |
| `CRUD /admin/rooms`                 | practitioner        | кабинеты (`Location`)                      | ADMIN                  |
| `CRUD /admin/schedules`             | catalog             | расписания + генерация`Slot`    | ADMIN                  |
| `GET /admin/analytics/…`           | analytics           | отчёты (`MeasureReport`)                     | ADMIN                  |
| `GET /admin/audit`                  | analytics/auth      | журнал (`AuditEvent`)                        | ADMIN                  |

### SMART / OAuth2 (`auth-service`)

- `GET /.well-known/smart-configuration` — SMART discovery (endpoints + supported scopes).
- `GET /oauth/authorize` — authorization code + **PKCE**.
- `POST /oauth/token`, `POST /oauth/token/revoke`.
- `GET /.well-known/jwks.json` — публичный ключ для проверки JWT (gateway + сервисы).
- Scopes: `patient/*.read`, `patient/*.write`, `user/*.read`, `user/*.write`, `launch`.
- Примечание: по SMART discovery штатно публикуется на базовом URL FHIR-сервера; gateway может
  проксировать `/.well-known/smart-configuration` на `auth-service`, указывая `fhir_base` HAPI.

### Форматы ошибок

- **FHIR-эндпоинты (HAPI)** → `OperationOutcome` (`issue.severity`, `issue.code`, `diagnostics`).
- **BFF REST** → **RFC 7807 Problem Details** (`type`, `title`, `status`, `detail`, `instance`) +
  `request-id`.

## Error Handling

- Границы (gateway / контроллеры): глобальные фильтры NestJS переводят доменные исключения в ответы.
  - FHIR-эндпоинты → `OperationOutcome`.
  - BFF REST → **RFC 7807** Problem Details.
- Доменные исключения: `NotFoundException` (404), `ConflictException` (409 — гонка слотов),
  `ForbiddenException` (403 — scope/RBAC/compartment), `BadRequestException`/`UnprocessableEntityException`
  (400/422 — валидация `class-validator`).
- **Идемпотентность:** создание записи проверяет `Slot.status=free` в транзакции (повторное чтение /
  пессимистичная блокировка) → исключает двойное бронирование.
- Внутренний код: ошибки **не глотаются** (без пустых `catch`), логируются с контекстом (операция,
  вход, `request-id`) через `pino`; клиенту — без внутренних деталей.
- Асинхронность: при падении consumer'а `notification-service` сообщение RabbitMQ переотправляется
  (retry + **DLQ**).

## Testing Strategy

| Уровень | Инструмент       | Что проверяем                                                                 |
| -------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| Unit           | Jest                       | сервисы, мапперы (домен ↔ FHIR), валидация DTO               |
| Integration    | Jest + Testcontainers      | REST/FHIR-эндпоинты, интеграция с HAPI, БД/Redis/RabbitMQ           |
| E2E            | Playwright                 | «запись → приём → диагноз → назначение»                  |
| Contract       | валидация FHIR R4 | соответствие ресурсов профилям/ValueSet (в т.ч. МКБ-10) |
| Security       | scopes/RBAC-тесты     | изоляция по ролям и Patient-компартменту                      |

Дополнительно: тесты биндинга терминологии (МКБ-10/НСИ/АТХ/UCUM); smoke-тест `CapabilityStatement`.

## Security Considerations

- **Транспорт:** TLS на gateway; внутреннее взаимодействие — в приватной сети Docker.
- **Аутентификация:** SMART on FHIR (OAuth2 + PKCE), JWT с коротким TTL + refresh-rotation.
- **Авторизация:** SMART-scopes + RBAC-guards (`PATIENT`/`DOCTOR`/`ADMIN`).
- **Компартмент пациента:** пациент видит только свои ресурсы (проверка владения на уровне сервиса).
- **Аудит:** `AuditEvent` на create/update/delete (FR-021).
- **OWASP Top-10:** валидация входа (`class-validator`), параметризованные запросы, секреты только в
  env, rate-limit на gateway, корректные CORS и заголовки безопасности.
- **Секреты:** только через env/секрет-стор; `.env` не коммитим (политика AGENTS.md).

## Frontend (React + Next.js)

- **Роутинг (App Router):** публичная зона (каталог, вход) — SSR где полезно; авторизованная зона —
  CSR с TanStack Query.
- **Страницы:**
  - `(auth)/login`, `(auth)/register`
  - `(patient)/doctors`, `(patient)/booking`, `(patient)/appointments`, `(patient)/appointments/[id]`,
    `(patient)/prescriptions`, `(patient)/notifications`
  - `(doctor)/schedule`, `(doctor)/patients/[id]`, `(doctor)/encounter/[id]`
  - `(admin)/users`, `(admin)/services`, `(admin)/rooms`, `(admin)/schedules`, `(admin)/analytics`,
    `(admin)/audit`
- **Состояние:** TanStack Query (серверные данные, кэш, инвалидация после мутаций) + Zustand
  (сессия/токен-контекст, UI-флаги). Формы: react-hook-form + zod. UI: shadcn/ui + Tailwind.
- **API-клиент:** типизированная обёртка над fetch к `/api/v1`, авто-подстановка Bearer-токена,
  обработка 401 → refresh / redirect на login.
- **i18n:** `next-intl`, локаль по умолчанию `ru-BY` (задел на `en`).
- **Доступность:** семантика/ARIA из Radix, управление фокусом, контраст (задел на WCAG).

## Deployment & Tooling

- **Монорепозиторий:** Nx (`apps/*`, `libs/*`); общие типы/DTO/FHIR-мапперы в `libs/`.
- **Контейнеризация:** `Dockerfile` на сервис; `docker-compose.yml`: `api-gateway`, 8 сервисов,
  `hapi-fhir`, `postgres`, `redis`, `rabbitmq` (NFR-001 — ≥6 контейнеров).
- **Конфигурация:** `@nestjs/config` + валидация схемы (zod/joi); секреты — env.
- **Наблюдаемость (NFR-007):** `@nestjs/terminus` (health/readiness), `nestjs-pino` (структурные логи
  с `request-id`), `prom-client` (метрики).
- **CI (GitHub Actions):** lint → tsc → test → build → (docker build).
- **Артефакты ПЗ:** draw.io (UML use-case, логическая схема БД, структурная схема), `CapabilityStatement`,
  руководство пользователя, листинги.

## Open Questions

- **A-2…A-9** (из требований) — принятые допущения: single-tenant `Organization`; уведомления in-app+email;
  Docker Compose; платежи вне объёма; саморегистрация пациента; auth-пользователей создаёт админ;
  интеграция = FHIR REST + события; UI `ru-BY`; «системные настройки» = конфигурация + терминология.
- **R-3** — нужны ли «реальные» маршруты расписания врача/пациента — **уточнить у заказчика**.
- Требуют подтверждения владельцем продукта: **D9** (API Gateway) и **D1** (Java-HAPI при требовании
  стека TS/NestJS).

## Next Steps (Suggested)

**Next by flow:** [[/writing-plans]] `TASK-001` — детализировать реализацию на основе этого дизайна.

**Alternatives:**

- [[/architect]] `TASK-001` — зафиксировать архитектуру в `specs/architect-architecture.md`.
- [[/api-designer]] `TASK-001` — детализировать REST/FHIR API и схемы.
