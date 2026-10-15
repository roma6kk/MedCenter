# coder-auth-users-report.md

**Skill:** coder (backend) · **Задача плана:** Task 7 — `auth-service`: вход по паролю (допущение UI-1), пользователи,
`/me`, админский CRUD, аудит, identity-claims, терминология (чтение) · **API:** `specs/api-designer-spec.md` §2.1.2,
§2.2.1–2.2.7, §2.3.1–2.3.3 · **Порт:** 3001 · **Требования:** FR-001, FR-015, FR-018, FR-021 ·
**Дата:** 2026-10-14

> Возобновлённый прогон: предыдущая попытка прервалась по лимиту. Её незакоммиченная работа в
> `apps/auth-service/**` проверена целиком и сохранена: дубликатов модулей нет, незавершённых мест не найдено
> (`TODO`/`FIXME`, `any`, `!`, функции длиннее 30 строк вне Init-миграции, файлы исходного кода длиннее 300 строк; самый длинный — `oauth.service.ts`, 268). В этом
> прогоне заново выполнены все проверки, добавлены прогоны на реальном PostgreSQL и в реальном процессе, сверены
> контракты с фронтендом и Traefik, написан отчёт. Исходный код не менялся: исправлять было нечего.

## Что реализовано

| # | Эндпоинт | Доступ | Реализация |
| --- | --- | --- | --- |
| 2.1.2 | `GET /oauth/authorize` | public, сессия входа | Без сессии отдаёт HTML-форму входа, с сессией выпускает `code`. `AuthorizeController` + `LoginSessionGuard`. |
| UI-1 | `POST /oauth/login` | public, rate-limit 10/мин на IP | `LoginController` → `CredentialsService.verify` → cookie-сессия → `302` на `/oauth/authorize?<исходный запрос>`. |
| 2.2.1 | `POST /api/v1/admin/users` | `ADMIN` + `user/*.write` | `AdminUsersController` → `UsersService.create` → `AccountFactory.create`. |
| 2.2.2 | `GET /api/v1/admin/users?role=&search=&page=&pageSize=` | `ADMIN` + `user/*.read` | `UsersService.list`, конверт `PaginatedResponseDto` (`items` + `meta`). |
| 2.2.3 | `GET /api/v1/admin/users/{id}` | `ADMIN` + `user/*.read` | Карточка + `externalLinks`. |
| 2.2.4 | `PATCH /api/v1/admin/users/{id}` | `ADMIN` + `user/*.write` | `UsersService.update`. |
| 2.2.5 | `DELETE /api/v1/admin/users/{id}` | `ADMIN` + `user/*.write` | Мягкая деактивация `isActive=false`, строка остаётся. |
| 2.2.6 | `POST /api/v1/auth/register` | public, rate-limit 10/мин на IP | `RegistrationService` → `AccountFactory.create`: `User(PATIENT)` + FHIR `Patient` + `ExternalLink` + `patient.registered.v1`. |
| 2.2.7 | `GET /api/v1/me` | любой Bearer | Профиль по `sub` токена + `externalLinks`; параметров нет. |
| 2.3.1 | `GET /api/v1/terminology/value-sets` | `ADMIN` + `user/*.read` | Список ValueSet `https://fhir.by/ValueSet/*` из HAPI. |
| 2.3.2 | `GET /api/v1/terminology/value-sets/{url}/$expand` | `user/*.read` | `$expand` + кэш (Redis, TTL 1 ч). |
| 2.3.3 | `GET /api/v1/terminology/validate?system=&code=` | `user/*.read` | `$validate-code`; пара вне seed — `valid:false`, не ошибка. |
| + | `GET /api/v1/terminology/expand?system=&filter=` | `user/*.read` | Форма, которую зовёт `Icd10Combobox`; фильтр по префиксу кода и подстроке display. |
| — | `GET /health` | `@Public()` | liveness. |

**Не реализовано:** `POST /api/v1/admin/terminology/import` (2.3.4), см. «Отклонения» п. 9.

### Структура `apps/auth-service`

```
src/main.ts                                  Redis для rate-limit, trust proxy, глобальный ValidationPipe
src/app/app.module.ts                        APP_GUARD: JwtAuth → Scope → Role → RateLimit; ProblemDetailsFilter; RequestIdMiddleware
src/config/auth-env.ts                       zod: БД auth, BOOTSTRAP_ADMIN_*, AUTH_SESSION_SECRET, AUTH_COOKIE_SECURE
src/database/                                DataSource без @nestjs/typeorm, миграции Init + RolesAndLinks, запуск миграций на старте
src/modules/oauth/login/                     форма, сессия, CSRF, подписанные cookie (login-page, login-session.service, signed-value…)
src/modules/oauth/identity.ts                IdentityResolver, claims patient/fhirUser, матрица scope по роли
src/modules/oauth/authorize.controller.ts    GET /oauth/authorize
src/modules/users/                           entities, UserStore (порт) + TypeORM-адаптер, AccountFactory, PasswordHasher (scrypt),
                                             CredentialsService, UsersService, RegistrationService, BootstrapAdminService, DTO
src/modules/audit/                           AuditEvent в HAPI (FR-021)
src/modules/terminology/                     чтение ValueSet через HAPI + кэш
src/modules/fhir/                            общий FHIR-клиент (`createFhirClientProvider`)
test/                                        e2e на настоящем AppModule + postgres-flow
```

## Вход по паролю (допущение UI-1)

1. `GET /oauth/authorize` проходит `ClientGuard` (клиент и `redirect_uri` из реестра), `AuthorizePageGuard`
   (`response_type=code`, PKCE `S256`) и `LoginSessionGuard`. Гард только читает сессию и **не отклоняет** запрос:
   нет валидной сессии, значит `principal` не задан, и контроллер рисует форму.
2. Форма: серверный HTML на русском, без скриптов и внешних ресурсов. `email` + `password`, скрытые поля `csrf` и
   `authorize_query` (очищенная копия исходного запроса: только известные параметры, длина не больше 2048).
   `role="alert"` для ошибки, `aria-invalid`/`aria-describedby`, `autocomplete`, видимый фокус, контраст рамки поля 3:1.
   Заголовки: `Content-Security-Policy` (`default-src 'none'`, `style-src 'sha256-…'` по хэшу inline CSS,
   `frame-ancestors 'none'`, `base-uri 'none'`), `Cache-Control: no-store`, `Referrer-Policy: no-referrer`,
   `X-Frame-Options: DENY`. `form-action` намеренно не задан: Chromium применяет его ко всей цепочке редиректов
   (`/oauth/login` → `/oauth/authorize` → `redirect_uri` клиента), и `'self'` заблокировал бы последний переход.
3. **CSRF:** double-submit с подписью. В cookie `mc_as_csrf` (`httpOnly`, `SameSite=Strict`, `Path=/oauth`) лежит
   случайный nonce, в форме его HMAC-SHA256. Ключи cookie-сессии и CSRF выводятся HKDF из `AUTH_SESSION_SECRET`
   (при его отсутствии из `JWT_PRIVATE_KEY`) с разными `info`, поэтому утечка CSRF-токена не помогает подделать сессию.
4. `POST /oauth/login` (`application/x-www-form-urlencoded`): сначала проверяется, что `authorize_query` называет
   зарегистрированного клиента и его `redirect_uri` (иначе страница ошибки без редиректа), затем CSRF, затем пароль.
   Любая неудача (неизвестный email, неверный пароль, деактивированный аккаунт) даёт одну и ту же форму с одним
   сообщением, без раскрытия существования аккаунта. Email возвращается в поле, пароль никогда.
5. Пароль: Node `crypto.scrypt` (N=2^15, r=8, p=1, соль 16 байт на пользователя, ключ 64 байта), сравнение
   `timingSafeEqual`. Хранение самоописывающейся строкой `scrypt$N$r$p$<salt b64url>$<key b64url>` в
   `users.password_hash` (около 130 знаков, колонка `varchar(255)`). При разборе проверяются границы параметров
   (подменённая строка не может заставить выделить гигабайты). Для неизвестного email и неактивного аккаунта
   выполняется такой же scrypt над фиктивным хэшем, поэтому время ответа не выдаёт, какие аккаунты существуют.
   Пароль нормализуется NFKC, длина ограничена 128.
6. Успех: cookie `mc_as_session` (`httpOnly`, `SameSite=Lax`, `Path=/oauth`, `Max-Age=300`, `Secure` по `req.secure`
   или `AUTH_COOKIE_SECURE=true`), подписанная HMAC; `302` на `/oauth/authorize?<исходный запрос>`. Путь редиректа
   зашит в коде, а `redirect_uri` повторно проверяет `ClientGuard`, поэтому открытого редиректа нет.
7. Сессия **одноразовая**: после выпуска кода её `sid` попадает в denylist, повтор той же cookie снова показывает
   форму (проверено на реальном процессе). Деактивированный за это время аккаунт не получит код: `LoginSessionGuard`
   заново резолвит аккаунт из схемы `auth`.
8. Rate-limit: `@RateLimit(10)` на `POST /oauth/login` (ключ `client_id|ip`; тело формы `client_id` не несёт, то есть
   лимит по IP).

## Пользователи, claims, аудит

- **Создание аккаунта** (`AccountFactory`, общий для регистрации, админа и bootstrap): проверка правил роли → проверка
  `PractitionerRole` в HAPI → запись `User` + ролей одной транзакцией → `Patient` в HAPI (для PATIENT) → `ExternalLink`
  → `AuditEvent` → `patient.registered.v1`. Если шаг после записи пользователя падает (HAPI, занятая
  `PractitionerRole`, сбой `ExternalLink`), аккаунт **компенсируется**: `User` удаляется, созданный `Patient`
  удаляется тоже; сбой отката логируется на `error`. Проверено: при недоступном HAPI регистрация отвечает `502`, а
  пользователь не остаётся.
- **Роль при саморегистрации** всегда `PATIENT`; поле `roles` в теле игнорируется (e2e).
- **`Patient` R4:** `identifier` (`https://api.medcenter.by/sid/auth-user` = id пользователя), `name[official]`,
  `telecom[email]`, `birthDate`, `gender`. Ресурс прогнан через `POST /fhir/Patient/$validate` реального HAPI: статус 200,
  только предупреждение `dom-6` (нет narrative).
- **Claims токена** (оба гранта: `authorization_code` и `refresh_token`): `role`, `patient` = голый id Patient (только
  PATIENT), `fhirUser` = `Patient/{id}` (PATIENT) или `PractitionerRole/{id}` (DOCTOR), для ADMIN отсутствует. Данные
  берутся из `ExternalLink` на **каждом** выпуске (`UserIdentityResolver`), а не копируются из сохранённого токена:
  деактивированный аккаунт не обновит сессию (`invalid_grant`), смена роли и новая связь действуют со следующего refresh.
  Это разблокирует no-show врача (`specs/coder-m3-booking-spec.md` §2a).
- **Матрица scope по роли** (API §0): браузерный клиент запрашивает все scope сразу, сервер сужает их до роли
  (PATIENT: `patient/*.read|write`, DOCTOR/ADMIN: `user/*.read|write`, у всех `launch`). Неизвестные клиенту scope
  (например `offline_access`) отбрасываются. Если после сужения ничего не осталось, ответ `invalid_scope`.
- **Админский CRUD:** фильтр `role`, поиск `search` (email/имя/фамилия, `ILIKE` с экранированием `%` и `_`),
  `pageSize` не больше `MAX_PAGE_SIZE`, `page` не больше 1000. DOCTOR привязывается к `practitionerRoleId` (проверка
  существования в HAPI → `404`, занятая роль → `409 PRACTITIONER_ROLE_TAKEN`). `PATCH` синхронизирует ФИО/дату
  рождения/пол в привязанном `Patient`. Защита от самоблокировки: администратор не может деактивировать себя или
  снять с себя `ADMIN` (`409 SELF_LOCKOUT`). `PATIENT` нельзя выдать аккаунту без `Patient`.
- **Аудит (FR-021, ADR-014):** `AuditEvent` пишется при регистрации, создании, `PATCH` и деактивации. Тот же конверт, что
  в appointment-/encounter-service (агент = `sub` токена, `entity` = FHIR-ресурсы, затем аккаунт как System Object и
  `X-Request-Id`), чтобы журнал аналитики читал один формат. Ресурс прогнан через `$validate` HAPI: 200.
- **Bootstrap первого ADMIN:** `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` (пароль по политике). Идемпотентно:
  существующий email не трогается (оператор мог деактивировать его намеренно), гонка двух реплик обрабатывается по
  уникальному индексу. Переменные не заданы, значит пропуск. Половина пары или слабый пароль валит запуск. Пароль не
  логируется.
- **Миграция `1700000000001-RolesAndLinks`** (нужна, так как Init оставил это приложению): сид каталога ролей
  `PATIENT/DOCTOR/ADMIN` (иначе `user_role` нечем заполнять); уникальный индекс `external_link(resource_type,
  resource_id)`: один ресурс принадлежит одному пользователю, иначе второй аккаунт получил бы тот же `fhirUser` и
  действовал бы как этот врач (ADR-013); уникальный индекс `lower(email)`. Всё идемпотентно, есть `down`.
  Миграции применяются на старте (`runMigrations`), `synchronize` выключен.

## Отклонения и решения

1. **`EMAIL_TAKEN`.** Спека: «409 (`VALIDATION_ERROR` → код `EMAIL_TAKEN` в `detail`)». В каталоге `VALIDATION_ERROR` = 400,
   поэтому ответ `409` с `errorCode: CONFLICT` и `detail: "EMAIL_TAKEN: …"`. Те же правила для `PRACTITIONER_ROLE_TAKEN`
   и `SELF_LOCKOUT`. Значения `errorCode` только из `ERROR_CODES`.
2. **`DELETE` отвечает `200` с деактивированной карточкой**, а не `204`: так клиент сразу видит `isActive=false`.
3. **`AuditEvent` пишется после коммита и не откатывает изменение.** Запись в PostgreSQL и в HAPI не делят транзакцию
   (в отличие от appointment-service, где `AuditEvent` едет в том же `transaction`-Bundle). Сбой HAPI логируется на `error`
   с `userId`, `event`, `requestId`. Откат из-за недоступного аудита оставил бы отозванного пользователя активным, и
   это хуже пропущенной записи. Для аудита без пропусков нужен transactional outbox.
4. **`patient.registered.v1`: без outbox.** Сбой брокера логируется и не пробрасывается: ответ 5xx на уже созданный
   аккаунт вызвал бы повтор, который закончится `409 EMAIL_TAKEN`. Брокер подключается лениво (сервис стартует без него).
5. **Claim `patient` и поле `patient` ответа `/oauth/token` — голый id**, а не `Patient/{id}`, как в примере API §2.1.3.
   Побеждает контракт между сервисами (`resolvePatientRef`, `requirePatientRef`). Расхождение спеки с её же контрактом
   стоит поправить в `api-designer-spec.md`.
6. **`UpdateUserDto` записан явно**, без `PartialType(OmitType(...))`: `@nestjs/mapped-types` и `@nestjs/swagger` не
   установлены (npm install запрещён), поэтому Swagger-декораторов в DTO нет. Дополнительно к спеке: `email`,
   `birthDate`, `gender` и `practitionerRoleId` (требование задачи).
7. **Хэш пароля: scrypt, не bcrypt.** План Task 7 называл bcrypt, задача требует Node `crypto.scrypt`; новых зависимостей нет.
8. **Нет SSO-сессии.** Сессия входа живёт 5 минут и одноразовая, поэтому после выхода из приложения следующий вход
   снова запрашивает пароль. Для медицинского клиента это осознанный выбор.
9. **`POST /api/v1/admin/terminology/import` (2.3.4) не реализован.** Импортёр снапшота НСИ (ADR-016) — это CLI
   `tools/terminology-seed` (`npm run seed:terminology`): он публикует версионированный снапшот в HAPI. Снапшот и код
   импортёра лежат вне образа сервиса (Dockerfile копирует только `apps/${APP}` и `libs`), и `libs/` общий. Дублировать
   их в auth-service или имитировать импорт проверкой `$expand` было бы неправдой. Маршрут Traefik `/api/v1/admin/terminology`
   ведёт сюда, поэтому сейчас ответ `404 NOT_FOUND`. Чтобы закрыть пункт, нужно решение владельца: вынести импортёр в
   `libs/` или запускать его отдельным job-контейнером.
10. **`@nestjs/typeorm` не используется** (ESM, не грузится CJS-конвейером Jest): один `DataSource` за портом
    `USER_STORE`. TypeORM-адаптер и in-memory реализация проходят общий контракт двух ошибок уникальности.

## Расхождения с фронтендом

- `frontend/src/components/admin/terminology-import-panel.tsx` шлёт `POST /api/v1/admin/terminology/import` с телом `{}`
  и ждёт `202`/`409`. Спека требует `{ "snapshotVersion": "…" }`, а эндпоинт не реализован (отклонение 9): панель получит
  `404`. Когда эндпоинт появится, `snapshotVersion` стоит сделать необязательным.
- `frontend/src/app/(auth)/register`: на `409 EMAIL_TAKEN` приходит `errorCode: CONFLICT`, который `errorCodeMap` показывает
  общим баннером (`banner-generic`) с `detail` («EMAIL_TAKEN: a user with this email already exists»). Отдельной
  подсказки у поля email нет.
- Форма регистрации не отправляет `gender`: поле необязательное, конфликта нет.
- `UserRow` (`users-table.tsx`) ждёт `name`, `role`, `isActive`: `UserResponseDto` содержит их как аддитивные поля
  (`name` = «Фамилия Имя», `role` = старшая роль). Форма `PaginatedResponseDto` (`items` + `meta`) совпадает.
- `app/api/auth/authorize/route.ts` запрашивает `offline_access`: клиенту он не выдан и молча отбрасывается, на поток не влияет.
  Дефолт `AUTH_BACKEND_URL` в route-файлах (`http://auth-service:3000`) указывает на внутренний хост и порт 3000;
  в `docker-compose.yml` переменная переопределена на `http://medcenter.localhost:8081`, поэтому поток работает.
- Фронтенд не читает `patient` из ответа `/oauth/token`: берёт claim из JWT. Фронтенд не менялся.

## Найдено, но не изменено

- **Хранилище токенов OAuth в памяти** (`InMemoryTokenStore`, `InMemoryTokenDenylist`, Task 6): после перезапуска
  контейнера refresh-токены, denylist и список потреблённых сессий входа теряются (все входят заново), а при двух
  репликах denylist не общий. Таблица `auth.oauth_token` и Redis в схеме есть, но вне задачи.
- **Нет блокировки по аккаунту:** лимит 10/мин на IP защищает от перебора с одного адреса, но не от распределённого
  перебора одного пароля. Нужен счётчик неудач по `userId` (Redis).
- `.env.example` (общий файл, недоступен этому прогону) стоит дополнить: `BOOTSTRAP_ADMIN_EMAIL`,
  `BOOTSTRAP_ADMIN_PASSWORD`, при желании `AUTH_SESSION_SECRET` (иначе используется `JWT_PRIVATE_KEY`). Compose отдаёт
  auth-service весь `.env` через `env_file`, дополнительной правки `docker-compose.yml` не требуется.
- Общие файлы не менялись.

## Verification evidence (DOD Standard)

| Проверка | Команда | Результат |
| --- | --- | --- |
| Unit | `npx nx test auth-service --maxWorkers=2 --skip-nx-cache` | ✅ `Test Suites: 2 skipped, 39 passed, 39 of 41 total` · `Tests: 12 skipped, 353 passed, 365 total` (2 пропущенных набора — интеграционные на PostgreSQL, пропускаются без `TEST_PG_*`) |
| Unit + PostgreSQL | `jest -c apps/auth-service/jest.config.ts` с `TEST_PG_*` на postgres:16 | ✅ `Test Suites: 41 passed, 41 total` · `Tests: 365 passed, 365 total` |
| E2E | `npx nx e2e auth-service --skip-nx-cache --maxWorkers=2` | ✅ `Test Suites: 1 skipped, 7 passed, 7 of 8 total` · `Tests: 5 skipped, 99 passed, 104 total` |
| E2E + PostgreSQL | `jest -c apps/auth-service/jest.e2e.config.ts` с `TEST_PG_*` | ✅ `Test Suites: 8 passed, 8 total` · `Tests: 104 passed, 104 total` |
| Lint | `npx nx lint auth-service --skip-nx-cache` | ✅ `All files pass linting` |
| Typecheck | `npx tsc --noEmit -p apps/auth-service/tsconfig.app.json` и `…/tsconfig.spec.json` | ✅ exit 0 / exit 0 |
| Build | `npx nx build auth-service --skip-nx-cache` | ✅ `Successfully ran target build for project auth-service and 6 tasks it depends on` |
| Реальный HAPI | `POST /fhir/Patient/$validate`, `POST /fhir/AuditEvent/$validate` на собранных функциях `buildPatient`/`buildUserAuditEvent` | ✅ HTTP 200, только предупреждения (`dom-6`; код `XrequestId` вне ValueSet `audit-entity-type`, как у других сервисов) |
| Реальный процесс | собранный `dist/apps/auth-service/src/main.js` на одноразовой БД PostgreSQL + `curl` | ✅ см. ниже; процесс остановлен, БД удалена |

**Прогон в реальном процессе** (собранный сервис, миграции на пустой БД, bootstrap ADMIN, настоящая RS256-подпись и
JWKS-проверка гардом; HAPI, Redis и RabbitMQ намеренно недоступны, чтобы не писать в общий dev-стек):
форма входа `200` с CSP/`no-store`/cookie CSRF → неверный пароль и неизвестный email дают `200` и одинаковое
сообщение → верный пароль `302` с cookie `HttpOnly; SameSite=Lax; Path=/oauth` → `GET /oauth/authorize` `302` с `code` и
`state` → повтор той же cookie возвращает форму (одноразовость) → `/oauth/token` `200`
(`role=ADMIN`, `scope=launch user/*.read user/*.write`, без `patient`/`fhirUser`) → `/api/v1/me` `200` →
`/api/v1/admin/users` `200` → регистрация при недоступном HAPI `502 INTERNAL`, пользователь не остался →
refresh `200` → `/api/v1/me` без токена `401`.

## Покрытие тестами

- `oauth/login/*.spec.ts`: форма (экранирование, CSP по хэшу, русские подписи), сессия (подпись, срок, одноразовость,
  подделка), CSRF, `authorize-query` (белый список параметров), контроллер (успех, неверные данные, устаревшая форма).
- `oauth/identity.spec.ts`, `oauth.service.identity.spec.ts`: claims по роли, сужение scope, отказ деактивированному.
- `users/password-hasher.spec.ts`, `identity-and-credentials.spec.ts`: scrypt (формат, соль, границы параметров, фиктивный хэш).
- `users/users.service.spec.ts`, `registration.service.spec.ts`, `patient-provisioner.spec.ts`: тесты плана Task 7
  (`EMAIL_TAKEN`, создание `Patient`, мягкая деактивация), компенсация, самоблокировка, правила ролей.
- `users/store/typeorm-user.store.spec.ts`, `repositories/*.spec.ts`, `database/**/*.spec.ts`, миграции: реальный
  PostgreSQL (уникальность, каскады, `ILIKE`-поиск, upsert связи).
- `config/auth-env.spec.ts`, `audit/audit.service.spec.ts`, `terminology/*.spec.ts`.
- e2e: `login-flow` (17 сценариев: claims из `ExternalLink`, refresh, cookie, одноразовость, PKCE, CSRF, enumeration,
  rate-limit 429), `users` (регистрация, `409`, слабый пароль, `roles` в теле игнорируется, компенсация, `/me`,
  периметр), `admin-users` (CRUD, DOCTOR + `fhirUser`, `PractitionerRole` занята/не найдена, пагинация/поиск, `SELF_LOCKOUT`,
  деактивированный не обновляет сессию), `terminology`, `postgres-flow` (первый запуск стека на PostgreSQL),
  `oauth`, `jwt-perimeter`, `rate-limit-proxy`.

## Конфигурация сервиса

| Переменная | Назначение |
| --- | --- |
| `AUTH_DB_HOST/PORT/USER/PASSWORD/NAME` | подключение к схеме `auth`; запасной вариант `DB_*`, затем `POSTGRES_*` |
| `AUTH_SESSION_SECRET` | ключевой материал cookie сессии и CSRF (не короче 32 знаков); запасной вариант `JWT_PRIVATE_KEY` |
| `AUTH_COOKIE_SECURE` | `true` принудительно ставит `Secure`; иначе решает `req.secure` (нужен `TRUST_PROXY=1` за Traefik) |
| `BOOTSTRAP_ADMIN_EMAIL/PASSWORD` (+`_FIRST_NAME/_LAST_NAME`) | первый администратор, пропускается без пары |
| `OAUTH_CLIENTS_JSON` | реестр клиентов и их `redirect_uri` |

Секреты только из окружения, значений по умолчанию нет. `.env` не читался.

## Fixes по `code-reviewer-auth-c1-report.md` (раунд 1)

> Прогон возобновлён после двух прерванных попыток (лимит использования, затем выход процесса). Их незавершённая
> работа в `apps/auth-service/**` осмотрена целиком, оставлена там, где верна, и доведена до конца; дубликатов модулей
> нет. Общие файлы **не менялись**: `libs/common/src/lib/guards/rate-limit.guard.ts` не тронут (см. C-1), тесты
> `libs/common` прогнаны как контроль. Утверждения ниже о «ранее не закрытом» в разделе «Найдено, но не изменено»
> (блокировка по аккаунту) устарели: пробел закрыт (m-1).

### Critical

**C-1. Лимит входа и регистрации обходился подменой `client_id` в теле — исправлено.**
Репро ревьюера подтверждено (30 из 30 попыток без `429`). Причина лежит в общем `RateLimitGuard`: ключ анонимного
запроса `${body.client_id}|${ip}` разумен только там, где `client_id` проверяется до секретов (`POST /oauth/token`),
а `POST /oauth/login` и `POST /api/v1/auth/register` его не читают. Правку общего файла не делал: общий guard
остаётся прежним для остальных сервисов, а исправление выполнено в пределах owned paths и закрывает больше, чем
один путь обхода.

- `app/credential-route.middleware.ts` (+ spec): `pinCredentialRouteBucket(route)` выполняется **до** `APP_GUARD`,
  удаляет `client_id` из тела и подменяет `originalUrl` каноническим путём. Подключён в `AppModule.configure` только для
  `POST /oauth/login` и `POST /api/v1/auth/register`. Тем же ходом закрыт второй обход: Express маршрутизирует
  `/OAuth/Login/` и `/oauth/login?n=2` на тот же обработчик, но под другим ключом (регистр, косая черта в конце).
  Ключ бакета теперь состоит только из адреса клиента (`trust proxy`, `main.ts`) и фиксированного маршрута.
  `POST /oauth/token` и остальные сервисы работают как раньше.
- `LoginRateLimitFilter` (+ spec): `429` от per-IP лимита `POST /oauth/login` отдаётся страницей формы с сообщением и
  `Retry-After`, а не JSON-проблемой (браузерная форма); остальные `HttpException` маршрута идут через общий
  `ProblemDetailsFilter`.
- Тесты: `test/credential-rate-limit.e2e-spec.ts` на настоящем `AppModule` и настоящем guard-стеке: ротация `client_id`
  на логине (`429` на 11-й попытке, страница формы, `Retry-After`) и на регистрации (10 × `201`, затем 5 × `429`),
  варианты написания маршрута (`/OAuth/Login`, `/oauth/login/`, `/OAUTH/LOGIN/?n=3`) делят один бакет.
  Unit: `credential-route.middleware.spec.ts`, `login-rate-limit.filter.spec.ts`.
- **Доказательство, что тесты ловят дефект:** с обезвреженным middleware тот же прогон
  `credential-rate-limit.e2e-spec.ts` даёт `5 failed, 6 passed` (ротация на логине и регистрации, `/OAuth/Login`,
  `/oauth/login/`, `/OAUTH/LOGIN/?n=3`); после восстановления все 11 зелёные.
- Замечание в `login-flow.e2e-spec.ts` (`should answer 429 … once one client address exceeds its login budget`):
  тест падал с «слишком ранним» `429`, потому что слал все попытки с одним email и упирался в per-account счётчик
  (10 за 15 минут), а не в per-IP. Тест теперь шлёт по одному email на попытку, так что срабатывает именно лимит адреса;
  в коде сервиса дефекта не было.

### Major

**M-1. `PATCH /api/v1/admin/users/{id}` не был атомарным — исправлено.** Репро подтверждено (роль/имя остаются после `409`,
`AuditEvent` нет). Теперь запрос «всё или ничего»:

- `UserStore.update(id, changes)` применяет поля, роли **и привязку `PractitionerRole`** одной транзакцией
  (`TypeOrmUserStore` и `InMemoryUserStore` по одному контракту); `DuplicateEmailError`/`ResourceAlreadyLinkedError`
  означают, что ничего не изменилось. `users.service.ts#update` → `409` без побочных эффектов.
- Порядок: проверки (`assertUpdatable`, свободен ли email, существует ли `PractitionerRole` в HAPI) → транзакция в `auth`
  → синхронизация `Patient` → `AuditEvent`. Если HAPI отказал при синхронизации, изменение откатывается обратным
  `UserChanges` (`inverseOf`), клиент получает ошибку HAPI, состояние не изменилось. Если откат тоже не удался, пишется
  `AuditEvent` с `outcome` `8` и причиной в `outcomeDesc`, в логе — ошибка. Каждое **оставшееся** изменение имеет `AuditEvent`.
- Новое: `user-changes.ts` (`changesOf`/`demographicsOf`/`inverseOf`, + spec), `user-links.ts`, `user-errors.ts`.
- Тесты: `users.service.update.spec.ts` (`409` по занятой роли не меняет роли/имя/журнал и не трогает HAPI; гонка по email;
  откат при отказе HAPI; журнал при неудавшемся откате; нет вызова HAPI без полей `Patient`; один `AuditEvent` на коммит),
  `test/admin-users.e2e-spec.ts` («PATCH atomicity and PractitionerRole release»: `409` без следов, `502` при отказе HAPI
  с сохранением состояния), `typeorm-user.store.spec.ts` (атомарность на PostgreSQL, пропускается без `TEST_PG_*`).

### Minor

- **m-1. По-аккаунтный лимит и fail-closed — исправлено.** `LoginThrottle` (`login-throttle.service.ts`) считает каждую
  попытку **до** проверки пароля (в том числе для несуществующих email): 10 попыток за 15 минут на аккаунт, счётчик по
  SHA-256 нормализованного email, `429` с `Retry-After`; успешный вход сбрасывает счётчик. Хранилище (`LoginAttemptStore`):
  Redis (атомарный Lua `INCR`+`EXPIRE`) при `REDIS_URL`, в памяти без него; недоступный счётчик даёт `503` страницей формы,
  а не пропуск попытки. Принятый компромисс (в README и коде): знающий email может держать форму входа аккаунта закрытой на
  окно. Остаётся: общий `RateLimitGuard` по-прежнему fail-open при падении Redis, из-за чего регистрация без Redis ограничена
  только per-IP счётчиком процесса, которого у неё нет; сам guard — общий файл и не менялся.
- **m-2. `If-Match` для `Patient` — исправлено.** `PatientProvisioner.updateDemographics` читает `Patient` и пишет через
  `fhir/versioned-update.ts#updateIfUnchanged`: transaction Bundle с `request.ifMatch = W/"versionId"` (принятый паттерн
  проекта, ADR-012); гонка с patient-service даёт `409 CONFLICT`, ничего не пишется (и аккаунт откатывается, см. M-1).
- **m-3. Email доходит до `Patient.telecom` — исправлено.** `PatientDemographicsChange.email` заменяет запись `home` email
  (или добавляет её), остальные контакты сохраняются (`applyDemographics`, `patient-provisioner.spec.ts`,
  `users.service.update.spec.ts`).
- **m-4. `PractitionerRole` можно освободить — исправлено.** `PATCH { practitionerRoleId: null }` освобождает привязку;
  снятие роли `DOCTOR` освобождает её неявно (`practitionerRoleChange` в `user-changes.ts`); освобождённая роль называется в
  `AuditEvent`; после освобождения новые токены без `fhirUser`, а ту же роль можно отдать следующему врачу (e2e).
  Привязывать роль не-врачу по-прежнему `400`.
- **m-5. Деактивация не обрывает живой access-токен — ограничение задокументировано, не снято.** Refresh и новые коды после
  деактивации закрыты (`invalid_grant`, e2e), access-токен живёт до 15 минут (`ACCESS_TOKEN_TTL_SECONDS`). Denylist по `sub`
  потребовал бы общего хранилища токенов (оно в памяти, Task 6) и правки общего `JwtAuthGuard`; вне owned paths.
  Ограничение занесено в `README.md` («Known limit»).
- **m-6. Осиротевший `Patient` при таймауте HAPI — исправлено.** `PatientProvisioner.removeCreatedFor(userId)` ищет `Patient` по
  `identifier=…auth-user|{userId}` и удаляет найденное; `AccountFactory` зовёт его в компенсации, когда `create` закончился
  неоднозначно и `patientId` неизвестен (unit-тесты фабрики и провизионера).
- **m-7. `Cache-Control: no-store` — исправлено.** `NoStoreInterceptor` на `AccountController` (`/auth/register`, `/me`) и на
  `AdminUsersController` (весь CRUD); e2e `should mark admin responses Cache-Control no-store…`.
- **m-8. Импорт терминологии и `SIGTERM` — исправлено.** `RedisImportLock.onModuleDestroy` освобождает удерживаемые аренды
  до закрытия соединения (импорт умирает вместе с процессом, а аренда иначе держала бы `409 IMPORT_RUNNING` до 30 минут);
  `main.ts` вызывает `enableShutdownHooks()` (`import-lock.spec.ts`).
- **m-9. `HAPI 400` из `$expand` больше не маскируется — исправлено.** `terminology.service.ts` трактует «неизвестный
  ValueSet/код» только по `404`/`422`; `400` и недоступность HAPI пробрасываются (`500 INTERNAL`/ошибка клиента), `validate`
  не превращает их в `valid:false` (тесты в `terminology.service.spec.ts`, `terminology.service.validate.spec.ts`).

### Nit

- **n-1.** Удалён мёртвый код: `users/repositories/user.repository.ts` и два его spec (после `TypeOrmUserStore` класс нигде не
  используется), ссылки в `README.md` и комментарии обновлены; `buildTestDataSource` стал псевдонимом `buildDataSource`;
  `refs` заменён общим `linkedRefs` (`user-links.ts`).
- **n-2.** Комментарий контроллера терминологии приведён в соответствие с `Cache-Control: private, max-age=300`.
- **n-3.** `isCookieSecureForced` разбирает env заново только при смене значения (мемоизация по тексту переменной).
- **n-4.** Сущность `Patient/{id}` в `AuditEvent` получает `role` (object-role `1`), как у appointment-service.
- **n-5.** `down()` миграции `1700000000001` больше не удаляет справочник ролей (каскадом ушли бы все `user_role`), только оба
  индекса; тест `should keep the seeded roles when down() runs…`. Усечение поиска по фильтру на 10 000 понятий теперь
  пишет предупреждение в лог (тест), сам предел оставлен.
- Дополнительно (правила стиля `GOLDEN-PRINCIPLES`): `LoginController.login` сокращён до 21 строки (проверка CSRF и
  по-аккаунтный счётчик вынесены в `refusalOf`); `users.service.spec.ts` (377 строк) и `terminology.service.spec.ts`
  (322 строки) разбиты на файлы ≤ 300 строк (`users.service.update.spec.ts`, `terminology.service.validate.spec.ts`,
  общие фикстуры `users/__tests__/users-fixtures.ts`, `terminology/__tests__/terminology-fixtures.ts`).

### Verification evidence (после исправлений)

| Проверка | Команда | Результат |
| --- | --- | --- |
| Unit | `npx nx test auth-service --maxWorkers=2 --skip-nx-cache` | ✅ `Test Suites: 1 skipped, 54 passed, 54 of 55 total` · `Tests: 14 skipped, 512 passed, 526 total` (пропущен интеграционный набор на PostgreSQL без `TEST_PG_*`) |
| E2E | `npx nx e2e auth-service --skip-nx-cache --maxWorkers=2` | ✅ `Test Suites: 1 skipped, 9 passed, 9 of 10 total` · `Tests: 5 skipped, 130 passed, 135 total` (пропущен `postgres-flow`) |
| Регрессия C-1 | `credential-rate-limit.e2e-spec.ts` с обезвреженным middleware | ✅ тесты ловят дефект: `5 failed, 6 passed`; с middleware `11 passed` |
| Lint | `npx nx lint auth-service --skip-nx-cache` | ✅ `All files pass linting` |
| Typecheck | `npx tsc --noEmit -p apps/auth-service/tsconfig.app.json` и `…/tsconfig.spec.json` (включает `test/**/*.e2e-spec.ts`) | ✅ exit 0 / exit 0 |
| Build | `npx nx build auth-service --skip-nx-cache` | ✅ `Successfully ran target build for project auth-service and 6 tasks it depends on` |
| Контроль общей библиотеки | `npx nx test common --maxWorkers=2 --skip-nx-cache` | ✅ `Test Suites: 11 passed` · `Tests: 86 passed` (`rate-limit.guard.ts` не менялся) |
| Стиль | AST-скан функций > 30 строк в `src` без тестов, файлы > 300 строк | ✅ единственное превышение — `up` миграции `Init` (60 строк, код не из этого изменения); тестовые файлы > 300 строк остались только `oauth.e2e-spec.ts` (609, было 613 в `HEAD`) и `oauth.service.spec.ts` (365, было 399) |
| Unit + PostgreSQL | `jest -c apps/auth-service/jest.config.ts` с `TEST_PG_*` на одноразовом `postgres:16-alpine` | ✅ `Test Suites: 55 passed, 55 total` · `Tests: 526 passed, 526 total` (включая `typeorm-user.store.spec.ts`: откат роли/полей при занятой `PractitionerRole`, откат связи при занятом email, освобождение связи) |
| E2E + PostgreSQL | `jest -c apps/auth-service/jest.e2e.config.ts` с `TEST_PG_*` | ✅ `Test Suites: 10 passed, 10 total` · `Tests: 135 passed, 135 total` (включая `postgres-flow`) |

Одноразовый контейнер PostgreSQL (локальный образ `postgres:16-alpine`, пароль сгенерирован для прогона) удалён после проверок.
