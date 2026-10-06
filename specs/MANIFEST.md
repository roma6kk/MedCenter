# Project: Медицинский центр (Medical Center)

Web-приложение медицинского центра (НИР/курсовой проект БГТУ, TASK-001): пациенты записываются
на приём, врачи ведут приём (диагноз, рекомендации, назначения), администраторы управляют
пользователями, услугами, кабинетами и расписанием. Клинические данные моделируются в
**HL7 FHIR International R4**; национальная терминология (МКБ-10 адапт. МЗ РБ, НСИ ЦИСЗ, АТХ/ATC,
UCUM) подключается по canonical URL `https://fhir.by/...`. Архитектура **гибридная**: off-the-shelf
движок **HAPI FHIR JPA (R4)** хранит клинические ресурсы, весь собственный код — **TypeScript/NestJS**
(**8 BFF-сервисов** за reverse-proxy **Traefik**) и **Next.js** (клиент).

> **Политика проекта (неизменна):** клиника Беларуси → используется **только HL7 FHIR International R4**
> и национальная терминология ЦИСЗ; бельгийские профили не применяются.
> `fhir.by` — национальный ориентир; **ЦИСЗ** — централизованная ИС здравоохранения РБ.

> **Статус TASK-001 (2026-10-05):** все открытые гейты закрыты — D1, D9 (владелец продукта) и R-3
> (заказчик); риски R-1, R-2, R-4 сняты решениями; спроектированы API и фронтенд. Открытых пунктов не осталось.
> Фронтенд (`frontend/`) прошёл code review и исправление замечаний. Четыре Critical закрыты: расположение
> middleware (`src/middleware.ts`), харденинг callback (fail-closed PKCE + denylist `returnTo`), auth-контур
> (httpOnly `mc_rt` + in-memory Bearer через `/api/auth/session`) и проведение формы приёма
> (`CompleteEncounterDto` — МКБ-10/ServiceRequest/MedicationRequest). Проверки: `tsc --noEmit`, `jest`
> (19 suites / 212 tests), `next lint` и `next build` (27 маршрутов + middleware) — зелёные.
> E2E-сценарии остаются smoke-заглушками (`test.fixme`) до подключения полного стека в CI.

> **Реализация бэкенда (2026-10-05):** в Nx-монорепозитории реализованы `apps/auth-service`
> (SMART/OAuth2, схема `auth` через TypeORM, Init-миграция) и общие библиотеки `libs/{common,config,contracts}`
> (guard-слой JWT/scope/RBAC/rate-limit, RFC 7807-фильтр, env-схема, контракты ошибок/пагинации/событий).
> Остальные 7 BFF-сервисов запланированы (карта портов — в `infra/traefik/dynamic.yml`). Тесты
> `contracts`/`common`/`config` — 14 suites / 71 tests зелёные; инвентарь — в
> `tasks/TASK-001/test-generator-backend-coverage-report.md`.

## Specs Index

| File | Purpose | Depends On | Last Updated |
| --- | --- | --- | --- |
| `architect-architecture.md` | Системный дизайн, слои, размещение модулей, интерфейсы, ADR | - | 2026-10-04 |
| `api-designer-spec.md` | Эндпоинты `/api/v1` (9 доменов, 59 эндпоинтов), DTO, SMART/OAuth2, ошибки RFC 7807, Swagger, Bruno, трассируемость 21 FR | architect-architecture | 2026-10-04 |
| `frontend-design-spec.md` | Клиент Next.js: дизайн-система, маршруты по ролям (5 route groups), компоненты, состояние, карта errorCode→UX, E2E Playwright, трассируемость 21 FR | architect-architecture, api-designer-spec | 2026-10-05 |
| `docs-generator-implementation.md` | Nx-воркспейс и dev-стек бэкенда + сборка, тесты, env и auth-контур фронтенда | - | 2026-10-05 |

**Источники требований/дизайна** (временные, `tasks/`): `tasks/TASK-001/requirements-analyst-requirements.md`
(21 FR, 11 NFR, 9 BR, 10 KDR), `tasks/TASK-001/brainstorming-design.md` (решения D1–D9).

## Key Decisions

Решения продукта/дизайна зафиксированы в `tasks/TASK-001/brainstorming-design.md` (D1–D9),
требования — в `tasks/TASK-001/requirements-analyst-requirements.md`. Архитектурные решения
формализованы в `specs/architect-architecture.md` (ADR-001…ADR-017). Ключевое:

- **Стек:** TypeScript (strict) + NestJS для всего собственного кода; Next.js (App Router) клиент;
  Nx-монорепозиторий. HAPI FHIR JPA (R4, Java) — внешний off-the-shelf **движок**, не авторский код.
- **Вход в систему:** reverse-proxy **Traefik** (TLS, маршрутизация); отдельного NestJS-gateway нет —
  JWT/scopes/RBAC/rate-limit проверяет общий guard-слой `libs/common` в каждом BFF-сервисе (ADR-009).
- **Стиль:** слоистая архитектура на сервис (Controller → Service → Mapper/Repository); BFF-сервисы
  **stateless** — система записи клинических данных это FHIR-сервер (HAPI).
- **Обмен:** синхронный FHIR REST (`application/fhir+json`, `/fhir`) для чтения/записи + асинхронные
  доменные события RabbitMQ для уведомлений и реакций.
- **Auth:** SMART on FHIR (OAuth2 + PKCE); `auth-service` = authorization server; RS256 JWT + JWKS,
  refresh-rotation; scopes `patient/*.read|write`, `user/*.read|write`, `launch`.
- **AuthZ:** SMART scopes + RBAC-guards (`PATIENT`/`DOCTOR`/`ADMIN`) + принудительный Patient-компартмент.
- **Хранилища:** PostgreSQL (HAPI JPA + схема `auth` через TypeORM + read-model аналитики),
  Redis (кэш / rate-limit / denylist токенов), RabbitMQ (события). **MongoDB не используем.**
- **Терминология:** локальный R4-seed с сохранением canonical `https://fhir.by/...`; биндинг по canonical URL.
  НСИ поставляется **версионированным снапшотом** + скриптом-импортером; внешний реестр ЦИСЗ вне объёма
  (опциональный `terminology-service` за флагом `TERMINOLOGY_UPSTREAM_URL`).
- **Ошибки:** FHIR → `OperationOutcome`; BFF REST → RFC 7807 Problem Details; идемпотентная запись
  слота (409 при гонке); DLQ RabbitMQ; ошибки не глотаются; логи `pino` с `request-id`.
- **API (2026-10-04, api-designer-spec):** единый вход `/api/v1` через Traefik; JWT по JWKS,
  scopes и RBAC проверяет guard-слой `libs/common` в каждом сервисе (ADR-009); компартмент пациента
  — `patientRef` из JWT-контекста, параметр `patient` в query для `patient/*`-скоупов игнорируется
  (ADR-013). `POST /appointments` — транзакция с пессимистичной блокировкой слота (409 `SLOT_CONFLICT`,
  ADR-012) + `Idempotency-Key`. Оформление приёма — одно атомарное тело `CompleteEncounterDto`
  (диагноз МКБ-10, CarePlan, назначения АТХ/UCUM). Ошибки BFF — RFC 7807 Problem Details с
  `errorCode`-каталогом; FHIR — `OperationOutcome`. Пагинация — единый конверт `PaginatedResponseDto`.
- **Frontend (2026-10-04, frontend-design-spec):** Next.js App Router, 5 route groups
  (public/auth/patient/doctor/admin), RSC для публичного каталога. Дизайн «Медицинская карта»:
  тёплая бумага + чернильная типографика (PT Serif/Inter/JetBrains Mono), радиус 6px, без теней,
  `StampBadge` (статусы-штампы) и `CodeChip` (МКБ-10/АТХ/UCUM). Сессия SMART PKCE через token-broker
  route handlers (`/api/auth/*`) — refresh-токен не попадает в JS браузера. Состояние: TanStack Query
  (+ конвенция инвалидации по мутациям) + Zustand (сессия/UI/черновик бронирования в sessionStorage).
  Все 16 errorCode из API имеют эргономичный UX-ответ (409 SLOT_CONFLICT → восстановление шага мастера
  бронирования и рефреш слотов). 21/21 FR и 9 BR выражены в UI; перекрёстная трассируемость FR ↔ страницы ↔ API.
- **✅ Гейты закрыты (2026-10-04):** ADR-001 (D1 — HAPI off-the-shelf, требование NFR-002 относится
  к авторскому коду) и ADR-009 (D9 — reverse-proxy Traefik вместо NestJS-gateway; JWT/scopes/RBAC/rate-limit
  проверяет общий guard-слой в каждом BFF-сервисе) — **Accepted**. ADR-015 (R-3 — единственный источник
  расписания — наш HAPI, real-time вне объёма) — **Accepted**. ADR-016 (R-1 — снапшот НСИ + импортер),
  ADR-017 (R-2 — строгий R4 + contract-тест против IG `fhir.by`) — **Accepted**.

## Tech Stack

| Layer | Choice |
| --- | --- |
| Backend | NestJS + TypeScript (strict) — 8 BFF-сервисов |
| Edge / вход | Traefik (reverse-proxy: TLS, маршрутизация); auth-контроль в guard-слое `libs/common` |
| Клинический движок | HAPI FHIR JPA (R4, Java) + PostgreSQL |
| FHIR-клиент | `fhir-kit-client` |
| Доменные события | RabbitMQ + `@nestjs/microservices` (AMQP) |
| Auth-хранилище | PostgreSQL + TypeORM (схема `auth`), `@node-oauth/oauth2-server` |
| Кэш / rate-limit | Redis |
| Валидация | `class-validator` + `class-transformer`; zod/joi для конфигурации |
| Наблюдаемость | `@nestjs/terminus`, `nestjs-pino`, `prom-client` |
| Frontend | Next.js (App Router), TanStack Query + Zustand, Tailwind + shadcn/ui, react-hook-form + zod, next-intl (ru-BY) |
| Монорепозиторий | Nx (`apps/*`, `libs/*`) |
| Тесты | Jest, Testcontainers, Playwright |
| Развёртывание | Docker Compose: 8 BFF + HAPI + Traefik + PostgreSQL + Redis + RabbitMQ (≥ 6 контейнеров), готовность к k8s |
