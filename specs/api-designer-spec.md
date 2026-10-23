# API Specification

> Living specification. Entry point — [`MANIFEST.md`](MANIFEST.md). Sections are appended per task
> with the `### [TASK-N] ...` prefix. Structure template — `../spec-desc.md`.
> Базовая архитектура, ADR и матрица владения данными — [`architect-architecture.md`](architect-architecture.md).

---

### [TASK-001] REST API 8 BFF-сервисов + SMART/OAuth2 (2026-10-04)

**Источники:** `specs/architect-architecture.md` (§4, §6, ADR-001…ADR-017),
`tasks/TASK-001/requirements-analyst-requirements.md` (21 FR, 9 BR),
`tasks/TASK-001/brainstorming-design.md` (§API Design, D1–D9).
**Итог:** `specs/api-designer-spec.md` = полная спецификация `/api/v1` (9 доменов, 59 эндпоинтов),
SMART/OAuth2, DTO с `class-validator`, каталог ошибок, Swagger-конвенции, Bruno-коллекция, трассируемость 21 FR.

#### 0. Общие соглашения

**Базовые пути.** Единый вход — Traefik (ADR-009): `/api/v1/**` → BFF-сервис по правилам маршрутизации
в `docker-compose`; `/fhir/**` → HAPI (не публикуется наружу); `/.well-known/*` и `/oauth/*` →
`auth-service`. FHIR REST клиентом не потребляется напрямую (кроме `GET /fhir/metadata` для
`CapabilityStatement` — NFR-010); BFF-сервисы обращаются к HAPI через `fhir-kit-client` (ADR-004)
в приватной сети Docker.

**Форматы.** Запросы/ответы: `application/json; charset=utf-8`. FHIR-взаимодействие внутри
периметра: `application/fhir+json`. Даты — RFC 3339 (UTC); идентификаторы — UUID v4
(FHIR `Resource.id`, `Location`/`Appointment`/… и сущности схемы `auth`).
**Отклонение (live-стенд, 2026-10-15):** ресурсы, созданные через REST HAPI (`Location`, `HealthcareService`,
`Appointment`, `Encounter`), получают от HAPI **числовые** id; `Slot` — детерминированный sha256-id. Поэтому
идентификаторы FHIR-ресурсов в параметрах и телах валидируются как FHIR `id` (`[A-Za-z0-9\-.]{1,64}`), а не
`@IsUUID()`; UUID остаются у сущностей схемы `auth` и у `Idempotency-Key`. Альтернатива (не выбрана) — создавать
ресурсы `PUT` с клиентским UUID.

**Аутентификация.** Все эндпоинты, кроме явно помеченных `public`, требуют
`Authorization: Bearer <JWT>`. Проверка JWT по JWKS, SMART-scopes, RBAC и rate-limit —
общим guard-слоем `libs/common` в каждом BFF-сервисе (`APP_GUARD`, ADR-009): порядок
`JwtAuthGuard` → `ScopeGuard` → `RoleGuard` → `RateLimitGuard`.

**Скоуп-матрица** (SMART on FHIR, KDR-2; scopes: `patient/*.read`, `patient/*.write`,
`user/*.read`, `user/*.write`, `launch`):

| Роль | Scopes | RBAC-guard | Компартмент (ADR-013) |
| --- | --- | --- | --- |
| Пациент | `patient/*.read`, `patient/*.write`, `launch` | `PATIENT` | только свои ресурсы: `patientRef` из `ExternalLink` пользователя, проверка владения на уровне сервиса |
| Врач | `user/*.read`, `user/*.write`, `launch` | `DOCTOR` | только свои `Encounter`/`Appointment` как участник (`PractitionerRole` из `ExternalLink`) |
| Администратор | `user/*.read`, `user/*.write`, `launch` | `ADMIN` | без ограничений компартмента, кроме медицинских данных пациента (ADR-018) |

Правило: scope не отменяет компартмент — пациент-скоупный запрос **всегда** получает
`patientRef` из JWT-контекста (`ExternalLink`), а не из параметров запроса (defence-in-depth,
ADR-013; BR-006). Параметр `patient` в query игнорируется для `patient/*`-скоупов.

**Матрица доступа к ПДн** (ADR-018; нормы и решения — `tasks/TASK-003/architect-pdn-access-decision.md`):

| Категория данных | PATIENT (свои) | DOCTOR (общая запись или приём, ADR-013) | ADMIN |
| --- | --- | --- | --- |
| Идентификация и контакты (3.2) | да | да | да |
| Доверенные лица (3.3) | да | да | да |
| История обращений, диагнозы (7.4 / 7.6) | да | да | нет |
| Назначения (7.5 / 7.7) | да | да | нет |
| Согласие на ЭМК: статус и история (3.4, 3.7), внесение и отзыв (3.6, 3.8, 3.9), скан формы | да, отзыв только своего (3.6) | да, чтение и внесение бумажного согласия | да, чтение и внесение бумажного согласия |
| Аналитика 9.1–9.3 (агрегаты) | — | — | да |
| Журнал аудита 9.4 | — | — | да |

Чтение чужих данных пациента (3.2, 3.3, 3.7, 7.4, 7.5) врачом и администратором и каждый отказ журналируются (`read`/`denied`, ADR-018). Чтение скана согласия журналируется всегда, любым пользователем (ADR-019). Состав согласия — административные данные (регистратор допустим, N7); компартмент врача — ADR-013.

**Пагинация и сортировка** (листинги `GET`):

| Параметр | Тип | По умолчанию | Ограничение |
| --- | --- | --- | --- |
| `page` | int ≥ 1 | 1 | — |
| `pageSize` | int 1…100 | 20 | ≤ 100 |
| `sortBy` | enum per-endpoint | per-endpoint | — |
| `sortOrder` | `asc` \| `desc` | `asc` | — |

Ответ-конверт (единый для всех листингов):

```typescript
// libs/contracts/src/pagination.dto.ts
export class PageMetaDto {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export class PaginatedResponseDto<TItem> {
  items: TItem[];
  meta: PageMetaDto;
}
```

**Rate-limit** (NFR-006, Redis-счётчики, guard `libs/common`): `120 req/min` на пользователя
на сервис; `20 req/min` на `POST /oauth/token` (по `clientId`+IP); превышение → `429` с
заголовками `Retry-After`. Аудит (`AuditEvent`) пишется на create/update/delete (FR-021, ADR-014) и на чтение данных пациента врачом или администратором (3.2, 3.3, 7.4, 7.5) вместе с отказами 403 `COMPARTMENT_VIOLATION` (ADR-018).

**Идемпотентность.** `POST /appointments` и `POST /admin/schedules/generate` принимают
заголовок `Idempotency-Key: <uuid>` (хранится в Redis, TTL 24 h, ответ повторяется из кэша).

#### 1. Модель ошибок

**BFF REST → RFC 7807 Problem Details** (`application/problem+json`), глобальный exception filter
`libs/common`:

```json
{
  "type": "https://api.medcenter.by/errors/slot-conflict",
  "title": "Slot conflict",
  "status": 409,
  "detail": "Slot 7c9e… уже занят (status=busy)",
  "instance": "/api/v1/appointments",
  "requestId": "01J9ZK3M8Q…",
  "errorCode": "SLOT_CONFLICT"
}
```

**FHIR-эндпоинты (HAPI) → `OperationOutcome`** — см. `architect-architecture.md` §4.5.

Каталог кодов ошибок (`errorCode` / HTTP / условие):

| errorCode | HTTP | Условие |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | DTO `class-validator` не прошёл валидацию (`details[]` с полями) |
| `UNAUTHENTICATED` | 401 | нет/просрочен/невалиден JWT (JWKS-проверка) |
| `TOKEN_REVOKED` | 401 | Bearer-токен отозван: `jti` (или `sid` пары) найден в denylist — проверка в `JwtAuthGuard` (ADR-009) |
| `FORBIDDEN_SCOPE` | 403 | scope не покрывает операцию |
| `FORBIDDEN_ROLE` | 403 | RBAC-роль не допущена |
| `COMPARTMENT_VIOLATION` | 403 | обращение к чужим данным (ADR-013) |
| `NOT_FOUND` | 404 | ресурс не найден |
| `METHOD_NOT_ALLOWED` | 405 | — |
| `CONFLICT` | 409 | конфликт версии или дубликат при записи в FHIR-хранилище (HAPI 409/412); дубликат e-mail (`EMAIL_TAKEN` в `detail`, 2.2.1/2.2.6) и дубликат `identifier` кабинета (4.4/4.5) — причина в `detail` |
| `SLOT_CONFLICT` | 409 | BR-001: слот уже занят (гонка, ADR-012) |
| `CONSENT_REQUIRED` | 409 | у пациента нет действующего согласия на электронную медкарту (7.1, 7.3; ADR-019); при `CONSENT_ENFORCEMENT=warn` не возвращается |
| `CONSENT_ALREADY_ACTIVE` | 409 | 3.8: у пациента уже есть действующее согласие; сначала отзыв (3.9) |
| `APPOINTMENT_NOT_CANCELLABLE` | 409 | BR-002: статус не позволяет отмену |
| `ENCOUNTER_STATE_INVALID` | 409 | BR-003/BR-008: приём уже оформлен / запись не `booked` (cancelled/noshow/fulfilled); неявка (6.6) для записи, у которой уже есть приём |
| `SCHEDULE_OVERLAP` | 409 | пересечение `Schedule.planningHorizon` одного `PractitionerRole` |
| `INVALID_ICD10_CODE` | 422 | код не входит в ValueSet `https://fhir.by/ValueSet/InternClassificDiseases10`; `details[]` называет поля запроса (`diagnoses.1.code`), `detail` сохраняет список кодов |
| `TERMINOLOGY_NOT_FOUND` | 422 | код отсутствует в локальном seed НСИ (ADR-002/016); `details[]` называет поля запроса (`medicationRequests.0.atcCode`, `observations.0.unit`), `detail` сохраняет список кодов |
| `RATE_LIMITED` | 429 | превышение лимита |
| `INTERNAL` | 500 | необработанная ошибка (детали только в логе `pino` + `request-id`) |

#### 2. `auth-service` — SMART / OAuth2 и пользователи (KDR-2, FR-001, FR-015)

**Модули:** `oauth`, `users`, `terminology` (секция 2.3 — FR-018).
**Хранилище:** PostgreSQL схема `auth` (TypeORM); FHIR-связи через `ExternalLink`.

##### 2.1 SMART / OAuth2 (FHIR `fhir-server`-контекст)

| # | Метод и путь | Назначение | Доступ |
| --- | --- | --- | --- |
| 2.1.1 | `GET /.well-known/smart-configuration` | SMART discovery: endpoints, scopes, capabilities; `fhir_base` → HAPI | public |
| 2.1.2 | `GET /oauth/authorize` | Authorization Code + PKCE (`code_challenge`, `code_challenge_method=S256`) | public (сессия логина) |
| 2.1.3 | `POST /oauth/token` | Обмен `code`/`refresh_token` на JWT (RS256, TTL 15 min) + refresh (TTL 14 d, rotation) | public, rate-limit |
| 2.1.4 | `POST /oauth/token/revoke` | Отзыв refresh-токена (`jti` → Redis-denylist) | Bearer |
| 2.1.5 | `GET /.well-known/jwks.json` | Публичный ключ RS256 для guard-слоя всех BFF-сервисов | public |

**2.1.2 `GET /oauth/authorize`** — параметры: `response_type=code`, `client_id`, `redirect_uri`,
`scope` (пробел-разделённые), `state`, `code_challenge`, `code_challenge_method=S256`, `launch?`.
302 → `redirect_uri?code=…&state=…` | ошибка → `redirect_uri?error=access_denied&state=…`.

##### 2.1.1 `GET /.well-known/smart-configuration`

Документ публикует endpoints (`authorization_endpoint`, `token_endpoint`, `revocation_endpoint`, `jwks_uri`),
`scopes_supported`, `response_types_supported: ['code']`, `code_challenge_methods_supported: ['S256']`,
`capabilities` и `fhir_base`. Как клиент аутентифицируется на `token_endpoint` (RFC 8414 §2) и какие grant'ы
поддерживаются — тоже часть discovery-документа:

```json
{
  "token_endpoint_auth_methods_supported": ["client_secret_post", "none"],
  "grant_types_supported": ["authorization_code", "refresh_token"]
}
```

`none` — публичный PKCE-клиент (без секрета); `client_secret_post` — конфиденциальный клиент передаёт
`client_secret` в теле запроса (проверяет `TokenClientGuard`).

**2.1.3 `POST /oauth/token`** — `application/x-www-form-urlencoded`:

```text
grant_type=authorization_code | refresh_token
code=… & redirect_uri=… & client_id=… & code_verifier=…        (authorization_code)
refresh_token=…                                                 (refresh_token)
```

**Response 200** (JWT claims: `sub` (userId), `patient?` (PatientRef), `encounter?`,
`scope`, `role` (`PATIENT`|`DOCTOR`|`ADMIN`), `fhirUser?` (PractitionerRoleRef), `jti`,
`sid` (session id: `jti` парного refresh-токена), `iss`, `iat`, `exp`):

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs…",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "…",
  "scope": "patient/*.read patient/*.write launch",
  "patient": "Patient/9f2c…"
}
```

**Status:** 200 · 400 (`invalid_grant` / `unsupported_grant_type`) · 401 (`invalid_client`) ·
429 (`RATE_LIMITED`).

> **Contract note (R1, decided 2026-10-06).** A revoked or already-rotated `refresh_token` is reported
> exactly like any other unusable one — **400 `invalid_grant`** — so this endpoint stays strictly RFC 6749
> §5.2 and never reveals that a `jti` previously existed. `TOKEN_REVOKED` is a **401** catalogue code and
> belongs to the guard layer, where a Bearer access token whose `jti` is denied is the unambiguous source
> (denylist check in `JwtAuthGuard` — реализована 2026-10-06; намеренно **не** часть 2.1.3).
>
> **`sid` — связь access/refresh.** Access-токен несёт `sid`, равный `jti` выданного вместе с ним
> refresh-токена. Поэтому отзыв refresh-токена (2.1.4) закрывает и ещё живой Bearer: guard-слой отвечает
> **401 `TOKEN_REVOKED`**. Ротация (`refresh_token` grant) пишет только «reuse»-метку и сессию **не** закрывает,
> иначе каждый плановый refresh разлогинивал бы собственного клиента.

**2.1.4 `POST /oauth/token/revoke`** — `application/json` body:

```json
{ "refreshToken": "…", "client_id": "medcenter-web" }
```

`refreshToken` is required; `client_id` is optional (a user-driven logout has no client identity). The route
requires `Authorization: Bearer <JWT>`.

**Ownership (RFC 7009 §2.1).** The server revokes a refresh token only when it was issued to the
authenticated principal: the stored token's `userId` must equal the Bearer `sub` (and, when `client_id` is
supplied, its owning client must match). Anything else — unknown token, already consumed/denied, or a token
owned by another principal — is a **no-op**, never a new denial, so the endpoint cannot be used to enumerate
or to revoke another principal's token.

**Response 200:** `{ "revoked": true | false }` — `false` when the token was not owned by the caller or was
already unusable (the outcome is indistinguishable by design).

**Отзыв закрывает сессию.** Access-токен, выданный вместе с отозванным refresh-токеном, несёт его `jti`
как `sid`, поэтому после успешного отзыва (`revoked: true`) тот же Bearer перестаёт приниматься
guard-слоем — **401 `TOKEN_REVOKED`** (см. 2.1.3).

##### 2.2 Пользователи (FR-015, BR-007)

| # | Метод и путь | Назначение | Доступ |
| --- | --- | --- | --- |
| 2.2.1 | `POST /api/v1/admin/users` | создать пользователя (`PATIENT` — саморегистрация A-6 см. §7) | `ADMIN` |
| 2.2.2 | `GET /api/v1/admin/users?role=&search=&page=&pageSize=` | список | `ADMIN` |
| 2.2.3 | `GET /api/v1/admin/users/{id}` | карточка + `ExternalLink` | `ADMIN` |
| 2.2.4 | `PATCH /api/v1/admin/users/{id}` | роль, `isActive` | `ADMIN` |
| 2.2.5 | `DELETE /api/v1/admin/users/{id}` | деактивация (soft) | `ADMIN` |
| 2.2.6 | `POST /api/v1/auth/register` | саморегистрация пациента (A-6) | public |
| 2.2.7 | `GET /api/v1/me` | профиль текущего пользователя + `ExternalLink` | любой Bearer |

**2.2.6 `POST /api/v1/auth/register`** — после создания `User` сервис создаёт `Patient` в HAPI
через `fhir-kit-client` и сохраняет `ExternalLink`; событие `patient.registered.v1` (§4.4
архитектуры).

```typescript
// apps/auth-service/src/modules/users/dto/register-patient.dto.ts
import { IsDateString, IsEmail, IsNotEmpty, IsString, IsStrongPassword, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterPatientDto {
  @ApiProperty({ example: 'ivanov@example.by' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Иван', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Иванов', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ format: 'password', example: 'Str0ng!Pass' })
  @IsStrongPassword({ minLength: 10, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 })
  password: string;

  @ApiProperty({ format: 'date', example: '1990-05-12' })
  @IsDateString()
  birthDate: string;

  @ApiPropertyOptional({ enum: ['male', 'female'] })
  gender?: 'male' | 'female';

  @ApiProperty({ type: () => AccountConsentDto })
  @IsDefined() @ValidateNested() @Type(() => AccountConsentDto)
  accountConsent: AccountConsentDto;   // галочка формы регистрации: согласие на обработку данных учётной записи
}

export class AccountConsentDto {
  @Equals(true) accepted: true;        // только true; false или отсутствие → 400 VALIDATION_ERROR
  @IsString() @IsNotEmpty() @MaxLength(64)
  textVersion: string;                 // версия показанного текста, напр. '2026-10'
}
```

**Согласие на обработку данных учётной записи** (ст. 5 Закона № 99-З; не согласие на ЭМК, ADR-019). Сервис пишет в `auth.user` два
столбца: `account_consent_at` (момент приёма запроса, `timestamptz`) и `account_consent_version` (`varchar(64)`, `textVersion`); оба `NULL` у записей,
созданных администратором (2.2.1) и до миграции `AccountConsent1700000000002`. `FHIR Consent` при регистрации **не создаётся**: согласие на
электронную медкарту даётся отдельно (3.8) и без него 7.1/7.3 блокируются. В `UserResponseDto` эти поля не возвращаются; `accountConsent`
отсутствует в 2.2.1 и 2.2.4.

**Response 201** `UserResponseDto`: `{ id: UUID; email; firstName; lastName; roles: string[];
patientRef: string | null; isActive: boolean }` · **409** email занят: `errorCode=CONFLICT`, код
`EMAIL_TAKEN` в начале `detail` (`EMAIL_TAKEN: a user with this email already exists`); сравнение без учёта регистра.

**2.2.4 `PATCH /api/v1/admin/users/{id}`** — `UpdateUserDto = PartialType(OmitType(RegisterPatientDto, ['password'] as const))`
+ `@IsOptional() @IsArray() roles?: string[]` + `@IsOptional() @IsBoolean() isActive?: boolean`.

##### 2.3 Терминология (FR-018, ADR-002/016/017)

| # | Метод и путь | Назначение | Доступ |
| --- | --- | --- | --- |
| 2.3.1 | `GET /api/v1/terminology/value-sets` | список seed'нутых `ValueSet` (canonical `https://fhir.by/...`) | `ADMIN` |
| 2.3.2 | `GET /api/v1/terminology/value-sets/{url}/$expand` | развёртка ValueSet (кэш Redis) | `user/*.read` |
| 2.3.3 | `GET /api/v1/terminology/validate?system=&code=` | валидация пары system/code в seed'нутых ValueSet | `user/*.read` |
| 2.3.4 | `POST /api/v1/admin/terminology/import` | запуск импортера снапшота НСИ (ADR-016) | `ADMIN` |

**2.3.4** — тело `{ "snapshotVersion": "1.4.463" }` → 202 Accepted, прогресс через логи/событие;
конфликт выполняющегося импорта → 409.

#### 3. `patient-service` — Пациенты (FR-001, FR-002)

| # | Метод и путь | Назначение | Доступ |
| --- | --- | --- | --- |
| 3.1 | `GET /api/v1/me/patient` | FHIR-профиль текущего пациента (по `ExternalLink`) | `patient/*.read` |
| 3.2 | `GET /api/v1/patients/{id}` | карточка пациента | `user/*.read` (DOCTOR/ADMIN) |
| 3.3 | `GET /api/v1/patients/{id}/related` | доверенные лица (`RelatedPerson`) | `user/*.read` (DOCTOR/ADMIN) |
| 3.4 | `GET /api/v1/me/consent` | своё действующее согласие на ЭМК и история | `patient/*.read` |
| 3.5 | — | не вводится: электронное согласие на ЭМК без ЭЦП не даётся (ADR-019) | — |
| 3.6 | `POST /api/v1/me/consent/revoke` | отозвать своё согласие (сразу блокирует новые записи, ничего не удаляет) | `patient/*.write` |
| 3.7 | `GET /api/v1/patients/{id}/consent` | статус и история согласия пациента | `user/*.read` (DOCTOR со связью / ADMIN) |
| 3.8 | `POST /api/v1/patients/{id}/consent` | внести бумажное согласие или письменный отказ (скан обязателен) | `user/*.write` (DOCTOR со связью / ADMIN) |
| 3.9 | `POST /api/v1/patients/{id}/consent/revoke` | зафиксировать письменный отзыв (номер заявления) | `user/*.write` (DOCTOR со связью / ADMIN) |
| 3.10 | `POST /api/v1/patients/{id}/consent/scan` | загрузить скан формы (`multipart/form-data`, поле `file`) → `Binary` | `user/*.write` (DOCTOR со связью / ADMIN) |
| 3.11 | `GET /api/v1/patients/{id}/consent/scan/{scanId}` | скачать скан; каждое чтение журналируется | `user/*.read` (DOCTOR со связью / ADMIN) |

Маппинг: `Patient` R4 ↔ `PatientResponseDto` (`FhirToXMapper`); компартмент: врач видит только
пациентов с активным `Encounter`/`Appointment` вместе (defence-in-depth, ADR-013).

##### 3.4–3.11 Согласие на электронную медкарту (ADR-019)

Основание и модель — `tasks/TASK-003/brainstorming-consent-design.md` §2–§5, `tasks/TASK-003/architect-consent-legal-answers.md`
(ст. 44 ч. 13 Закона «О здравоохранении», постановление Минздрава № 74 (2021)); здесь только контракт. Ресурс — FHIR R4 `Consent`
(`scope=patient-privacy`, `category=emr-processing`), владелец — `patient-service`, модуль `consents`.

```typescript
// apps/patient-service/src/modules/consents/dto/create-consent.dto.ts
export class CreateConsentDto {
  status?: 'active' | 'rejected';        // по умолчанию active; rejected — письменный отказ
  formNumber: string;                    // 1…64, номер бумажной формы → Consent.identifier
  signedAt: string;                      // YYYY-MM-DD или RFC 3339, не в будущем → Consent.dateTime
  scanId: string;                        // id из 3.10 (обязателен, иначе 400 VALIDATION_ERROR)
  consenterType: 'self' | 'legal-representative' | 'guardian' | 'relative';
  relatedPersonId?: string;              // обязателен при consenterType ≠ self → performer=RelatedPerson
  representativeDocument?: string;       // ≤ 500, обязателен при consenterType ≠ self (документ полномочий)
  signedByName?: string;                 // ≤ 200, ФИО медработника; обязателен для ADMIN, у DOCTOR берётся из токена
}
export class RevokeConsentDto {          // 3.9; для 3.6 тело пустое
  applicationNumber: string;             // 1…64, номер письменного заявления
  revokedAt?: string;                    // по умолчанию сегодня
}
export class ConsentResponseDto {
  id: string; status: 'active' | 'inactive' | 'rejected' | 'entered-in-error';
  formNumber?: string; signedAt: string; consenterType?: string;
  performer: { type: 'Patient' | 'RelatedPerson'; id: string };
  signedBy?: string; representativeDocument?: string;
  scan?: { id: string; contentType: string; hash: string };
  period: { start?: string; end?: string }; revocationNumber?: string; recordedAt?: string;
}
export class PatientConsentDto {         // 3.4, 3.7
  active: ConsentResponseDto | null;     // действует и срок не истёк
  history: ConsentResponseDto[];         // от новых к старым, включая действующее
}
```

- **3.4 / 3.7** → 200 `PatientConsentDto`. 3.7 врачом и администратором журналируется как чтение (`read`/`denied`); 3.4 — нет.
- **3.8** → 201 `ConsentResponseDto`. Второе действующее согласие (или отказ при действующем) → **409** `CONSENT_ALREADY_ACTIVE`;
  чужой или неизвестный `scanId` → 400; `relatedPersonId` не этого пациента → 400. `Consent` и `AuditEvent` (`create`, `entity=Consent/{id}`)
  пишутся одной `transaction` Bundle. После `rejected` новое согласие вносится как обычно.
- **3.6 / 3.9** → 200 `ConsentResponseDto` (`status=inactive`, `provision.period.end`=дата отзыва); без действующего согласия → **404** `NOT_FOUND`.
  `Consent` обновляется с `If-Match`, `AuditEvent` (`update`) — в той же Bundle. Данные пациента не удаляются, блокируются только новые записи.
- **3.10** → 201 `{ scanId, contentType, size, hash }`. Типы `application/pdf`, `image/jpeg`, `image/png`, до **10 МБ**; тип проверяется
  по сигнатуре файла, а не по заголовку; `hash` — SHA-1 в base64 (`Consent.sourceAttachment.hash`). Нарушение → **400** `VALIDATION_ERROR`.
  `Binary.securityContext=Patient/{id}`; запись журналируется (`create`, `entity=Binary/{id}`).
- **3.11** → 200 байты с `Content-Type` скана; скан другого пациента → 404. Каждое чтение (успех и отказ) — `AuditEvent` (`read`, `entity=Binary/{id}`).
- Роли и компартмент: ADMIN — любой пациент; DOCTOR — только пациент со связью (ADR-013, как 3.2) → иначе 403 `COMPARTMENT_VIOLATION`;
  PATIENT — только 3.4 и 3.6 и только своя запись.
- Блокировка: 7.1 и 7.3 без действующего согласия → **409** `CONSENT_REQUIRED`; 6.1 разрешена с предупреждением, но свободный текст
  причины без согласия отклоняется; экстренный обход — `emergencyReason` (см. 7.1). Режим — `CONSENT_ENFORCEMENT=warn|block` (по умолчанию `block`).

#### 4. `practitioner-service` — Врачи, кабинеты, организация (FR-002, FR-017)

| # | Метод и путь | Назначение | Доступ |
| --- | --- | --- | --- |
| 4.1 | `GET /api/v1/doctors?serviceId=&specialty=&search=&page=&pageSize=` | каталог врачей | public (см. §0) |
| 4.2 | `GET /api/v1/doctors/{id}` | карточка врача + специальность + кабинет | public |
| 4.3 | `GET /api/v1/rooms?page=&pageSize=` | кабинеты (`Location.physicalType=room`) | `user/*.read` |
| 4.4 | `POST /api/v1/admin/rooms` | создать кабинет | `ADMIN` |
| 4.5 | `PATCH /api/v1/admin/rooms/{id}` | обновить кабинет | `ADMIN` |
| 4.6 | `DELETE /api/v1/admin/rooms/{id}` | удалить (если нет активных `Schedule`) → иначе 409 `ROOM_IN_USE` | `ADMIN` |
| 4.7 | `GET /api/v1/admin/rooms/{id}/usage` | занятость кабинета (`Schedule`/`Slot` references) | `ADMIN` |

**4.1/4.2 `DoctorResponseDto`** (`apps/practitioner-service/src/modules/doctors/dto/doctor-response.dto.ts`):

```typescript
export interface DoctorResponseDto {
  id: string;                      // Practitioner id
  name: string;                    // «Имя Фамилия»
  firstName: string;
  lastName: string;
  specialty?: string;              // отображаемый текст специальности («Терапевт»)
  specialtyCode?: string;          // код специальности — значение для ?specialty= (4.1): `419192003`
  specialtySystem?: string;        // система кода: `http://snomed.info/sct`; ?specialty=system|code
  roomId?: string;
  practitionerRoleIds: string[];   // id активных PractitionerRole врача по возрастанию; [] если ролей нет
}
```

`specialtyCode`/`specialtySystem` — первый `coding` с `code` из `Practitioner.qualification[0].code` (тот же концепт,
что хранит `PractitionerRole.specialty`, по которому фильтрует `?specialty=`); без кодированной квалификации (только
текст) они отсутствуют. `practitionerRoleIds` — **все** активные роли врача (`active != false`), а не только подошедшие
под фильтр `serviceId`/`specialty`; на них ссылается `practitionerRoleId` DOCTOR-аккаунта (2.2.1). Это один
дополнительный поиск `PractitionerRole?practitioner=Practitioner/{id},…` на страницу (не больше 200 ролей); поля
добавлены без изменения прежних, `specialty` остаётся текстом.

**4.4/4.5 — уникальность `identifier`:** `identifier` кабинета уникален среди кабинетов
(`Location.physicalType=ro`); он сравнивается без учёта регистра и крайних пробелов. Создание (4.4) с занятым
`identifier` или переименование (4.5) в занятый → **409** `CONFLICT`, в `detail`:
`CONFLICT: room identifier "204-Х" is already used by room {id}`. PATCH с `identifier`, равным собственному, допустим.
HAPI не имеет unique-ограничения, проверка выполняется сервисом перед записью; гонка двух одновременных `POST` с
одинаковым идентификатором не отслеживается (админские записи, низкая частота).

```typescript
// apps/practitioner-service/src/modules/rooms/dto/create-room.dto.ts
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({ example: '204-Х' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  identifier: string; // Location.identifier, уникален

  @ApiProperty({ example: 'Кабинет 204' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  floor?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateRoomDto extends PartialType(CreateRoomDto) {}
```

**RoomResponseDto:** `{ id; identifier; name; floor?: number; description?: string; isActive }`.
**Status:** 201/200/204 · 404 `NOT_FOUND` · 409 `ROOM_IN_USE` (4.6).

#### 5. `catalog-service` — Услуги, расписание, слоты (FR-003, FR-016, FR-020)

##### 5.1 Услуги (HealthcareService)

| # | Метод и путь | Назначение | Доступ |
| --- | --- | --- | --- |
| 5.1.1 | `GET /api/v1/services?page=&pageSize=&search=` | каталог услуг | public |
| 5.1.2 | `GET /api/v1/services/{id}` | карточка услуги +specialty | public |
| 5.1.3 | `POST /api/v1/admin/services` | создать услугу | `ADMIN` |
| 5.1.4 | `PATCH /api/v1/admin/services/{id}` | обновить услугу | `ADMIN` |
| 5.1.5 | `DELETE /api/v1/admin/services/{id}` | удалить (нет активных `Schedule` → иначе 409 `SERVICE_IN_USE`) | `ADMIN` |

**5.1.3 `CreateServiceDto`** (маппинг → `HealthcareService`; `type` биндится на НСИ ЦИСЗ через
canonical `https://fhir.by/...`, ADR-002):

```typescript
// apps/catalog-service/src/modules/services/dto/create-service.dto.ts
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateServiceDto {
  @ApiProperty({ example: 'Консультация терапевта' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'https://fhir.by/CodeSystem/nsi-services' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  typeSystem: string; // canonical НСИ ЦИСЗ (ADR-002)

  @ApiProperty({ example: '01.001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  typeCode: string;   // код услуги из НСИ

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(5)
  @Max(240)
  defaultDurationMin: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialtyCodes?: string[]; // ссылки на PractitionerRole.specialty
}
```

**ServiceResponseDto:** `{ id; name; typeSystem; typeCode; typeDisplay; defaultDurationMin;
description?; isActive }`. Инвалидация Redis-кэша `catalog:services` при 5.1.3–5.1.5.

##### 5.2 Расписание (Schedule) и генерация слотов (FR-020, BR-007, ADR-015)

| # | Метод и путь | Назначение | Доступ |
| --- | --- | --- | --- |
| 5.2.1 | `POST /api/v1/admin/schedules` | создать `Schedule` (`planningHorizon` ≤ 90 дней) | `ADMIN` |
| 5.2.2 | `GET /api/v1/admin/schedules?doctorId=&active=true&page=` | список расписаний | `ADMIN` |
| 5.2.3 | `PATCH /api/v1/admin/schedules/{id}` | изменить окно/горизонт (проверка `SCHEDULE_OVERLAP`) | `ADMIN` |
| 5.2.4 | `DELETE /api/v1/admin/schedules/{id}` | удалить расписание: busy-слоты защищают его всегда; free-слоты удаляются при `cascade:true`; расписание со слотами, на которые ссылаются записи, деактивируется (см. ниже) | `ADMIN` |
| 5.2.5 | `POST /api/v1/admin/schedules/{id}/generate` | сгенерировать `Slot` на период | `ADMIN` |
| 5.2.6 | `GET /api/v1/admin/schedules/{id}/slots?from=&to=&status=` | слоты расписания | `ADMIN` |
| 5.2.7 | `GET /api/v1/doctor/schedule?from=&to=` | своё расписание + слоты | `user/*.read` (DOCTOR) |
| 5.2.8 | `GET /api/v1/doctors/{id}/slots?from=&to=` | свободные слоты врача | public |

**5.2.1 `CreateScheduleDto`:**

```typescript
// apps/catalog-service/src/modules/schedules/dto/create-schedule.dto.ts
import {
  IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
  ValidateNested, ArrayMinSize, IsDateString, Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WeeklyWindowDto {
  @ApiProperty({ enum: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] })
  @IsIn(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])
  dayOfWeek: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime: string; // HH:mm, локальное время клиники

  @ApiProperty({ example: '13:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime: string;   // endTime > startTime
}

export class CreateScheduleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  practitionerRoleId: string; // actor: PractitionerRole

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roomId: string;             // actor: Location (кабинет)

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceId: string;          // actor: HealthcareService

  @ApiProperty({ format: 'date' })
  @IsDateString()
  horizonFrom: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  horizonTo: string;          // horizonTo - horizonFrom ≤ 90 дней

  @ApiProperty({ type: [WeeklyWindowDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WeeklyWindowDto)
  windows: WeeklyWindowDto[];

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(5)
  @Max(120)
  slotDurationMin: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
```

**5.2.5 `POST /admin/schedules/{id}/generate`** — тело `GenerateSlotsDto`:
`{ from: date; to: date }` (`to-from` ≤ 90 дней, в пределах `planningHorizon`) → **201** с
`{ generated: number; skipped: number }` (существующие слоты не дублируются). Поддерживает
`Idempotency-Key` (§0). Для расписания с `active=false` (см. 5.2.4) → 409 `CONFLICT`.

**5.2.4** — тело `{ "cascade": false }` (по умолчанию). Фактическая семантика (live-стенд, 2026-10-15):

| Состояние расписания | `cascade:false` | `cascade:true` |
| --- | --- | --- |
| нет слотов | 204, расписание удалено | 204, расписание удалено |
| есть любые слоты | 409 `SCHEDULE_IN_USE` | см. ниже |
| есть `busy`-слот (живая запись, BR-001) | 409 `SCHEDULE_IN_USE` | **409 `SCHEDULE_IN_USE`** (а не 204: busy-слоты защищены всегда) |
| только `free`-слоты | 409 `SCHEDULE_IN_USE` | 204, слоты и расписание удалены |
| `free`-слот, на который ссылается отменённая запись | 409 `SCHEDULE_IN_USE` | 204, см. ниже |

Отмена записи возвращает слот в `free`, но `Appointment.slot` остаётся (история приёма), а HAPI по умолчанию
проверяет ссылочную целостность и отвечает `409` на `DELETE Slot` (проверено на стенде). Такой слот не удаляется:
он переводится в `entered-in-error` (запись с `If-Match` на прочитанную версию: если запись успела забронировать
слот, запись проваливается и ответ — 409 `SCHEDULE_IN_USE`), а `Schedule` деактивируется (`active=false`) вместо
физического удаления: слот ссылается на расписание, расписание — на кабинет и услугу, поэтому их `DELETE` тоже
остаётся `ROOM_IN_USE`/`SERVICE_IN_USE`. Ответ тот же 204, повторный `DELETE` безопасен (204). Деактивированное
расписание не участвует в проверке `SCHEDULE_OVERLAP`, в `GET /doctors/{id}/slots` и `GET /doctor/schedule`, виден
администратору как `isActive=false` (`GET /admin/schedules?active=false`) и не принимает `generate`.

**5.2.8 `SlotResponseDto`:** `{ id; scheduleId; start; end; status: 'free' | 'busy' | 'entered-in-error' }` —
пагинация отключена (данные компактны), сортировка по `start` обязательна. `entered-in-error` — слот, снятый при
удалении расписания (5.2.4); он виден только в `GET /admin/schedules/{id}/slots?status=entered-in-error`:
без `status` этот эндпоинт отдаёт только `free` и `busy`.

#### 6. `appointment-service` — Запись на приём (FR-004/005/006, BR-001/002, ADR-012)

| # | Метод и путь | Назначение | Доступ |
| --- | --- | --- | --- |
| 6.1 | `POST /api/v1/appointments` | записаться: слот → busy, `Appointment(status=booked)` | `patient/*.write` |
| 6.2 | `GET /api/v1/appointments?upcoming=true&status=booked,noshow&page=` | свои записи (компартмент); `status` — фильтр по статусу (см. ниже) | `patient/*.read` |
| 6.3 | `GET /api/v1/appointments/{id}` | детали записи | владелец / DOCTOR / ADMIN |
| 6.4 | `POST /api/v1/appointments/{id}/cancel` | отмена: `status=cancelled` + `statusReason` | владелец-пациент / ADMIN |
| 6.5 | `GET /api/v1/doctor/appointments?from=&to=&page=` | записи врача как участника | `user/*.read` (DOCTOR) |
| 6.6 | `POST /api/v1/doctor/appointments/{id}/noshow` | пометить неявку (`status=noshow`); только `booked` без приёма, иначе 409 `ENCOUNTER_STATE_INVALID` | `user/*.write` (DOCTOR) |

**6.2 фильтр `status`:** необязательный параметр `status` — один статус или список через запятую
(`booked|cancelled|noshow|fulfilled`; допустим и повтор параметра `?status=a&status=b`), ИЛИ между значениями;
дубликаты и пробелы вокруг значений отбрасываются, пустое значение = «без фильтра». Неизвестное значение → **400**
`VALIDATION_ERROR` (`details[{field:'status'}]`). Соединяется по И с `upcoming` и компартментом; семантика
`upcoming=true` (`start >= now`) не меняется — без `status` он по-прежнему отдаёт и отменённые записи, поэтому для
«предстоящих активных» нужно `upcoming=true&status=booked`. Поиск идёт токеном `Appointment?status=booked,noshow`.

**6.1 `CreateAppointmentDto`** — плюс заголовок `Idempotency-Key` (§0):

```typescript
// apps/appointment-service/src/modules/appointments/dto/create-appointment.dto.ts
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  slotId: string;      // Slot.status=free (проверка в транзакции, ADR-012)

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;  // по умолчанию — serviceId расписания слота

  @ApiPropertyOptional({ example: 'Болит спина', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;     // Appointment.reasonCode/ReasonReference
}
```

**Транзакция 6.1** (ADR-012): re-read `Slot` c пессимистичной блокировкой → `status=free`?
→ создать `Appointment` (participants: Patient + PractitionerRole; `slot` reference) →
`Slot.status=busy` → publish `appointment.booked.v1` → `AuditEvent(create)` → **201**
`AppointmentResponseDto`. Гонка → **409** `SLOT_CONFLICT`.

**Согласие и `reason` (ADR-019).** Запись разрешена и без согласия на ЭМК; `reason` — свободный текст о здоровье, поэтому без действующего
согласия при `CONSENT_ENFORCEMENT=block` запрос с `reason` → **409** `CONSENT_REQUIRED` (ничего не пишется), при `warn` запись
создаётся без `reason` (предупреждение в журнале сервиса). Поля-подсказки в ответе нет; проверка выполняется только если `reason` передан.

```typescript
// apps/appointment-service/src/modules/appointments/dto/appointment-response.dto.ts
export class AppointmentResponseDto {
  id: string;              // UUID Appointment
  status: 'booked' | 'cancelled' | 'noshow' | 'fulfilled';
  start: string;           // RFC 3339
  end: string;
  slotId: string;
  patientId: string;       // Patient/x
  doctorId: string;        // Practitioner/x
  practitionerRoleId: string;
  serviceId: string;
  reason?: string;
  cancelReason?: string;   // statusReason
  createdAt: string;
}
```

**6.4 `CancelAppointmentDto`:** `{ reason: string (3…500) }` → `statusReason` (BR-002):
отменять может пациент-владелец или ADMIN; врач не отменяет (использует 6.6). Повторная отмена →
409 `APPOINTMENT_NOT_CANCELLABLE`. Publish `appointment.cancelled.v1`, слот → `free`.
**6.6 неявка (BR-008):** `Appointment.status=noshow` ставится только для записи со `status=booked`, у которой **нет**
`Encounter` (`Encounter?appointment=Appointment/{id}`: ни `in-progress`, ни `finished`). Запись не `booked`
(cancelled/noshow/fulfilled) или с приёмом → **409** `ENCOUNTER_STATE_INVALID` (раньше для не-`booked` отвечал `CONFLICT`,
а для записи с завершённым приёмом — 200). Проверка владельца (403 `COMPARTMENT_VIOLATION`) идёт раньше проверки
состояния. Запись приёма, открытого в тот же момент между проверкой и коммитом, 6.6 не видит; такой приём завершить уже
нельзя (7.3 требует `booked`).

**Status:** 201 (6.1) · 200 (6.2–6.6) · 400/401/403/404/409 — §1.

#### 7. `encounter-service` — Приём и клинические данные (FR-010…FR-014, BR-003…BR-005/008/009)

| # | Метод и путь | Назначение | Доступ |
| --- | --- | --- | --- |
| 7.1 | `POST /api/v1/encounters` | открыть приём по booked-записи (врач) | `user/*.write` (DOCTOR) |
| 7.2 | `GET /api/v1/encounters/{id}` | детали приёма | участник / ADMIN |
| 7.3 | `POST /api/v1/encounters/{id}/complete` | завершить приём: диагноз/план/назначения | `user/*.write` (DOCTOR) |
| 7.4 | `GET /api/v1/patients/{id}/history?page=` | история обращений | владелец / DOCTOR (ADMIN → 403) |
| 7.5 | `GET /api/v1/patients/{id}/prescriptions?page=` | назначения (ServiceRequest/MedicationRequest) | владелец / DOCTOR (ADMIN → 403) |
| 7.6 | `GET /api/v1/me/history` | своя история (компартмент) | `patient/*.read` |
| 7.7 | `GET /api/v1/me/prescriptions` | свои назначения (компартмент) | `patient/*.read` |

Элементы истории (7.4/7.6) несут `practitionerRoleId` и `doctorName` (ФИО врача: `Practitioner.name`, фамилия первой; поле опускается, если врача не удалось определить) — имя берётся из того же Bundle (`_include` Encounter→PractitionerRole→Practitioner).

**7.1** — тело `{ appointmentId: UUID }`; проверка BR-008 (запись `booked`), создаётся
`Encounter(status=in-progress, class=AMB)`; `AuditEvent`. **409** `ENCOUNTER_STATE_INVALID`.
Без действующего согласия на ЭМК (3.8, ADR-019) — **409** `CONSENT_REQUIRED` (проверка до записи). Опционально
`emergencyReason: string` (10…500): пациент не может дать согласие, приём открывается без него, и отдельный `AuditEvent`
(`emergency-bypass`) фиксирует причину; согласие оформляется при первой возможности. Тот же параметр — у 7.3.

**7.3 `CompleteEncounterDto`** — одно тело, атомарное оформление приёма (FR-011…FR-014):

```typescript
// apps/encounter-service/src/modules/encounters/dto/complete-encounter.dto.ts
import {
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty,
  IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConditionDto {
  @ApiProperty({ example: 'J06.9' })
  @MatchesICD10()                       // custom-валидатор: ValueSet InternClassificDiseases10
  code: string;                         // МКБ-10 (адапт. МЗ РБ)

  @ApiProperty({ example: 'Острый назофарингит' })
  @IsString() @IsNotEmpty() @MaxLength(500)
  display: string;

  @ApiPropertyOptional({ enum: ['working', 'provisional', 'confirmed'] })
  @IsOptional() @IsIn(['working', 'provisional', 'confirmed'])
  verificationStatus?: 'working' | 'provisional' | 'confirmed';
}

export class ObservationDto {
  @ApiProperty({ example: 'https://fhir.by/CodeSystem/nsi-observations' })
  @IsString() @IsNotEmpty() @MaxLength(255)
  codeSystem: string;

  @ApiProperty({ example: '50849' })
  @IsString() @IsNotEmpty() @MaxLength(50)
  code: string;

  @ApiProperty({ example: 36.6 })
  @IsNumber() @Min(-50) @Max(300)
  value: number;

  @ApiProperty({ example: 'Cel' })
  @IsString() @IsNotEmpty() @MaxLength(20)
  unit: string;                         // UCUM (BR-009), canonical http://unitsofmeasure.org
}

export class ServiceRequestDto {
  @ApiProperty({ example: 'https://fhir.by/CodeSystem/nsi-services' })
  @IsString() @IsNotEmpty() @MaxLength(255)
  codeSystem: string;                   // НСИ ЦИСЗ (ADR-002)

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(50)
  code: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class MedicationRequestDto {
  @ApiProperty({ example: 'J01FA10' })
  @MatchesATC()                         // custom-валидатор: АТХ (BR-009)
  atcCode: string;

  @ApiProperty({ example: '1 таб 3 раза в день после еды' })
  @IsString() @IsNotEmpty() @MinLength(3) @MaxLength(1000)
  dosageText: string;                   // dosageInstruction.text

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class CompleteEncounterDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString() @IsNotEmpty() @MinLength(3) @MaxLength(4000)
  summary: string;                      // ClinicalImpression.summary

  @ApiProperty({ type: [ConditionDto], maxItems: 20 })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => ConditionDto)
  diagnoses: ConditionDto[];            // Condition (category=encounter-diagnosis, BR-004)

  @ApiProperty({ maxLength: 2000 })
  @IsString() @IsNotEmpty() @MinLength(3) @MaxLength(2000)
  recommendations: string;              // CarePlan (рекомендации, FR-013)

  @ApiPropertyOptional({ type: [ObservationDto], maxItems: 50 })
  @IsOptional() @IsArray() @ArrayMaxSize(50)
  @ValidateNested({ each: true }) @Type(() => ObservationDto)
  observations?: ObservationDto[];      // Observation (UCUM, BR-009)

  @ApiPropertyOptional({ type: [ServiceRequestDto], maxItems: 20 })
  @IsOptional() @IsArray() @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => ServiceRequestDto)
  serviceRequests?: ServiceRequestDto[];

  @ApiPropertyOptional({ type: [MedicationRequestDto], maxItems: 20 })
  @IsOptional() @IsArray() @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => MedicationRequestDto)
  medicationRequests?: MedicationRequestDto[];

  @ApiPropertyOptional({ minLength: 10, maxLength: 500 })
  @IsOptional() @IsString() @MinLength(10) @MaxLength(500)
  emergencyReason?: string;             // экстренный обход отсутствующего согласия (ADR-019)
}
```

**Транзакция 7.3** (атомарно; все ресурсы создаются через `fhir-kit-client`, повторная
отправка → 409 `ENCOUNTER_STATE_INVALID`): `Encounter.status=finished` → **`Appointment.status=fulfilled`**
(BR-008) → `ClinicalImpression`
(summary, findings=Condition[]) → `Condition[]` (BR-004) → `CarePlan` (recommendations) →
`Observation[]` (UCUM) → `ServiceRequest[]`/`MedicationRequest[]` (BR-005: ссылки на `Encounter`
и `Condition`) → publish `encounter.completed.v1` → `AuditEvent` (три записи журнала: `update` Encounter,
`update` Appointment, `create` клинических ресурсов). **Status:** 200 с
`EncounterResponseDto { id; status: 'finished'; period: { start; end }; diagnosisCodes: string[] }`.

**`Appointment` → `fulfilled`:** запись приёма переводится в `fulfilled` в **той же** FHIR `transaction` Bundle, что и
клинические ресурсы (ADR-011: истина в HAPI): `PUT Encounter` и `PUT Appointment` несут `If-Match` на версии,
прочитанные до записи (оптимистичная блокировка, как у слота при записи, ADR-012). Если запись за это время изменена
(отмена, неявка) или приём уже завершён конкурентным запросом — вся Bundle откатывается, ответ **409**
`ENCOUNTER_STATE_INVALID`, ничего не сохранено, событие не публикуется. Внешнего контракта ответа это не меняет:
`GET /appointments/{id}` и списки 6.2/6.3/6.5 после завершения приёма отдают `status='fulfilled'`.

**422 `INVALID_ICD10_CODE` / `TERMINOLOGY_NOT_FOUND`** (проверка идёт до любой записи): помимо `detail` (список кодов,
как раньше) ответ несёт `details[{ field, message }]` — по записи на каждое поле запроса с неверным кодом; `field` —
путь в DTO в той же записи, что и у `details[].field` для 400 (`diagnoses.1.code`, `medicationRequests.0.atcCode`,
`observations.0.code`, `observations.0.unit`, `serviceRequests.0.code`), `message` — например
`Z99 is not in ValueSet https://fhir.by/ValueSet/InternClassificDiseases10`. Один и тот же код в нескольких строках
отмечается в каждой; коды вне seed и неизвестные коды сообщаются одним ответом. Тексты грамматических проверок
`@MatchesICD10` / `@MatchesATC` (400 `VALIDATION_ERROR`) имеют вид `<property> must be an ICD-10 code such as J06.9` /
`<property> must be an ATC code such as J01FA10`.

#### 8. `notification-service` — Уведомления (FR-008, KDR-7)

| # | Метод и путь | Назначение | Доступ |
| --- | --- | --- | --- |
| 8.1 | `GET /api/v1/notifications?page=&pageSize=&unread=true` | свои in-app уведомления | Bearer |
| 8.2 | `GET /api/v1/notifications/unread-count` | счётчик (поллинг, ADR-015) | Bearer |
| 8.3 | `POST /api/v1/notifications/{id}/read` | отметить прочитанным | владелец |
| 8.4 | `POST /api/v1/notifications/read-all` | отметить прочитанными все свои непрочитанные (до 200 за вызов), ответ `{ "updated": n }` | владелец |

Потребитель RabbitMQ (`appointment.booked/cancelled.v1`, `encounter.completed.v1`,
`patient.registered.v1` — каталог в §4.4 архитектуры) создаёт `Communication` (recipient=Patient,
sender=Organization) + email-адаптер (A-3). Компартмент: фильтр по `patientRef` из JWT (ADR-013).
Элемент 8.1: `{ id, category, text, sent, read, appointmentId?, encounterId? }` — `appointmentId`/`encounterId`
берутся из `Communication.about` (`Appointment/{id}` у `appointment.*`, `Encounter/{id}` у `encounter.completed.v1`);
у уведомлений, созданных до этого поля, их нет. Время начала в тексте `appointment.booked.v1` — по Минску
(`ДД.ММ.ГГГГ ЧЧ:ММ (время Минска)`). 8.4 пишет одним FHIR `batch` с `If-Match`; изменённое за это время уведомление
остаётся как есть.
**Status:** 200 (8.1, 8.2, 8.4) · 204 (8.3) · 403/404.

#### 9. `analytics-service` — Отчёты и аудит (FR-019, FR-021, ADR-014)

| # | Метод и путь | Назначение | Доступ |
| --- | --- | --- | --- |
| 9.1 | `GET /api/v1/admin/analytics/appointments?from=&to=` | сводка записей (booked/cancelled/noshow) | `ADMIN` |
| 9.2 | `GET /api/v1/admin/analytics/encounters?from=&to=` | сводка приёмов по специальностям | `ADMIN` |
| 9.3 | `GET /api/v1/admin/analytics/services-popularity?from=&to=&top=` | топ услуг | `ADMIN` |
| 9.4 | `GET /api/v1/admin/audit?from=&to=&entity=&userId=&page=` | журнал `AuditEvent` (read-model) | `ADMIN` |

Ответ 9.1–9.3 — `MeasureReport`-производный DTO (группировка `measureScoring`), из read-model
PostgreSQL (worker наполняет по событиям). Ответ 9.4 — `PaginatedResponseDto<AuditEventDto>`:
`{ id; occurredAt; userId; action: 'create'|'update'|'delete'|'read'|'denied'; resourceType; resourceId;
requestId }`. `read` — чтение данных пациента врачом или администратором, `denied` — отказ в нём (ADR-018);
чтение пациентом своей карты в журнал не попадает. **Status:** 200 · 400 (диапазон > 366 дней).

#### 10. Swagger / OpenAPI

- **`@nestjs/swagger` во всех BFF-сервисах.** UI: `/api/docs/<service>` (например,
  `/api/docs/appointment`), JSON: `/api/docs/<service>-json` — маршрутизация Traefik.
  В проде (задел: env `SWAGGER_ENABLED=false`) отключается.
- **Конвенции декораторов** (скилл api-designer): `@ApiTags('<service>')` на контроллере;
  `@ApiOperation({ summary })`; `@ApiBody({ type })`, `@ApiParam`, `@ApiQuery` с
  `DefaultValuePipe`/`ParseIntPipe`; `@ApiResponse` **на каждый** код из §1–§9 (200/201/204,
  400/401/403/404/409/422/429/500); `@ApiBearerAuth()` на защищённых; `@ApiSecurity()`
  не используется (Bearer-only).
- **Типизация:** все контроллеры возвращают DTO (`Promise<XResponseDto>`), strict-типы
  (GOLDEN-PRINCIPLES: без `any`, explicit return types). `PartialType`/`OmitType` для update-DTO.
- **RFC 7807 в Swagger:** глобальный `problemDetails` schema в `main.ts` каждого сервиса
  (`SwaggerModule`), ссылки на errorCode-каталог §1.

#### 11. Bruno-коллекция

`bruno/medcenter-api/` — коллекция по доменам §2–§9 (env: `{{baseUrl}}`, `{{accessToken}}`,
`{{patientRef}}`); скрипты pre-request: PKCE-challenge, обмен code→token (2.1.3); сценарий E2E
«запись → приём → диагноз → назначение» как цепочка запросов §6.1 → §7.1 → §7.3. Файлы коллекции
именуются с префиксом `api-designer-` (политика AGENTS.md) при выгрузке в `tasks/TASK-001/`.

#### 12. Трассируемость FR → эндпоинты

| FR | Эндпоинты (§) | BR/ADR |
| --- | --- | --- |
| FR-001 | 2.1.1–2.1.5, 2.2.6–2.2.7 | KDR-2; JWT/refresh-rotation §2.1 |
| FR-002 | 4.1–4.2, 5.1.1–5.1.2 | — |
| FR-003 | 5.2.8 | индекс `Slot.start/status`, Redis-кэш (NFR-005) |
| FR-004 | 6.1 | BR-001, ADR-012 (409), Idempotency-Key |
| FR-005 | 6.4 | BR-002, `appointment.cancelled.v1` |
| FR-006 | 6.2–6.3, 7.4, 7.6 | ADR-013 (компартмент) |
| FR-007 | 7.5, 7.7 | BR-005 |
| FR-008 | 8.1–8.3 | KDR-7; поллинг 8.2 (ADR-015) |
| FR-009 | 5.2.7, 6.5 | — |
| FR-010 | 7.4 | ADR-013 |
| FR-011 | 7.1, 7.3 | BR-003/BR-008 |
| FR-012 | 7.3 (`diagnoses`) | BR-004, ValueSet МКБ-10 |
| FR-013 | 7.3 (`recommendations`) | — |
| FR-014 | 7.3 (`serviceRequests`/`medicationRequests`) | BR-005, BR-009 (АТХ/UCUM) |
| FR-015 | 2.2.1–2.2.5 | BR-007 |
| FR-016 | 5.1.3–5.1.5 | BR-007 |
| FR-017 | 4.4–4.7 | BR-007, `ROOM_IN_USE` |
| FR-018 | 2.3.1–2.3.4 | ADR-002/016/017 |
| FR-019 | 9.1–9.3 | read-model, ADR-011 |
| FR-020 | 5.2.1–5.2.6 | ADR-015 (horizon ≤ 90 d), `SCHEDULE_OVERLAP` |
| FR-021 | 9.4 | ADR-014; запись — во всех мутирующих операциях и в чтении ПДн (ADR-018) |

**Coverage:** 21/21 FR покрыты эндпоинтами §2–§9; все 9 BR выражены кодами §1 и правилами §5–§7.
