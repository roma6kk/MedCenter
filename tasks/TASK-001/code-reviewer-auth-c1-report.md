# Code Review — `auth-service` (Task 7: вход по паролю, пользователи, терминология), раунд 1, повторный проход после исправлений

- **Ревьюер:** code-reviewer skill
- **Дата:** 2026-10-14
- **Ветка:** `feature/clinic-platform-wip` (незакоммиченные изменения в `apps/auth-service/**`, новые файлы untracked)
- **Что это.** Файл заменяет первый проход этого раунда (REQUEST CHANGES: C-1, M-1, 9 minor, 5 nit). Кодер исправил
  замечания и дописал разделы «Fixes» в `coder-auth-users-report.md` и `coder-auth-terminology-report.md`. Здесь —
  независимая проверка исправлений и повторный обход изменённого кода.
- **Scope:** весь `apps/auth-service/**` (≈ 16 400 строк вместе с тестами), приоритет — файлы, изменённые после
  первого прохода (`credential-route.middleware`, `login-throttle`/`login-attempt-store`, `users.service`,
  `user-changes`, `typeorm-user.store`, `patient-provisioner`, `versioned-update`, терминология, README). Общие файлы
  (`libs/*`, `infra/*`, `package.json`) не менялись (`sharedChanges: []` подтверждён; diff в `libs/common/src/index.ts`,
  `libs/common/src/lib/http/`, `libs/contracts/.../error-code.ts` принадлежит другим агентам).
- **Источники истины:** `writing-plans-plan.md` Task 7, `api-designer-spec.md` §0/§1/§2.1–2.3, `architect-architecture.md`
  (ADR-009/013/014/016), `libs/contracts`, `frontend/src/lib/contracts.ts`, `.claude/GOLDEN-PRINCIPLES.md`.
- **DOD tier:** Standard

## Вердикт

**APPROVE.** Critical и major замечаний нет. C-1 и M-1 закрыты и подтверждены собственными репро ревьюера (ниже), а не
только отчётом кодера. Остались 4 minor и 5 nit; ни одно не блокирует слияние, но m-1 (значение `null` в DTO
админского API) стоит поправить до выхода в эксплуатацию.

| Severity | Кол-во |
| --- | --- |
| Critical | 0 |
| Major | 0 |
| Minor | 4 |
| Nit | 5 |

## Verification evidence

| Проверка | Команда / способ | Результат |
| --- | --- | --- |
| Unit | `npx nx test auth-service --maxWorkers=2 --skip-nx-cache` | ✅ `Test Suites: 1 skipped, 54 passed, 54 of 55` · `Tests: 14 skipped, 512 passed, 526 total` (пропущен только интеграционный набор на PostgreSQL) |
| E2E | `npx nx e2e auth-service --skip-nx-cache --maxWorkers=2` | ✅ `Test Suites: 1 skipped, 9 passed, 9 of 10` · `Tests: 5 skipped, 130 passed, 135 total` (пропущен `postgres-flow`) |
| Unit + PostgreSQL | те же команды с `TEST_PG_*` на одноразовом PostgreSQL 17 (локальные бинарники, каталог в scratchpad, порт 55999, остановлен после прогона) | ✅ unit `55 passed, 526 passed` (включая `typeorm-user.store.spec.ts`: откат ролей/полей при занятой `PractitionerRole`, откат связи при занятом email) · e2e `10 passed, 135 passed` (включая `postgres-flow`) |
| Lint | `npx nx lint auth-service --skip-nx-cache` | ✅ `All files pass linting` |
| Typecheck | `node_modules/.bin/tsc --noEmit -p apps/auth-service/tsconfig.app.json` и `…/tsconfig.spec.json` | ✅ exit 0 / exit 0 (`npx tsc` подхватывает другую версию компилятора и ругается на `baseUrl` в `tsconfig.spec.json`; для проекта это не дефект) |
| Контроль общей библиотеки | `npx nx test common --maxWorkers=2 --skip-nx-cache` | ✅ `11 suites, 86 passed` (`rate-limit.guard.ts` не менялся) |
| Стиль | AST-скан: функции > 30 строк, файлы > 300 строк, `any`, `!`, `eslint-disable`/`@ts-ignore`/`TODO`; имена `it(...)` | ✅ в `src` без тестов превышений нет, кроме `up` миграции `Init` (60 строк, код не из этого изменения); `any`/`!` нет; все `it` начинаются с `should`. Тестовые файлы > 300 строк: `oauth.e2e-spec.ts` (610, было 613 в `HEAD`), `oauth.service.spec.ts` (366, было 399); тестовые хелперы > 30 строк см. n-5 |
| Belgian-термины | grep `Belg|NIHDI|MyCareNet|eHealth` по `src`, `test`, `README.md` | ✅ нет |
| Репро C-1 (исправление) | одноразовый e2e вне репозитория (scratchpad) на настоящем `AppModule`, JSON-тело с ротацией `client_id`, `?client_id=` в query, разные email | ✅ 10 × `200`, затем 4 × `429` |
| Мутация C-1 | тот же e2e, `AppModule.prototype.configure` подменён так, что `pinCredentialRouteBucket` не подключается | ✅ тест ловит дефект: 14 × `200`, ни одного `429` |
| Репро M-1 | unit/e2e и PostgreSQL-тесты кодера (читал и запускал) | ✅ `409` по занятой роли не меняет роли/имя/журнал; откат при отказе HAPI; журнал при неудачном откате |
| Репро m-1 (новое) | одноразовый e2e на настоящем `AppModule`, `PATCH {поле: null}`, in-memory и PostgreSQL | ❌ воспроизведено, см. m-1 |

## Статус замечаний первого прохода

| # | Замечание | Статус | Проверка |
| --- | --- | --- | --- |
| C-1 | Лимит входа/регистрации обходится `client_id` в теле | **Закрыто** | `credential-route.middleware.ts` + `AppModule.configure`, per-account `LoginThrottle`; репро и мутация выше |
| M-1 | `PATCH /admin/users/{id}` не атомарен | **Закрыто** | одна транзакция `UserStore.update` (поля, роли, `PractitionerRole`), откат при отказе HAPI, `AuditEvent` на каждое оставшееся изменение; тесты на PostgreSQL зелёные |
| m-1 | Нет per-account лимита, Redis-сбой отключает лимит | Закрыто (с оговоркой m-3, m-4 ниже) | `LoginThrottle` fail-closed (`503`), Lua `INCR`+`EXPIRE` |
| m-2 | `Patient` без `If-Match` | Закрыто | `fhir/versioned-update.ts`: transaction Bundle с `request.ifMatch = W/"versionId"`, `412 → 409 CONFLICT` по `fhir-client.provider.ts:264` |
| m-3 | email не доходит до `Patient.telecom` | Закрыто | `applyDemographics` / `withHomeEmail` |
| m-4 | `PractitionerRole` нельзя освободить | Закрыто | `practitionerRoleId: null` и неявное освобождение при снятии `DOCTOR` |
| m-5 | Деактивация не обрывает access-токен | Принято как известное ограничение | README «Known limit» (15 минут); denylist по `sub` вне owned paths |
| m-6 | Осиротевший `Patient` при таймауте HAPI | Закрыто | `removeCreatedFor` по `identifier`, вызывается при `upstreamStatus === undefined` |
| m-7 | Нет `Cache-Control: no-store` | Закрыто | `NoStoreInterceptor` на обоих контроллерах |
| m-8 | Аренда импорта не освобождается при SIGTERM | Закрыто | `RedisImportLock.onModuleDestroy`, `enableShutdownHooks()` в `main.ts` |
| m-9 | HAPI `400` маскируется под `404` | Закрыто | `UNKNOWN_UPSTREAM_STATUSES = {404, 422}` |
| n-1…n-5 | мёртвый код, комментарий, memo, `role` у `Patient`, `down()` миграции | Закрыто | `UserRepository` удалён, `down()` не удаляет роли, есть `role` object-role `1` |

## Critical

Нет.

## Major

Нет.

## Minor

### m-1. `@IsOptional()` пропускает JSON `null` во всех необязательных полях `CreateUserDto`/`UpdateUserDto`

- **Файлы:** `apps/auth-service/src/modules/users/dto/update-user.dto.ts:28-67` (все поля), `dto/create-user.dto.ts:61-73`,
  `user-changes.ts:25-40`, `account-rules.ts:19`, `account-factory.service.ts:130`.
- **Суть.** `@IsOptional()` в `class-validator` считает необязательным и `undefined`, и `null`, поэтому `null` проходит
  валидацию, а сервис ветвится по `!== undefined` и принимает `null` за значение.
- **Воспроизведение** (одноразовый e2e вне репозитория, настоящий `AppModule`, `PATCH /api/v1/admin/users/{id}` от ADMIN):

  | Тело | in-memory (e2e кодера) | PostgreSQL |
  | --- | --- | --- |
  | `{ "email": null }` | `500 INTERNAL` (`TypeError: reading 'trim'`) | `500 INTERNAL` |
  | `{ "roles": null }` | `500 INTERNAL` (`TypeError: reading 'includes'`) | `500 INTERNAL` |
  | `{ "isActive": null }` | **`200`, `isActive = null`** | `500 INTERNAL` (NOT NULL `is_active`), аккаунт цел |
  | `{ "lastName": null }`, `{ "firstName": null }` | **`200`, имя = `null` («null null» в `name`)** | `500 INTERNAL` (NOT NULL), аккаунт цел |
  | `{ "birthDate": null }`, `{ "gender": null }` | `200` | `200` (fake HAPI принимает `null`) |

- **Последствия.** Клиентская ошибка превращается в `500` вместо `400 VALIDATION_ERROR` (API §1); `PUT` `Patient` с
  `"birthDate": null` — невалидный FHIR JSON (HAPI `$validate` помечает его ошибкой «must be a simple value, not a Null»),
  результат для реального `create/update` зависит от строгости парсера HAPI. In-memory хранилище, на котором стоят e2e,
  принимает `null` в NOT NULL-колонки, поэтому тесты этого не видят. Потери данных на PostgreSQL нет: транзакция
  откатывается.
- **Как исправить.** Заменить `@IsOptional()` на `@ValidateIf((_, value) => value !== undefined)` во всех полях, кроме
  `practitionerRoleId` (там явный `null` — освобождение связи и должен остаться допустимым; для `CreateUserDto.practitionerRoleId`
  `null` не нужен). Добавить e2e «PATCH с `null` в `isActive`/`lastName`/`email`/`roles` → `400`» и в `InMemoryUserStore`
  отклонять `null`, чтобы фейк не расходился с PostgreSQL.

### m-2. «Каждое оставшееся изменение имеет `AuditEvent`» — переоценка гарантии

- **Файлы:** `apps/auth-service/src/modules/users/users.service.ts:93`, `apps/auth-service/README.md:73`,
  `apps/auth-service/src/modules/audit/audit.service.ts:11-17`.
- **Суть.** `AuditService.recordUserChange` намеренно ловит и логирует сбой HAPI и не пробрасывает его (объяснено
  в отклонении 3 отчёта). Поэтому при недоступном HAPI изменение роли/`isActive`/`PractitionerRole` у врача или
  администратора (для них синхронизация `Patient` не нужна и других HAPI-вызовов в `update` нет) коммитится, клиент
  получает `200`, а `AuditEvent` не пишется. Формулировка «всегда» в JSDoc и README верна только пока HAPI доступен.
- **Последствия.** Для ADR-014/FR-021 («каждая мутация пишет `AuditEvent`») это пробел именно у привилегированных изменений.
  Отказ от отката аудита ради доступности (решение кодера) обоснован, но документация обещает больше.
- **Как исправить.** Переформулировать в README и JSDoc («записывается best-effort, сбой логируется на `error`») и добавить
  в «Найдено, но не изменено» transactional outbox для аудита изменений прав как следующий шаг.

### m-3. При падении Redis общий guard не ограничивает регистрацию (и per-IP лимит входа)

- **Файлы:** `libs/common/src/lib/guards/rate-limit.guard.ts:93-99` (общий, не менялся), `apps/auth-service/src/app/credential-route.middleware.ts`,
  `apps/auth-service/src/modules/users/account.controller.ts:13-27`.
- **Суть.** Кодер правильно не стал править общий guard и закрыл обход в приложении, но `RateLimitGuard` при ошибке
  хранилища пропускает запрос (`failing open`). У входа остаётся fail-closed счётчик по аккаунту (`503`), у
  `POST /api/v1/auth/register` — ничего: каждая регистрация стоит scrypt N=2^15, записи `User` и `Patient` в HAPI и
  события в RabbitMQ. Это третье последствие C-1 («неограниченное число `User`/`Patient`») остаётся при недоступности Redis.
  Кодер описал это как принятое отклонение.
- **Как исправить** (дёшево, в owned paths): считать попытки в самом `pinCredentialRouteBucket` или в маленьком локальном
  guard-е по IP в памяти процесса (верхняя граница, как `InMemoryLoginAttemptStore`) и применять его только когда общий
  guard пропустил запрос из-за ошибки хранилища; либо тот же `LoginAttemptStore` с ключом `register:{ip}`.

### m-4. Жёсткая блокировка по аккаунту позволяет закрывать вход любому, кто знает email (в том числе bootstrap-администратору)

- **Файлы:** `apps/auth-service/src/modules/oauth/login/login-throttle.service.ts:14-15,44-50`,
  `login-attempt-store.ts:84-91`, `login.controller.ts:102-118`.
- **Суть.** 10 попыток за 15 минут на аккаунт, счётчик считается до проверки пароля, TTL выставляется только при первой
  попытке (окно фиксированное, не скользящее). Достаточно 11 запросов в начале каждого окна, чтобы владелец с верным
  паролем получал `429` постоянно: e2e `should refuse the right password too once the account is over its limit`
  фиксирует именно это поведение. Email администратора известен заранее (`BOOTSTRAP_ADMIN_EMAIL`), а восстановления
  пароля и «разблокировки» нет. Кодер описал компромисс в README и коде; снимать его в этом раунде я не требую.
- **Как смягчить** (решение владельца продукта): держать жёсткий замок только на пару (аккаунт, IP/подсеть), а общий порог
  по аккаунту сделать выше и перевести в прогрессивную задержку; плюс способ сбросить счётчик (операторская команда или
  `PATCH` администратором другого администратора).

## Nit

- **n-1.** `users.service.ts:151-176` (`syncPatient`/`revert`): откат `auth` выполняется при любой ошибке HAPI, в том числе
  при таймауте (`FhirClientError.upstreamStatus === undefined`), когда запись в HAPI могла пройти. Тогда `auth.user` вернётся
  к старым значениям, а `Patient` останется с новыми; повторный `PATCH` расхождение устранит. В `account-factory.service.ts`
  для этого случая уже есть `isOutcomeUnknown`; стоит применить его и здесь (не откатывать, залогировать, записать `AuditEvent` с `outcome 8`).
- **n-2.** `users.service.ts:159`: `birthDate`/`gender` в `PATCH` аккаунта без связанного `Patient` (врач, администратор)
  молча отбрасываются с ответом `200`. Для `practitionerRoleId` у не-врача сервис отвечает `400`; единообразнее ответить
  `400 VALIDATION_ERROR` и здесь.
- **n-3.** `config/auth-env.ts:163-172`: мемоизация `isCookieSecureForced` сделана модульной изменяемой переменной
  `let cookieSecureMemo`, объявленной ниже функции, которая её использует. Работает (функция вызывается после инициализации
  модуля), но читается как скрытое состояние; проще прочитать `AUTH_COOKIE_SECURE` один раз в провайдере/контроллере при старте.
- **n-4.** `tasks/TASK-001/coder-auth-users-report.md:146` и `:158`: отклонение 9 и «Расхождения с фронтендом» всё ещё
  утверждают, что `POST /api/v1/admin/terminology/import` не реализован и панель получит `404`. Эндпоинт реализован
  (`AdminTerminologyController`), на тело `{}` он отвечает `400`. Строка `:176` («Нет блокировки по аккаунту») помечена устаревшей
  только в разделе «Fixes»; стоит поправить сами исходные разделы, чтобы отчёт не противоречил коду.
- **n-5.** Тестовые хелперы длиннее 30 строк: `oauth/__tests__/fake-response.ts:30` (45), `terminology/import/__tests__/fake-terminology-hapi.ts:40`
  (47), `test/e2e-env.ts:17` (33). Это не production-код, но правило GOLDEN-PRINCIPLES (~30 строк) общее.

## Что проверено и подтверждено

**C-1 (лимит входа и регистрации).**

- `pinCredentialRouteBucket` выполняется до `APP_GUARD` (middleware регистрируется раньше guard-ов и после body-parser),
  подключён через `forRoutes({ path, method: POST })`, то есть теми же правилами маршрутизации Express, что и обработчик:
  регистр, косая черта в конце и `?query` попадают и в middleware, и в бакет. Ключ бакета: `-|<ip>:POST:<канонический путь>`.
  Оба маршрута `@Public()`, поэтому `request.user.sub` в ключ не попадает. `POST /oauth/token` и другие сервисы не затронуты.
- Мой репро: ротация `client_id` в JSON-теле и в query вместе с разными email упирается в `429` на 11-й попытке; без middleware
  14 из 14 проходят. Для одного email с ротацией адресов срабатывает per-account счётчик (e2e кодера, 11 тестов зелёные).
- Per-account `LoginThrottle`: считает до проверки пароля, в том числе для несуществующих email (нет перечисления),
  ключ — SHA-256 нормализованного email (хранилище не видит адресов), Redis `INCR`+`EXPIRE` одним Lua-скриптом, `commandTimeout`
  2 с, ошибка хранилища даёт `503` страницей формы, успешный вход сбрасывает счётчик. CSRF проверяется раньше счётчика
  (устаревшая форма не тратит попытку).
- `LoginRateLimitFilter` превращает только `429` в страницу формы с `Retry-After`; прочие `HttpException` идут через `ProblemDetailsFilter`.

**M-1 (атомарность `PATCH`).**

- `TypeOrmUserStore.update` пишет поля, замену ролей и привязку `PractitionerRole` в одной транзакции;
  `ResourceAlreadyLinkedError` и нарушение уникальности email откатывают всё (подтверждено тестами на PostgreSQL).
  Нарушение уникальности по `(resource_type, resource_id)` отдельным индексом ловится как `PRACTITIONER_ROLE_TAKEN`.
- Порядок: проверки (`assertUpdatable`, email свободен, `PractitionerRole` существует) → транзакция → синхронизация
  `Patient` (`If-Match` через one-entry transaction Bundle, 412 → 409) → при отказе HAPI откат обратным `UserChanges` →
  `AuditEvent` со всеми затронутыми ресурсами (до и после, включая освобождённую роль). Неудавшийся откат даёт `AuditEvent`
  с `outcome 8` и ошибкой в логе.
- `AuditEvent` соответствует R4 (`type`, `subtype`, `action`, `recorded`, `outcome`, `agent.requestor`, `source.observer`,
  `entity.role` для `Patient`) и конверту appointment/encounter-service, читаемому analytics-service.

**Безопасность остального сервиса (повторный обход).**

- Guard-стек на каждой ручке: `ADMIN` + `user/*.read|write` для CRUD и импорта, `@Public()` + лимит для регистрации,
  любой Bearer для `/me` (профиль только по `sub`), `ADMIN` для списка ValueSet. Роль при саморегистрации всегда `PATIENT`
  (`roles` отбрасывается `whitelist`). `ParseUUIDPipe({ version: '4' })` на `:id`, `ILIKE` с экранированием, параметризованные запросы.
- Claims: `patient` (голый id) и `fhirUser` берутся из `ExternalLink` на каждом grant (code и refresh), роль `ADMIN > DOCTOR > PATIENT`,
  DOCTOR без привязки получает токен без `fhirUser` (сервисы закрываются fail-closed), деактивированный аккаунт токен не получит.
- Терминология: `url` ограничен `^https://fhir\.by/ValueSet/[A-Za-z0-9._-]{1,100}$`, `validate` обращается к HAPI только для
  систем из seed и кодов правильной формы, `code` ограничен печатным ASCII без пробелов; параметры FHIR собираются через
  `URLSearchParams` (инъекции в параметры поиска и SSRF закрыты). Импорт: single-flight через Redis `SET NX EX`, Lua-освобождение по токену,
  два `AuditEvent`, сброс кэша после импорта.
- Секреты только из env (zod), пароль и email не попадают в логи, ответы с персональными данными — `Cache-Control: no-store`.

## Наблюдения вне scope этой задачи

- **Хранилище токенов и denylist в памяти** (`oauth.module.ts`, Task 6): единственность использования сессии входа и
  refresh-токенов не переживает перезапуск и не разделяется между репликами.
- **`POST /oauth/token` не сверяет `redirect_uri`** с запросом авторизации (RFC 6749 §4.1.3); PKCE смягчает.
- **`ProblemDetailsFilter`** отдаёт для ошибок `ValidationPipe` `detail: "Bad Request Exception"` без `details[]` (§1 API), так что
  клиент не узнает, какое поле неверно (общий слой).
- **Нет смены и сброса пароля** (в спеке нет); вместе с m-4 это означает, что заблокированный или забытый аккаунт восстанавливается только через БД.
- **Fail-closed счётчик входа делит Redis с остальным стеком:** при недоступности Redis вход блокируется для всех (`503`). Это
  осознанный выбор кодера, но его стоит учесть в runbook.
- `.env.example` стоит дополнить `BOOTSTRAP_ADMIN_*`/`AUTH_SESSION_SECRET` (общий файл, чтение `.env*` запрещено политикой).

## Расхождения с фронтендом (спека побеждает, фронтенд не менялся)

1. `frontend/src/components/admin/terminology-import-panel.tsx:10` шлёт `POST /api/v1/admin/terminology/import` с `{}`; спека
   (§2.3.4) и сервис требуют `{ "snapshotVersion": "1.4.463" }`, ответ `400`, а панель обрабатывает только `409`.
2. Регистрация: `409 EMAIL_TAKEN` приходит как `errorCode: CONFLICT` (каталог `ERROR_CODES` не содержит `EMAIL_TAKEN`, §2.2.6
   разрешает «`EMAIL_TAKEN` в `detail`»); клиент показывает общий баннер, а не подсказку у поля email.
3. Пароль: клиентская zod-схема считает «символом» любой `[^A-Za-z0-9]` (включая кириллицу), сервер (`IsStrongPassword`) —
   только ASCII-пунктуацию; пароль без ASCII-символа пройдёт форму и получит `400`.

## Context Summary

Повторная проверка подтвердила исправления: C-1 (обход лимита входа и регистрации подменой `client_id`) закрыт
middleware `pinCredentialRouteBucket` плюс fail-closed счётчиком по аккаунту (мой репро: 10 × `200`, затем `429`; без
middleware 14 из 14 проходят), M-1 (неатомарный `PATCH`) закрыт одной транзакцией, откатом при отказе HAPI и `AuditEvent`
на каждое оставшееся изменение (подтверждено на PostgreSQL). Unit (512 + 14 на PostgreSQL), e2e (130 + 5), lint, tsc зелёные. Critical и
major нет; 4 minor (`null` проходит `@IsOptional()` и даёт `500` или `null` в in-memory, переоценка гарантии аудита,
нет потолка регистрации при падении Redis, блокировка аккаунта как вектор отказа в обслуживании) и 5 nit не блокируют.

## Next Steps

**Next by flow:** `/test-generator` — регрессионные тесты на `null` в DTO (`PATCH`/`POST` админского API) и на неоднозначный отказ HAPI при синхронизации `Patient`.

**Alternatives:**

- `/coder` — исправить m-1 (`@ValidateIf` вместо `@IsOptional()`), по возможности m-3, n-1, n-2.
- `/finishing-branch` — можно после решения по m-1; critical/major закрыты и тесты есть.
