# test-generator-auth-report.md

**Skill:** test-generator · **Объект:** `apps/auth-service` (вход по паролю, пользователи, терминология) ·
**Вход:** вердикт `code-reviewer-auth-c1-report.md` — APPROVE (0 critical, 0 major, 4 minor, 5 nit) ·
**Дата:** 2026-10-14

> Возобновлённый прогон. Новые тесты добавлены к существующим, дубликатов нет. Производственный код изменён в одном месте:
> тесты подтвердили реальный дефект (m-1 ревью), он исправлен минимально (см. «Найденный дефект»).
>
> **Прогон оборвался на проверках.** После моей попытки временно «обезвредить» декораторы доступа в
> контроллерах (мутационная проверка чувствительности матрицы) классификатор прав отклонил это действие
> (`Security Weaken`), а затем отклонял и любые команды Bash, включая `nx lint` и `git status`. Я не повторял попытки и не
> обходил запрет через другой инструмент (терминал пользователя без песочницы). Итоговый полный прогон unit/e2e, `lint`,
> `tsc` и `build` после правок **не выполнены**; ниже честно разделено, что было измерено, а что рассчитано. Правка
> производственного кода откатов не требует: мутация не применялась (проверено перед блокировкой: декораторы на месте).

## Что было до этого прогона

Замер до моих правок (реальные команды из корня):

| Проверка | Результат |
| --- | --- |
| `npx nx test auth-service --maxWorkers=2 --skip-nx-cache` | `Test Suites: 1 skipped, 54 passed, 55 total` · `Tests: 14 skipped, 512 passed, 526 total` |
| `npx nx e2e auth-service --skip-nx-cache --maxWorkers=2` | `Test Suites: 1 skipped, 9 passed, 10 total` · `Tests: 5 skipped, 130 passed, 135 total` |

Покрытие по строкам (jest `--coverage`, unit / e2e по отдельности): 87 % / 80 %. Контроллеры и DTO в unit-прогоне покрыты
на 0 %, их держали только e2e; `bootstrap-admin.service.ts` (78 % / 74 %) и `request-actor.ts` (50 %) не имели своих тестов.

Что уже было и осталось: guard-стек на уровне `jwt-perimeter.e2e-spec.ts`, e2e входа (17), OAuth (32), регистрации и `/me`
(14), админского CRUD (22), чтения терминологии (13) и импорта (11), unit по сервисам, провайдеру `Patient`, хэшу пароля,
миграциям, хранилищу на PostgreSQL.

## Найденные пробелы

| Пробел | Как закрыт |
| --- | --- |
| Периметр проверялся только на `GET /admin/users` | Матрица по всем защищённым маршрутам: 401, не-Bearer, нет `jti`, неверный scope, неверная роль, «пропущенный» вызов |
| Нет проверки полноты периметра: новый маршрут мог остаться без классификации | Инвентарь маршрутов из метаданных Nest сверяется с allow-list публичных и каталогом защищённых |
| Compartment (ADR-013) на `/me` не проверялся | Параметры `patient`/`id`/`userId`/`sub` игнорируются, чужой аккаунт недоступен ни через `/me`, ни через админскую карточку |
| `null` в DTO админского API и регистрации (reviewer m-1) | Тесты на DTO и HTTP, дефект исправлен |
| Валидация DTO только через e2e, без таблиц | Unit-таблицы по `CreateUserDto`, `UpdateUserDto`, `RegisterPatientDto`, `ListUsersQueryDto`, DTO терминологии и импорта |
| Формы `Patient` / `If-Match` / `AuditEvent` проверялись частично | Полные формы ресурсов, заголовок `If-Match` и состав Bundle, агент `AuditEvent` = `sub` админа, `XrequestId`, роль объекта `Patient` |
| Отказы HAPI (409/502/504, неоднозначный таймаут) на уровне HTTP | Сопоставление статусов и `errorCode`, отсутствие адреса HAPI в ответе, сходимость повторного `PATCH` после таймаута |
| Терминология: кэш, аргументы `$expand`/`$validate-code`, `valid:false` без обращения к HAPI, сопоставление ошибок | Новый контрактный набор |
| `BootstrapAdminService` без unit-тестов | Новый spec |
| `GET /health`, `GET /`, correlation id, 404 | Новый набор публичных маршрутов |
| Валидация формы `POST /oauth/login` и регистрации | Новые e2e |

## Найденный дефект и исправление

**`null` проходил валидацию `@IsOptional()` во всех необязательных полях** (reviewer m-1). Тесты воспроизвели его до правки:
`user-dtos.spec.ts` дал 11 красных кейсов (`birthDate`, `gender`, `practitionerRoleId` у `CreateUserDto`; `email`, `firstName`,
`lastName`, `birthDate`, `gender`, `roles`, `isActive` у `UpdateUserDto`; `gender` у `RegisterPatientDto`). Последствия по
ревью: `500` вместо `400` на `email`/`roles`, `null` в NOT NULL-колонках на in-memory хранилище.

Минимальная правка (только `apps/auth-service/src/modules/users/dto/`):

- `validation-patterns.ts`: `isPresent(_object, value) => value !== undefined`.
- `create-user.dto.ts`, `update-user.dto.ts`, `register-patient.dto.ts`: `@IsOptional()` заменён на `@ValidateIf(isPresent)` во всех
  полях, кроме `UpdateUserDto.practitionerRoleId`: там явный `null` означает «освободить привязку» и остаётся допустимым
  (тест `should accept practitionerRoleId null because that is how a link is released`). Для `CreateUserDto.practitionerRoleId`
  `null` теперь `400`.

После правки все 92 кейса `user-dtos.spec.ts` и все e2e на `null` зелёные (unit-набор `src/modules/users` на тот момент:
`12 passed / 200 tests`).

## Новые тесты

### Unit (4 новых набора, 161 тест; плюс 1 тест в существующем)

| Файл | Тестов | Что проверяет |
| --- | --- | --- |
| `src/modules/users/dto/user-dtos.spec.ts` | 92 | Таблицы невалидных тел через настоящий `createValidationPipe()` (тот же, что в `main.ts`): почта, имена, политика пароля, роли, даты, пол, `practitionerRoleId`, `null` в каждом поле, whitelist (`roles`/`isActive`/`id` отбрасываются), `page`/`pageSize` и их преобразование |
| `src/modules/terminology/dto/terminology-dtos.spec.ts` | 51 | Канонический URL ValueSet (чужой хост, http, CodeSystem, путь, query, длина), `count`/`offset`/`filter`, форма `code` (ASCII без пробелов, 1–64), `system` (http(s) URI), `snapshotVersion` (номер релиза) |
| `src/modules/users/bootstrap-admin.service.spec.ts` | 13 | Нет переменных: ничего; пара: ADMIN, имена по умолчанию и из окружения, scrypt-хэш без пароля; половина пары, плохая почта, слабый пароль: сбой запуска без записи; `AuditEvent` под системным актором; существующий деактивированный аккаунт не трогается; проигранная гонка (`409`) принимается, прочие ошибки пробрасываются |
| `src/modules/users/request-actor.spec.ts` | 4 | Актор берётся из `sub` токена и `requestId`, без claims `401 UNAUTHENTICATED` |
| `users.service.update.spec.ts` (+1) | 13 из 12 | Таймаут HAPI при синхронизации `Patient`: `504`, повторный `PATCH` сходится |

Общий хелпер: `src/__tests__/validation-helper.ts` (`pipeline`, `violationsOf`).

### E2E (12 новых наборов, 261 тест)

Все на настоящем `AppModule`, настоящем guard-стеке и `createValidationPipe()`; HAPI, PostgreSQL, RabbitMQ подменены (как в
существующих наборах).

| Файл | Тестов | Что проверяет |
| --- | --- | --- |
| `test/authz-matrix.e2e-spec.ts` | 89 | 12 защищённых маршрутов × (401 без токена, 401 для `Basic`, 401 без `jti`, `403 FORBIDDEN_SCOPE` для PATIENT и для ADMIN без нужного scope, `403 FORBIDDEN_ROLE` для DOCTOR с `user/*` и для «PATIENT с user-scope», вызов нужной ролью доходит до обработчика). Отказы идут на **валидном** теле, и каждый проверяет, что `auth` и HAPI не изменились |
| `test/perimeter-routes.e2e-spec.ts` | 4 | Маршруты читаются из метаданных контроллеров: публичные совпадают с allow-list, защищённые совпадают с каталогом матрицы, дублей нет |
| `test/me-compartment.e2e-spec.ts` | 18 | `/me` для PATIENT/DOCTOR/ADMIN (ссылки `ExternalLink`), claims `patient`/`fhirUser` согласуются с профилем, параметры `patient`/`id`/`userId`/`sub` игнорируются, чужая карточка и чужая деактивация закрыты, `404` для `sub` без аккаунта, `X-Request-Id` в проблеме |
| `test/admin-users-write-validation.e2e-spec.ts` | 35 | `POST`/`PATCH`: карточка `201`, `409 EMAIL_TAKEN` в другом регистре, таблицы `400`, `null` в каждом поле `PATCH` (аккаунт не меняется), `SELF_LOCKOUT` через роли и `isActive`, `404`, неразбираемый JSON, пустое тело |
| `test/admin-users-read-validation.e2e-spec.ts` | 17 | `DELETE` (400/404/повторное удаление, связь с `PractitionerRole` остаётся) и `GET` списка (таблица неверных query, мета по умолчанию, страница за пределами, пустой поиск, без секретов) |
| `test/users-patient-sync.e2e-spec.ts` | 12 | Форма R4 `Patient` (идентификатор, official name, email home, `birthDate`, `gender`), `patient.registered.v1`, `PUT` в transaction Bundle с `If-Match: W/"7"`, сохранение чужих имён и контактов, замена только `home` email, нет вызова HAPI при `isActive`, `409` при `412`, `502`, `504` и сходимость, откат сироты `Patient` после таймаута создания |
| `test/users-audit-event.e2e-spec.ts` | 8 | `AuditEvent` (тип, `subtype`, `action`, агент = `sub` админа, источник, сущности по порядку, `XrequestId`, объект-роль `Patient`), `user.deactivated`, нет события при отказе до изменения, `200` при недоступном аудите, чтение `PractitionerRole`, `404`/`502` |
| `test/terminology-contract.e2e-spec.ts` | 30 | Таблица `400` без обращения к HAPI, аргументы `$expand` по умолчанию, кэш (один вызов HAPI на повторный запрос и на разные фильтры), страницы с фильтром, `Cache-Control`, `404`/`500`/`502`/`504` без адреса HAPI, аргументы `$validate-code`, `valid:false` без HAPI (форма МКБ-10/АТХ, чужая система), `404`/`422` как `valid:false`, `400` HAPI не маскируется, список ValueSet |
| `test/terminology-import-validation.e2e-spec.ts` | 9 | Массив, строка, `null`, число, пререлиз, суффикс, длина, битый JSON, пустое тело: `400`, HAPI не тронут |
| `test/login-validation.e2e-spec.ts` | 12 | Поля формы входа за пределами длины и списком: `400` без сессии; пустые поля: форма с сообщением; регистр и пробелы в почте; `GET /oauth/login` `404` |
| `test/public-endpoints.e2e-spec.ts` | 9 | `GET /health`, `GET /`, `X-Request-Id` (эхо, UUID, подмена, в проблеме), `404` как `problem+json` без стека |
| `test/register-validation.e2e-spec.ts` | 18 | Таблица `400` регистрации без побочных эффектов (пользователь, `Patient`, `AuditEvent`, событие), точный набор полей ответа, регистр почты, повтор `409` |

Общие хелперы e2e: `test/synthetic-token.ts` (токены с произвольными claims для scope/role, которых сервер не выдаёт, и заглушка
`jose`), `test/endpoint-catalog.ts` (каталог защищённых маршрутов и allow-list публичных), `test/problem-assertions.ts`,
`test/users-helpers.ts`.

Каждый защищённый маршрут из API-спеки теперь имеет: happy-path (уже были и новые), authZ (роль, scope, compartment для
`/me`), валидацию и сопоставление ошибок. Для auth-service нет ресурсов patient-compartment кроме `/me`, а `COMPARTMENT_VIOLATION`
возвращают только сервисы с пациентскими ресурсами; здесь проверено, что параметр запроса не меняет субъекта.

## Что проверено на самом деле

| Проверка | Статус |
| --- | --- |
| Замер до правок (unit и e2e) | измерено, см. выше |
| Каждый новый набор запущен хотя бы раз и прошёл | измерено: `terminology-dtos` 51, `bootstrap-admin` 13, `request-actor` 4, `users.service.update` 13, `authz-matrix` 89, `perimeter-routes` 4, `me-compartment` 18, `terminology-contract` 30, `terminology-import-validation` 9, `login-validation` + `public-endpoints` 21, `register-validation` 18, четыре набора `admin-users-write/read-validation` + `users-patient-sync` + `users-audit-event` вместе 72, `user-dtos` (красный до правки: 11 падений на кейсах `null`; зелёный после; число тестов 92 получено подсчётом таблиц, отдельной строкой Jest не снято) |
| Итоговый полный `nx test` / `nx e2e` после всех правок | **не выполнен** |
| `nx lint auth-service` | **не выполнен** |
| `tsc --noEmit` (app, spec) и `nx build` | **не выполнены** (ts-jest при каждом запуске набора проверяет типы тестов и исправленных DTO, это не замена `tsc`) |
| PostgreSQL-наборы (`typeorm-user.store`, `postgres-flow`) | не запускались: нужен одноразовый PostgreSQL, из-за блокировки не поднят |
| Мутационная проверка чувствительности матрицы | **не выполнена**: заблокирована классификатором, производственный код не менялся |

**Рассчитанные ожидаемые итоги** (замер до правок плюс новые тесты, не измерены одним прогоном): unit `58 passed + 1 skipped`
наборов и `673 passed + 14 skipped` тестов; e2e `21 passed + 1 skipped` наборов и `391 passed + 5 skipped` тестов.

**Оговорки по файлам, правленным после последнего зелёного запуска:**

- `prettier --write` (ширина 100, конфиг репозитория) применён после запуска к `authz-matrix`, `perimeter-routes`, `me-compartment`,
  `user-dtos.spec`, `terminology-dtos.spec`, `bootstrap-admin.service.spec`, `validation-helper`. Это только перенос строк, но
  заново эти семь файлов не запускались.
- **Ошибка в процессе, исправлена.** Команда `prettier --write apps/auth-service/test/*.ts` захватила и 9 ранее существовавших
  e2e-файлов (`admin-users`, `users`, `terminology`, `terminology-import`, `login-flow`, `credential-rate-limit`, `postgres-flow`,
  `app-harness`, `auth-flow-helpers`; все неотслеживаемые, `git` их восстановить не мог). Исходный текст восстановлен из
  `sourcesContent` source map кэша трансформации Jest (`/tmp/jest_rs`): число строк совпало с замером до форматирования
  (258, 66, 108, 211, 282, 132, 202, 189, 162). Хелперы `app-harness` и `auth-flow-helpers` после этого перекомпилированы и прошли
  в составе новых наборов; сами восстановленные спеки заново не запускались. Остальные файлы `test/` (tracked: `e2e-env`,
  `jwt-perimeter`, `oauth`, `rate-limit-proxy`) не менялись, их содержимое совпало с кэшем.

## Что не менялось (решения)

- **n-1 ревью (откат `auth` при неоднозначном отказе HAPI).** Тест фиксирует только то, что верно при любой политике:
  `504` клиенту и сходимость повторного `PATCH`. Поведение «откат при любой ошибке» не закреплено, чтобы не лишить
  `/coder` свободы применить `isOutcomeUnknown`.
- **n-2** (`birthDate`/`gender` у аккаунта без `Patient` молча отбрасываются с `200`) не закреплено тестом: решение по контракту
  (`400` или `200`) за владельцем API.
- **Регистрация: почта с пробелами по краям** отклоняется `400` (`@IsEmail()`), хотя вход нормализует такую почту; тест фиксирует
  текущую строгость, форма регистрации обязана присылать значение без пробелов.
- m-2 (формулировка гарантии аудита), m-3 (потолок регистрации при падении Redis), m-4 (блокировка аккаунта): это решения о
  продукте и общем guard, тестов на них не добавлялось.

## Расхождения с фронтендом и shared-изменения

Новых расхождений не найдено; прежние (панель импорта шлёт `{}`, `EMAIL_TAKEN` как `CONFLICT`, пароль с кириллицей) описаны в
`code-reviewer-auth-c1-report.md`. Shared-файлы (`libs/*`, `package.json`, `infra/*`, `frontend/*`) не менялись, зависимости не
добавлялись.

## Что нужно выполнить дальше (команды)

```
npx nx test auth-service --maxWorkers=2 --skip-nx-cache
npx nx e2e auth-service --skip-nx-cache --maxWorkers=2
npx nx lint auth-service
npx tsc --noEmit -p apps/auth-service/tsconfig.app.json
npx tsc --noEmit -p apps/auth-service/tsconfig.spec.json
npx nx build auth-service --skip-nx-cache
```

Если `lint` выдаст замечания, вероятные места: стиль `import()` в типе внутри `jest.mock(...)` (используется во всех новых
e2e), длина функций-таблиц в `endpoint-catalog.ts`, порядок импортов в изменённых DTO. Для наборов на PostgreSQL нужен
одноразовый сервер (`TEST_PG_*`), как в `coder-auth-users-report.md`.

## Context Summary

Для `auth-service` добавлено 4 unit-набора (161 тест), 12 e2e-наборов (261 тест) и 1 тест в существующем unit-наборе; тесты
подтвердили дефект ревью m-1 (`null` в необязательных полях DTO) и он исправлен минимально (`@ValidateIf(isPresent)`).
Каждый новый набор запущен и зелёный; итоговый полный прогон, `lint`, `tsc` и `build` не выполнены из-за блокировки Bash
классификатором прав, поэтому итоговые счётчики (unit 673, e2e 391) расчётные.

## Next Steps

**Next by flow:** `/debugger` — только если повторный полный прогон или `lint` покажут падения.

**Alternatives:**
- Выполнить команды из раздела выше (после разрешения Bash) и затем `/finishing-branch`.
- `/docs-generator` — обновить README сервиса, если решение по m-1 нужно отразить в описании валидации.
- `/coder` — n-1, n-2, m-3, m-4 из ревью.
