# Architecture Specification

> Living specification. Entry point — [`MANIFEST.md`](MANIFEST.md). Sections are appended per task
> with the `### [TASK-N] ...` prefix. Structure template — `../spec-desc.md`.

---

### [TASK-001] Медицинский центр — Hybrid FHIR Architecture (2026-10-04)

**Источники:** `tasks/TASK-001/requirements-analyst-requirements.md` (21 FR, 11 NFR, 9 BR, 10 KDR),
`tasks/TASK-001/brainstorming-design.md` (решения D1–D9), `AGENTS.md`, `.clinerules/GOLDEN-PRINCIPLES.md`.
**Итог:** гибрид off-the-shelf **HAPI FHIR JPA (R4)** как клинический движок/хранилище + **8 NestJS BFF-сервисов**
за **reverse-proxy (Traefik)**; обмен — синхронный FHIR REST и асинхронные доменные события RabbitMQ.
Открытые гейты D1, D9 и риски R-1…R-4 разрешены владельцем продукта и заказчиком — см.
`### [TASK-001] Разрешение открытых гейтов (2026-10-04)`.

#### 1. Компонентная и слойная модель

| Слой | Компоненты | Ответственность |
| --- | --- | --- |
| **CLIENT** | Next.js (App Router), TanStack Query, Zustand, shadcn/ui, SMART-PKCE клиент, next-intl (`ru-BY`) | UI, сессии, кэш серверных данных |
| **EDGE** | `traefik` (reverse-proxy, Docker Compose, не NestJS-сервис) | TLS-терминация, маршрутизация `/api/v1` → сервисы, CORS/security-заголовки, `request-id`; rate-limit на уровне сервисов (ADR-009) |
| **SERVICE** | `auth`, `patient`, `practitioner`, `catalog`, `appointment`, `encounter`, `notification`, `analytics` | Бизнес-логика, маппинг домен↔FHIR, доступ к HAPI |
| **INTEGRATION** | RabbitMQ (события), Redis (кэш / лимиты / denylist) | Асинхронная доставка, общее состояние |
| **DATA** | HAPI FHIR JPA (R4) + PostgreSQL; PostgreSQL схема `auth` (TypeORM); read-models аналитики | Клиническая истина, пользователи/OAuth, агрегаты |

Свойства: BFF-сервисы **stateless** (истина в HAPI — ADR-011); отдельная реляционная БД только у
`auth-service` и у read-model аналитики; уведомления не имеют своей БД (FHIR `Communication`);
каждый сервис — отдельный Docker-образ (NFR-001).

#### 2. Размещение модулей (Nx-монорепозиторий)

```
apps/
  auth-service/           # SMART authorization server + RBAC + users (PG/TypeORM)
  patient-service/        # Patient, RelatedPerson
  practitioner-service/   # Practitioner, PractitionerRole, Organization, Location
  catalog-service/        # HealthcareService, Schedule, Slot
  appointment-service/    # Appointment, AppointmentResponse
  encounter-service/      # Encounter, ClinicalImpression, Condition, CarePlan,
                          # ServiceRequest, MedicationRequest, Procedure, Observation
  notification-service/   # Communication (AMQP consumer)
  analytics-service/      # Measure, MeasureReport (read-models)
  web/                    # Next.js client
libs/
  contracts/              # DTO-интерфейсы API + типы событий (shared client/server)
  fhir/                   # провайдер fhir-kit-client + TS-типы ресурсов R4
  fhir-mappers/           # XToFhirMapper / FhirToXMapper (домен ↔ FHIR)
  terminology/            # canonical-константы https://fhir.by/... + хелперы ValueSet
  common/                 # exception filters, interceptors, guards, decorators, pino-конфиг
  config/                 # @nestjs/config + zod-схема (секреты через env)
infra/
  traefik/                # EDGE: reverse-proxy (TLS, маршрутизация) — НЕ NestJS-приложение
```

Правило: доменная логика — в `apps/<service>/src/modules/<module>/`; переиспользуемое —
в `libs/*`; интеграции с внешними системами — в `libs/fhir` и `libs/terminology`. Вход в систему —
Traefik; отдельного NestJS-gateway нет (ADR-009), поэтому **каждый BFF-сервис обязан подключить
общий guard-слой из `libs/common`** (проверка JWT по JWKS, scopes, RBAC, rate-limit) — иначе
периметр безопасности ослабляется.

#### 3. Внутренняя структура сервиса (единый шаблон)

```
apps/<service>/src/
  main.ts                 # bootstrap, глобальные фильтры/пайпы, pino
  app.module.ts
  modules/<module>/
    <module>.module.ts
    <module>.controller.ts     # Presentation: HTTP/DTO-валидация
    <module>.service.ts        # Business logic (BR-*)
    <module>.repository.ts     # Data access (только auth/analytics)
    dto/                       # create-<x>.dto.ts, update-<x>.dto.ts
    mappers/                   # домен ↔ FHIR (где применимо)
    entities/                  # TypeORM entities (только auth/analytics)
```


#### 4. Контракты интерфейсов

**4.1 FHIR REST (`fhir-server`, HAPI)** — базовый путь `/fhir`, формат `application/fhir+json`,
read/search/create/update/delete, при необходимости `$validate`.

| Операция | Пример |
| --- | --- |
| CapabilityStatement | `GET /fhir/metadata` (NFR-003) |
| Поиск слотов | `Slot?schedule=…&status=free&start=ge…&start=le…` |
| Записи пациента | `Appointment?patient=Patient/x&_sort=-date` |
| История | `Encounter?patient=…&_sort=-date`, `Condition?patient=…`, `Observation?patient=…` |
| Валидация | `POST /fhir/Condition/$validate` |

**4.2 BFF REST (единый вход через Traefik, `/api/v1`)** — каждый сервис сам проверяет JWT по JWKS,
SMART-scopes и RBAC общим guard-слоем (`libs/common`); Traefik маршрутизирует `/api/v1/*` на сервис
по правилам `docker-compose`/labels, не разбирая токены.

| Метод и путь | Сервис | Назначение | Доступ |
| --- | --- | --- | --- |
| `GET /services` | catalog | услуги | `patient/*.read`, public |
| `GET /doctors?service=` | practitioner | врачи | `patient/*.read` |
| `GET /doctors/{id}/slots?from=&to=` | catalog | свободные слоты | `patient/*.read` |
| `POST /appointments` | appointment | создать запись | `patient/*.write` |
| `GET /appointments` | appointment | свои записи | `patient/*.read` (компартмент) |
| `PATCH /appointments/{id}` | appointment | отмена (`cancelled`+`statusReason`) | `patient/*.write` |
| `GET /notifications` | notification | in-app уведомления | `patient/*.read` |
| `GET /doctor/schedule` | catalog/appointment | расписание врача | `user/*.read` |
| `GET /patients/{id}/history` | encounter | история обращений | `user/*.read` |
| `POST /encounters/{id}/complete` | encounter | приём: диагноз/назначения | `user/*.write` |
| `CRUD /admin/users` | auth | пользователи | `ADMIN` |
| `CRUD /admin/services` | catalog | услуги (`HealthcareService`) | `ADMIN` |
| `CRUD /admin/rooms` | practitioner | кабинеты (`Location`) | `ADMIN` |
| `CRUD /admin/schedules` | catalog | расписания + генерация `Slot` | `ADMIN` |
| `GET /admin/analytics/…` | analytics | отчёты (`MeasureReport`) | `ADMIN` |
| `GET /admin/audit` | analytics/auth | журнал (`AuditEvent`) | `ADMIN` |

**4.3 SMART / OAuth2 (`auth-service`)**

| Endpoint | Назначение |
| --- | --- |
| `GET /.well-known/smart-configuration` | SMART discovery (endpoints + scopes; Traefik маршрутизирует на `auth-service`; в `fhir_base` указывается HAPI) |
| `GET /oauth/authorize` | Authorization Code + **PKCE** |
| `POST /oauth/token`, `POST /oauth/token/revoke` | Выдача/отзыв токенов (refresh-rotation) |
| `GET /.well-known/jwks.json` | Публичный ключ для проверки JWT (каждый BFF-сервис через `libs/common`) |

**4.4 Каталог доменных событий (RabbitMQ)** — topic exchange `medical.events`; ключ маршрутизации
`<entity>.<action>`; версия в payload (`v`); очереди с DLQ `<queue>.dlq`.

| Событие | Издатель | Потребители | Ключевые поля payload |
| --- | --- | --- | --- |
| `appointment.booked.v1` | appointment-service | notification-service | `appointmentId`, `patientRef`, `practitionerRoleRef`, `slotRef`, `start`, `serviceId` |
| `appointment.cancelled.v1` | appointment-service | notification-service | `appointmentId`, `patientRef`, `reason`, `actorType` |
| `encounter.completed.v1` | encounter-service | notification-service | `encounterId`, `patientRef`, `practitionerRef`, `diagnoses[]` |
| `patient.registered.v1` | patient-service | notification-service | `patientId`, `email` |

Соглашение: события идемпотентно обрабатываются (dedup по `eventId`); контракт — в `libs/contracts`.

**4.5 Форматы ошибок**

- FHIR-эндпоинты → `OperationOutcome` (`issue.severity`, `issue.code`, `diagnostics`).
- BFF REST → **RFC 7807 Problem Details** (`type`, `title`, `status`, `detail`, `instance`) + `request-id`.

#### 5. Матрица владения данными

| Хранилище | Владеет | Кто пишет | Кто читает |
| --- | --- | --- | --- |
| HAPI FHIR JPA + PostgreSQL | Ресурсы R4: `Patient`, `Practitioner`, `PractitionerRole`, `Organization`, `Location`, `HealthcareService`, `Schedule`, `Slot`, `Appointment`, `Encounter`, `ClinicalImpression`, `Condition`, `CarePlan`, `ServiceRequest`, `MedicationRequest`, `Procedure`, `Observation`, `Communication`, `AuditEvent`, `CodeSystem`/`ValueSet` | Только через FHIR REST (BFF-сервисы, seed-скрипт) | Все BFF-сервисы |
| PostgreSQL, схема `auth` (TypeORM) | `User`, `Role`, `UserRole`, `ExternalLink`, `OAuthClient`, `OAuthToken` | `auth-service` | `auth-service` |
| PostgreSQL, схема read-model | Агрегаты `Measure`/`MeasureReport` | analytics-worker (по событиям/расписанию) | `analytics-service` |
| Redis | Кэш каталога/слотов, счётчики rate-limit, denylist `jti` | catalog-service, auth-service | все BFF-сервисы |
| RabbitMQ | Транзитные доменные события (без долговременного хранения) | appointment/encounter/patient services | notification-service |

Правило единственного владельца: запись в ресурс FHIR идёт только через один сервис-владелец
(таблица «Микросервисы» в `brainstorming-design.md` §Architecture).

#### 6. Безопасность (NFR-006)

- **Транспорт:** TLS терминируется на Traefik; внутреннее взаимодействие — в приватной сети Docker
  (HAPI напрямую не публикуется наружу).
- **Аутентификация:** SMART on FHIR (OAuth2 + PKCE), `auth-service` = authorization server;
  JWT RS256 с коротким TTL + refresh-rotation; проверка подписи по JWKS выполняется **в каждом
  BFF-сервисе** общим guard-слоем `libs/common` (ADR-009).
- **Авторизация:** SMART-scopes + RBAC-guards (`PATIENT`/`DOCTOR`/`ADMIN`).
- **Patient-компартмент:** пациент видит только свои ресурсы; проверка владения на уровне сервиса
  (defence-in-depth, ADR-013) — пациент-скоуп не отменяет проверку ссылки `patient`.
- **Аудит (FR-021):** `AuditEvent` на create/update/delete в `encounter`, `appointment`, `auth`.
- **OWASP Top-10:** валидация входа (`class-validator`), параметризованные запросы, секреты только в
  env (`.env` не коммитим), rate-limit по эндпоинтам (Redis-счётчики в общем guard-слое), корректные
  CORS и заголовки безопасности на Traefik, отсутствие утечки внутренних деталей в ответах.
- **Секреты:** только env/secret-store; `@nestjs/config` + zod-валидация схемы.

#### 7. Масштабируемость и наблюдаемость (NFR-005/007/009)

- **Stateless BFF (ADR-011):** любое число реплик за Traefik; общее состояние — в HAPI/Redis.
- **Кэш Redis:** `catalog:services`, `catalog:doctors:{service}`, `slots:{schedule}:{from}:{to}` с TTL
  и инвалидацией по событиям; rate-limit счётчики; denylist отозванных `jti`.
- **Индексирование:** индексированные параметры поиска HAPI для `Slot.start/status`,
  `Appointment.date/patient`, `Encounter.date/patient` → NFR-005 (< 500 ms).
- **Наблюдаемость:** `@nestjs/terminus` (`/health`, `/ready`) на каждом сервисе; `nestjs-pino`
  (структурные логи + `request-id` сквозной); `prom-client` (RED-метрики).

#### 8. Architecture Decision Records (ADR)

Формализуют решения D1–D9 из `brainstorming-design.md` и архитектурные решения, введённые здесь.
Статусы: **Accepted** — согласовано и подтверждено владельцем продукта/заказчиком.
На 2026-10-04 все ADR имеют статус **Accepted**; легенда **Proposed** сохранена для будущих задач.

**ADR-001 · HAPI FHIR JPA (R4) как внешний клинический движок · Accepted (D1, KDR-1; владелец продукта, 2026-10-04)** —
*Контекст:* требуется FHIR R4-совместимость, FHIR-поиск, `CapabilityStatement`, валидация (NFR-003),
при требовании стека TS/NestJS (NFR-002). *Решение:* клинические ресурсы хранит off-the-shelf
**HAPI FHIR JPA (Java)** как отдельный контейнер; весь **авторский** код — TypeScript/NestJS.
*Обоснование:* HAPI — готовый внешний движок (не «разработка»), даёт R4-истину из коробки; требование
стека относится к разрабатываемому приложению, тогда как HAPI — такой же внешний компонент, как
PostgreSQL/Redis. *Отклонённые альтернативы:* Medplum (TypeScript, но opinionated auth/схема —
конфликт с ADR-003); собственный NestJS FHIR-фасад на `jsonb` (писать FHIR-поиск и валидацию самим —
YAGNI, риск NFR-003); `@bluehalo/node-fhir-server-core` (Express, не идиоматичен NestJS).
*Следствие:* в compose появляется Java-контейнер `fhir-server`; NFR-002 трактуется как «весь наш код
на TS» — это допущение фиксируется и защищается на защите.

**ADR-002 · Локальный R4-seed терминологии с canonical `https://fhir.by/...` · Accepted (D2, KDR-3, A-1, R-1/R-2/R-4)** —
*Контекст:* НСИ ЦИСЗ/МКБ-10/АТХ/UCUM нужны офлайн, `fhir.by` IG опубликован на FHIR 5.0.0. *Решение:*
seed-скрипт импортирует нужные `CodeSystem`/`ValueSet` в HAPI как **R4**-ресурсы, сохраняя canonical
URL `https://fhir.by/...`; биндинг полей по canonical URL. *R-4 (2026-10-04):* основной режим —
**локальный**; внешний сервис терминологии ЦИСЗ допускается позже как опциональный `terminology-service`
за флагом `TERMINOLOGY_UPSTREAM_URL`, по умолчанию выключен — сейчас такой сервис не проектируется.
*Следствие:* автономность; нужен contract-тест на дрейф R4↔R5 (ADR-017). Снапшот НСИ и импортер —
ADR-016. SNOMED CT/LOINC вне объёма (лицензии), задел через `ConceptMap`.

**ADR-003 · `@node-oauth/oauth2-server` + собственные NestJS-guards · Accepted (D3, KDR-2)** —
Готовый OAuth2-движок + контроль над SMART-профилем (PKCE, scopes). *Следствие:* `auth-service`
реализует model/adapter поверх таблиц `OAuth*`; guards валидируют SMART-scopes и RBAC.

**ADR-004 · `fhir-kit-client` как FHIR-клиент BFF-сервисов · Accepted (D4, KDR-1)** — Меньше
boilerplate, готовые search/read/create. *Следствие:* единый провайдер в `libs/fhir`.

**ADR-005 · RabbitMQ + `@nestjs/microservices` (AMQP) для доменных событий · Accepted (D5, KDR-9, FR-008)** —
Идиоматично микросервисам; надёжная доставка. *Следствие:* каталог событий (4.4), retry + DLQ.

**ADR-006 · TanStack Query (серверные данные) + Zustand (клиентское состояние) · Accepted (D6, NFR-008)** —
Кэш/инвалидация серверных данных + лёгкий UI-state.

**ADR-007 · Tailwind CSS + shadcn/ui + react-hook-form + zod · Accepted (D7, NFR-008)** — Современный,
доступный UI; типизированные формы.

**ADR-008 · PostgreSQL + Redis + RabbitMQ; без MongoDB · Accepted (D8, NFR-009)** — HAPI JPA требует
реляционную БД; дополнительное хранилище не оправдано (YAGNI). `jsonb` при необходимости.

**ADR-009 · Reverse-proxy (Traefik) вместо отдельного NestJS API Gateway · Accepted (D9, NFR-006/007; владелец продукта, 2026-10-04)** —
*Контекст:* требовалась единая точка входа с TLS, маршрутизацией и безопасностью (NFR-006/007).
*Решение:* вход в систему — **Traefik** в Docker Compose (TLS-терминация, маршрутизация `/api/v1/*`,
CORS и security-заголовки); отдельного NestJS-приложения `api-gateway` нет. Проверка JWT по JWKS,
SMART-scopes, RBAC и rate-limit выполняются **в каждом BFF-сервисе** общим guard-слоем `libs/common`.
*Обоснование:* меньше кода и компонентов сопровождения; нативное service discovery и TLS в Docker
Compose. *Цена решения:* логика периметра распределена по сервисам → guard-слой **обязателен** для
каждого сервиса и покрывается интеграционным тестом; при появлении общих кросс-сервисных
правил (например, агрегация лимитов) вернуться к NestJS-gateway можно аддитивно.
*Отклонённые альтернативы:* отдельный NestJS-gateway (дополнительный сервис и хоп);
отсутствие входа с прямой публикацией сервисов (клиенту нужны адреса всех сервисов, дублирование
auth, ослабление NFR-006).

**ADR-010 · Nx-монорепозиторий `apps/*` + `libs/*` · Accepted** — Общие типы/DTO/мапперы/терминология
в `libs/*` (см. §2); независимый деплой приложений (NFR-001). Без barrel-импортов (GOLDEN-PRINCIPLES).

**ADR-011 · Stateless BFF, HAPI — система записи · Accepted (NFR-009)** — Вся клиническая истина в
HAPI; сервисы без собственного клинического состояния → горизонтальное масштабирование.
*Следствие:* собственная реляционная БД только у `auth-service` и read-model аналитики.

**ADR-012 · Идемпотентная запись слота с пессимистичной блокировкой · Accepted (BR-001)** — При
`POST /appointments` перечитать `Slot` и проверить `status=free` в транзакции; при гонке → **409
Conflict**; `Slot.status → busy`. *Следствие:* исключено двойное бронирование.

**ADR-013 · Patient-компартмент на уровне сервиса (defence-in-depth) · Accepted (BR-006, NFR-006)** —
Каждый пациент-скоупный запрос явно передаёт ссылку `patient`; проверка владения на уровне сервиса,
а не только scope. *Следствие:* защита выживает при ошибочно выданном scope.

**ADR-014 · Аудит через FHIR `AuditEvent`, запрос у analytics-service · Accepted (FR-021)** — Отдельный
журнал аудита не нужен: `AuditEvent` пишется рядом с клиническим изменением. *Следствие:* ретенция
аудита следует ретенции HAPI; `GET /admin/audit` — read-model запрос. *Дополнение (ADR-018, D-3):* чтение данных
пациента врачом или администратором (3.2, 3.3, 7.4, 7.5) и каждый отказ `COMPARTMENT_VIOLATION` пишут
`AuditEvent` (`action` `R`/`E`, `outcome` `0`/`4`, без тела ответа) через `PatientReadAudit` (`libs/fhir`); чтение
пациентом своей карты не пишется. Запись идёт **без ожидания, сбой только логируется** (fail-open): аудит не
задерживает и не отменяет медицинский ответ. Журнал показывает их действиями `read` и `denied`.

**ADR-015 · Единственный источник расписания — наш HAPI, без внешней синхронизации · Accepted (R-3, FR-003/020; заказчик, 2026-10-04)** —
*Контекст:* требовалось уточнить, нужны ли «реальные» внешние маршруты расписания и real-time
доставка изменений. *Решение:* `Schedule`/`Slot` — единственный источник; слоты генерирует администратор
через `CRUD /admin/schedules` в пределах `planningHorizon`; внешняя интеграция расписания и
real-time (SSE/WebSocket) **вне объёма**. *Обоснование:* устраняет зависимость от недоступных
внешних источников и не требует лишнего интеграционного адаптера. *Следствие:* `upstream-adapter` не реализуется и интеграционного сервиса в объёме нет; изменение
статуса слота доставляется пациенту через существующее событие `appointment.booked.v1`/`cancelled.v1`
+ polling клиента. *Расширение:* при появлении внешнего источника адаптер добавляется аддитивно.

**ADR-016 · Гибридная стратегия НСИ: версионированный снапшот + скрипт-импортер · Accepted (R-1, NFR-004; владелец продукта, 2026-10-04)** —
*Контекст:* доступность и лицензионный режим НСИ ЦИСЗ вне закрытого контура не гарантированы.
*Решение:* в репозитории лежит **версионированный снапшот** НСИ (МКБ-10, АТХ, UCUM) в R4-формате,
что делает развёртывание воспроизводимым; отдельный **скрипт-импортер** обновляет снапшот из ЦИСЗ,
когда доступ есть. *Обоснование:* развёртывание не зависит от наличия внешнего доступа, при этом путь
обновления сохраняется. *Следствие:* правки справочников — версионируемый снапшот + PR; полный
профильный уровень IG не воспроизводится (ADR-017).

**ADR-017 · Соответствие IG `fhir.by`: уровень `system`/`code` + contract-тест · Accepted (R-2, NFR-003/004; 2026-10-04)** —
*Контекст:* национальный IG `fhir.by` построен на FHIR 5.0.0, система обязана быть R4 (NFR-003) →
структурный и семантический дрейф. *Решение:* держать **строго R4**; биндинг терминологии на уровне
`system`/`code` с canonical `https://fhir.by/...`; добавить **contract-тест** — профиль-фикстуры IG
прогоняются через R4-валидатор, плюс CI-проверка, что все `system` в наших ресурсах имеют префикс
`https://fhir.by/`. R5-обязательные элементы берутся в R4-эквиваленте, при отсутствии эквивалента —
через `extension`. *Обоснование:* сохраняет NFR-003 и даёт проверяемое доказательство соответствия
национальной терминологии. *Допущение:* полный профильный уровень IG вне объёма.

**ADR-018 · Доступ к ПДн пациента по ролям (законодательство РБ) · Accepted (NFR-006; владелец, 2026-10-22)** —
*Контекст:* FHIR R4 не задаёт, кто и какие данные пациента вправе читать; это определяет закон: сведения об
обращении и диагнозе — врачебная тайна (N1), данные о здоровье — специальные ПДн (N2), доступ — по принципу
«минимально необходимого» (N3, N4, N7). *Решение:* врач читает данные только пациента с общей записью или
приёмом (D-1, ADR-013); администратор видит идентификацию и контакты (3.2, 3.3), но **не** историю (7.4) и
назначения (7.5): роль `ADMIN` исключена из `@RequiresRoles` и из проверки компартмента encounter-service (два
уровня); чтение данных пациента журналируется `AuditEvent` (D-3, реализация — в ADR-014); матрица доступа — в
`api-designer-spec.md` §0 (D-5). *Следствие:* ADR-013 не меняется, а сужается для `ADMIN`. Нормы N1–N7 и
решения D-1…D-5 — `tasks/TASK-003/architect-pdn-access-decision.md`.

**ADR-019 · Согласие пациента на ЭМК (FHIR `Consent`) · Accepted (NFR-006; владелец, 2026-10-22)** —
*Контекст:* письменное согласие на внесение сведений в электронную медкарту требует ст. 44 ч. 13 Закона «О здравоохранении» и
постановление Минздрава № 74 (2021); система согласия не знала (D-4). *Решение:* ресурс `Consent` R4 (`scope=patient-privacy`,
категория `emr-processing` в `urn:medcenter:consent-category`, `status` `active`/`inactive`/`rejected`), владелец — `patient-service`
(модуль `consents`); скан бумажной формы — `Binary` с `securityContext=Patient/{id}` и SHA-1 в `sourceAttachment.hash`; подписавший
медработник — в `Consent.note` (Annotation), а не в extension; тип подписанта и документ полномочий — extension `MEDCENTER_EXT`.
`appointment-/encounter-service` читают `Consent` из HAPI своим `FHIR_CLIENT` через `assertActiveConsent` (`libs/fhir`), без вызова
patient-service. Без действующего согласия 7.1/7.3 отвечают 409 `CONSENT_REQUIRED`; режим `CONSENT_ENFORCEMENT=warn|block`
(по умолчанию `warn`), экстренный обход — `emergencyReason` с отдельным `AuditEvent`. Отзыв ничего не удаляет. *Следствие:* флажок
саморегистрации — только согласие на учётную запись (ст. 5 № 99-З) и `Consent` не создаёт. Модель, варианты и правовые ответы —
`tasks/TASK-003/brainstorming-consent-design.md`, `tasks/TASK-003/architect-consent-legal-answers.md`; контракт — `api-designer-spec.md` §3.4–3.11.

#### 9. Трассируемость

**NFR → архитектурный механизм** (ID по `requirements-analyst-requirements.md` §5):

| NFR | Механизм |
| --- | --- |
| NFR-001 | 8 NestJS BFF-приложений + HAPI + Traefik, по образу на сервис; `docker-compose.yml` |
| NFR-002 | TypeScript strict (весь наш код); NestJS; Next.js; Docker (ADR-001/010) |
| NFR-003 | Движок HAPI R4 + `/fhir/metadata` `CapabilityStatement`; contract-тест против IG (ADR-001/017) |
| NFR-004 | Версионированный снапшот НСИ + импортер, биндинг по canonical `https://fhir.by/...` (ADR-002/016) |
| NFR-005 | Индексированные параметры поиска HAPI + кэш слотов Redis (§7) |
| NFR-006 | TLS на Traefik, SMART-scopes, RBAC + компартмент, `AuditEvent`, OWASP-контроли; guard-слой в каждом сервисе (§6, ADR-009/013) |
| NFR-007 | `@nestjs/terminus`, `nestjs-pino` + `request-id`, `prom-client` (§7) |
| NFR-008 | `next-intl` локаль `ru-BY`; TanStack/Zustand (ADR-006/007) |
| NFR-009 | Stateless BFF + общее состояние Redis (ADR-011) |
| NFR-010 | draw.io-диаграммы + `CapabilityStatement` из этого дизайна |
| NFR-011 | Jest / Testcontainers / Playwright; contract-тесты FHIR и терминологии |

**FR → сервис/ресурс:** используется авторитетная таблица
`requirements-analyst-requirements.md` §«Трассируемость (Requirement → Task)»; здесь добавляется только
структурный владелец: FR-001 → auth/patient; FR-002…FR-009 → practitioner/catalog/appointment;
FR-010…FR-014 → encounter; FR-015/FR-018 → auth; FR-016/FR-017/FR-020 → catalog/practitioner;
FR-019 → analytics; FR-021 → все сервисы.

#### 10. Разрешение открытых решений и рисков

Все гейты закрыты решениями владельца продукта и заказчика (2026-10-04):

| Пункт | Владелец | Решение | Статус | Где зафиксировано |
| --- | --- | --- | --- | --- |
| **D1 / ADR-001** — Java-HAPI при требовании стека TS/NestJS | Владелец продукта | **A:** HAPI остаётся off-the-shelf движком; требование NFR-002 относится к авторскому коду | ✅ Accepted | ADR-001 |
| **D9 / ADR-009** — API Gateway | Владелец продукта | **B:** reverse-proxy Traefik вместо NestJS-gateway; guard-слой в каждом BFF | ✅ Accepted | ADR-009 |
| **R-3** — реальные маршруты расписания | Заказчик | **A:** единственный источник — наш HAPI, слоты генерирует администратор, real-time вне объёма | ✅ Accepted | ADR-015 |
| **R-1** — доступность/лицензии НСИ ЦИСЗ | Владелец продукта | **C:** версионированный снапшот + скрипт-импортер | ✅ Accepted | ADR-016 |
| **R-2** — дрейф R4 ↔ IG `fhir.by` (R5) | Архитектура | **C:** строгий R4, биндинг `system`/`code` + contract-тест | ✅ Accepted | ADR-017 |
| **R-4** — внешний сервис терминологии vs локально | Владелец продукта | **C:** локально + опциональный `terminology-service` за флагом (не проектируется сейчас) | ✅ Accepted | ADR-002 |

**Остаточные допущения (не риски, а осознанные границы):**

- Полный профильный уровень IG `fhir.by` вне объёма — поддерживается уровень `system`/`code`.
- Внешняя синхронизация расписания вне объёма; при появлении источника добавляется адаптер.
- Внешний реестр терминологии ЦИСЗ вне объёма; точка расширения — `TERMINOLOGY_UPSTREAM_URL`.
- Наличие лицензий/доступа к НСИ не блокирует развёртывание благодаря снапшоту (ADR-016).

---

### [TASK-001] Разрешение открытых гейтов (2026-10-04)

**Модули затронуты:** `infra/traefik` (новый, EDGE), `libs/common` (guard-слой),
`libs/terminology` (снапшот + импортер), `libs/fhir` (contract-тесты). Отдельный интеграционный сервис
не создаётся — внешних интеграций в объёме нет (ADR-015/017).

**Решения владельца продукта:** D1 = A (ADR-001), D9 = B (ADR-009), R-1 = C (ADR-016),
R-4 = C (ADR-002). **Решение заказчика:** R-3 = A (ADR-015). **Архитектурное:** R-2 = C (ADR-017).

**Изменения в компонентной модели:** `api-gateway` удалён из `apps/*`, добавлен `infra/traefik`;
слой EDGE теперь — reverse-proxy, который **не** проверяет JWT; проверка перенесена в каждый BFF-сервис
через общий guard-слой `libs/common`. Счётчики NFR-001: 8 BFF-приложений + HAPI + Traefik (требование
≥ 6 выполнено с запасом).

**Паттерны:** Traefik — маршрутизация и TLS; `JwtAuthGuard` + `ScopeGuard` + `RoleGuard` +
`RateLimitGuard` в `libs/common`, подключаемые в `app.module.ts` каждого сервиса (единая точка
подключения — `APP_GUARD`, чтобы нельзя было забыть guard).

**Безопасность:** периметр распределён, поэтому интеграционный тест проверяет, что запрос без
валидного JWT не проходит ни в один BFF-сервис (NFR-006). `AuditEvent` — без изменений (ADR-014).

**Масштабируемость:** реплики BFF за Traefik; rate-limit — Redis-счётчики на сервис; ограничение —
кросс-сервисная агрегация лимитов невозможна (учтено в ADR-009 как условие возврата к NestJS-gateway).

**Ключевые допущения:** полный профильный уровень IG `fhir.by`, внешняя синхронизация расписания и
внешний реестр терминологии — вне объёма, точки расширения задокументированы (ADR-015/017, ADR-002).

**Итог:** все ADR-001…ADR-017 имеют статус **Accepted**; открытых гейтов не осталось.

---

**Next by flow:** ~~`/api-designer TASK-001`~~ — выполнено 2026-10-04: REST/FHIR API и схемы
спроектированы в [`api-designer-spec.md`](api-designer-spec.md).
~~`/frontend-design TASK-001`~~ — выполнено 2026-10-04: клиент Next.js спроектирован в
[`frontend-design-spec.md`](frontend-design-spec.md) (дизайн-система, маршруты по ролям,
состояние, карта errorCode→UX, E2E).
