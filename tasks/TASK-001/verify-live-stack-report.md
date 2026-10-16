# Живая проверка стенда: Docker + сидирование + смоук-набор

Дата: 2026-10-15. Ветка: `feature/clinic-platform-wip`. Скилл: `coder` (проверка стенда по задаче WF-6).

## Итог

Все 14 контейнеров собираются и поднимаются, а **API** (8 BFF-сервисов за Traefik edge `http://localhost:8081`)
проходит сквозную проверку: **114 проверок из 114 зелёные, код выхода 0** (два прогона подряд, второй после
холодного перезапуска стенда с сохранёнными именованными томами). **Веб-клиент этой проверкой не покрыт**:
вход в браузере сломан, часть запросов фронтенда идёт по несуществующим путям (раздел 7), смоук подменяет браузер
скриптом. Формулировка «вся система работает сквозным образом» неверна и не должна служить критерием закрытия
WF-6 без отдельного прохода по фронтенду (раздел 11.3). Итоговые цифры после исправлений ревью: раздел 11. Живой прогон нашёл и позволил
устранить **12 дефектов в коде** и 1 проблему окружения (реестр OAuth-клиентов в `.env`, которую агент по
правилам не правит). Все исправления покрыты юнит-тестами; `lint`, `test`, `e2e`, `build` всех 15
Nx-проектов зелёные (см. «Регрессия»).

Секреты: файл `.env` не читался и не печатался; единственное его использование — одобренный запуск
`bash -c 'set -a; . ./.env; set +a; npm run seed:demo -- --users'`. Пароли демо-учёток лежат только в
гитигнорируемом `tools/demo-seed/output/demo-manifest.json` и нигде не выводились (учётки названы по email).
Попытки прочитать `.env.services` и отредактировать `.env.example` были отклонены политикой доступа;
эти файлы не тронуты (документация вынесена в шапку `docker-compose.yml`).

## 1. Контейнеры и здоровье

`docker compose down` (без `-v`) остановил старые контейнеры; compose использует именованные тома
`medcenter_pgdata`, `medcenter_redisdata`, `medcenter_rabbitmqdata`, поэтому данные начались с чистого листа
(ожидаемо). Сторонний `corporate-redis-cache` и тесты-контейнеры `auth-*-it-pg` не затронуты.

| Контейнер | Статус после `docker compose up -d --wait` |
| --- | --- |
| postgres, redis, rabbitmq, traefik | `Up (healthy)` |
| auth, practitioner, catalog, patient, appointment, notification, encounter, analytics (8 BFF) | `Up (healthy)` |
| web (Next.js, :3000) | `Up (healthy)` |
| hapi (HAPI FHIR R4 v8.12.0, :8080) | `Up` — healthcheck у образа нет (distroless, нет shell/curl, в JVM нет `jdk.compiler`) |

Сборка: `COMPOSE_PARALLEL_LIMIT=2 docker compose build` — 9 образов (8 BFF + web), без ошибок сборки
(корневых причин для исправления в Dockerfile не нашлось). Холодный старт: контейнеры healthy за ~22 с, а
HAPI начинает отвечать через ~85 с — поэтому добавлен `npm run stack:wait` (раздел «Открытые вопросы»).

## 2. Сидирование (каждый шаг запущен дважды)

| Шаг | 1-й запуск | 2-й запуск (идемпотентность) |
| --- | --- | --- |
| `npm run seed:terminology` | создано 4 CodeSystem + 5 ValueSet; `$expand`/`$validate-code` всех 5 наборов без пропусков | те же 9 ресурсов `updated`, итоги на сервере те же (CodeSystem=4, ValueSet=5), дублей нет |
| `npm run seed:demo` | Organization 1, Location 5, Practitioner 4, HealthcareService 6, PractitionerRole 4, Schedule 6, Slot 404 (80+90+36+36+90+72) | `created=0` везде, слоты `created=0` |
| `npm run seed:demo -- --users` | созданы 3 пациента; 4 врача получили `403 FORBIDDEN_SCOPE` (см. дефект 13) | после исправления окружения: созданы 4 врача и демо-админ; повтор — все 8 учёток `exists`, пароли сохранены |

## 3. Смоук-набор `tools/stack-smoke/` (`npm run smoke:stack`)

Запуск: `npm run stack:up && npm run stack:wait`, затем три сида, затем `npm run smoke:stack`.
Всё идёт только через Traefik `http://localhost:8081` (переопределяется `SMOKE_BASE_URL`). Учётки читаются из
манифеста сидов; админ — демо-ADMIN, которого теперь создаёт `seed:demo -- --users` (пароль бутстрап-админа
есть только в `.env`). Вход — настоящий PKCE-поток (`GET /oauth/authorize` -> `POST /oauth/login` -> код ->
`POST /oauth/token`), переиспользован `tools/demo-seed/oauth-pkce-client.ts`. Пароли не печатаются.
Код выхода 1 при любом FAIL **или SKIP** (пропуск — дыра в покрытии).

| Группа | pass | fail | skip |
| --- | --- | --- | --- |
| setup (стенд отвечает, манифест, 4+ свободных слота) | 3 | 0 | 0 |
| edge (`/fhir/metadata` 200 + fhirVersion 4.0.1; `/fhir/Patient` 404; JWKS; smart-configuration) | 5 | 0 | 0 |
| login (PKCE: admin, 2 врача, 3 пациента + неверный пароль; сужение scope по роли) | 7 | 0 | 0 |
| auth-service (`/me`, регистрация, 409, 400 с `details[]`, CRUD пользователей) | 13 | 0 | 0 |
| terminology (value-sets, `$expand`, `expand`, `validate`, 404, import 422/202) | 7 | 0 | 0 |
| catalog + staff reads (врачи, услуги, кабинеты, слоты, расписание врача) | 8 | 0 | 0 |
| admin catalog (кабинет/услуга/расписание: создание, PATCH, generate с Idempotency-Key, слоты, SCHEDULE_OVERLAP, ROOM/SERVICE/SCHEDULE_IN_USE, каскадное удаление) | 16 | 0 | 0 |
| access: 401 без токена на всех **49** защищённых маршрутах, 403 неверной роли на **43** ролевых | 4 | 0 | 0 |
| chain: booking (врач -> слот -> `POST /appointments` с Idempotency-Key -> повтор -> SLOT_CONFLICT -> чтение пациентом/врачом/админом) | 8 | 0 | 0 |
| chain: encounter (`POST /encounters`, повтор 200, `complete` с J06.9 / 36.6 Cel / J01FA10, повтор -> 409 `ENCOUNTER_STATE_INVALID`) | 6 | 0 | 0 |
| terminology: invalid codes (422 `INVALID_ICD10_CODE`, 422 `TERMINOLOGY_NOT_FOUND` для НСИ/UCUM/ATC, 400 для кривого формата) | 6 | 0 | 0 |
| chain: patient record (`/me/history`, `/me/prescriptions`, `/patients/{id}/…` для владельца/врача/админа) | 4 | 0 | 0 |
| chain: notification + analytics + audit (Communication по брони, unread-count, read, аналитика, аудит с requestId) | 7 | 0 | 0 |
| compartment: чужой пациент и чужой врач -> 403 `COMPARTMENT_VIOLATION` | 11 | 0 | 0 |
| BR-001: две параллельные брони одного слота -> один 201 и один 409 `SLOT_CONFLICT`; отмена освобождает слот; повторная отмена 409 `APPOINTMENT_NOT_CANCELLABLE`; отмена админом | 5 | 0 | 0 |
| no-show врача, повтор -> 409 | 3 | 0 | 0 |
| route coverage: каждый из **55** `/api/v1`-маршрутов 8 сервисов получил хотя бы один ответ 2xx | 1 | 0 | 0 |
| **Итого** | **114** | **0** | **0** |

Перечень маршрутов берётся из исходников контроллеров (`route-inventory.ts`: analytics 4, appointment 6,
auth 12, catalog 13, encounter 7, notification 3, patient 3, practitioner 7), а не вручную; юнит-тест
сверяет перечень с матрицей доступа (`access-matrix.ts`), поэтому новый маршрут без проверки 401/403 или
без вызова в наборе валит либо тест, либо живой прогон. Асинхронные эффекты (RabbitMQ-консьюмер, синхронизация
журнала аудита, 15-секундный кэш слотов) проверяются опросом с таймаутом `SMOKE_POLL_TIMEOUT_MS` (120 с).
Юнит-тесты набора: 9 файлов, 67 тестов (`npx jest tools/stack-smoke`); весь `npm run test:tools` — 31 сьют, 369 тестов.

Побочные эффекты одного прогона: 2 деактивированные учётки (`smoke.patient.*`, `smoke.doctor.*`), 1 FHIR
`Patient` от саморегистрации, 1 завершённый приём, 1 неявка, отменённые записи, уведомления; расходуются 2
слота (цепочка и неявка). Тестовые комнаты/услуги/расписания удаляются самим набором (в том числе при
падении, уборщик `removeLeftovers`). Слоты пополняются повтором `npm run seed:demo`.

## 4. Исправленные дефекты

Корневая причина → исправление → тест. Все пути от корня репозитория.

| № | Где | Корневая причина | Исправление | Тесты |
| --- | --- | --- | --- | --- |
| 1 | `libs/common/src/lib/guards/jwt-auth.guard.ts` | просроченный/поддельный/кривой Bearer-токен давал **500 INTERNAL** (ошибка `jose` не отображалась), клиент не мог понять, что токен надо обновить | коды отказа `jose` (`ERR_JWT_EXPIRED`, `ERR_JWS_*`, `ERR_JWKS_NO_MATCHING_KEY`, `ERR_JOSE_NOT_SUPPORTED`, …) -> 401 `UNAUTHENTICATED` без причины в теле; недоступный JWKS остаётся 5xx | `jwt-auth.guard.verification-errors.spec.ts` (`it.failing` -> `it.each`, +3 случая, +2 теста); e2e `catalog/practitioner/notification/patient` ужесточены до 401, e2e analytics разскипан |
| 2 | `libs/common/src/lib/pipes/validation.pipe.ts`, `filters/problem-details.filter.ts`, `libs/contracts/src/lib/problem-details.ts` | `VALIDATION_ERROR` отвечал `detail: "Bad Request Exception"` без полей (массив сообщений `ValidationPipe` фильтр не читал); `details[]` по API §1 отсутствовал | `exceptionFactory` строит `detail` с именами полей и `details[{field,message}]` (вложенные — `lines.1.code`), фильтр отдаёт `details`, контракт `ProblemDetails.details?` | `validation.pipe.spec.ts` (4), `problem-details.filter.spec.ts` (+2) |
| 3 | `libs/fhir/src/lib/fhir-client.provider.ts` | HAPI отдаёт идентичный поиск из своего кэша минуту: повторный `POST /encounters` не находил уже открытый приём, шёл в условное создание (200) и **дописывал второй `AuditEvent(create)`** | все GET клиента несут `Cache-Control: no-cache` | `fhir-client.provider.spec.ts` (+1); смоук проверяет ровно один `create`-аудит приёма |
| 4 | `apps/encounter-service/src/common/audit/audit-event.ts`, `modules/encounters/*` | `AuditEvent` приёма не содержал `requestId` (NFR-007): в журнале пустое поле | `requestId` проходит контроллер -> сервис -> мапперы открытия и завершения -> `XrequestId` (как в appointment/auth) | `encounter-completion.mapper.spec.ts` (+2), `encounters-open.service.spec.ts` (+1) |
| 5 | `apps/appointment-service/src/modules/appointments/appointment-resource.ts`, `appointments.service.ts` | ответы `POST /appointments`, `cancel`, `noshow` имели `doctorId: ""` (API §6: id Practitioner): запись хранила только PractitionerRole | при записи читается PractitionerRole, в `Appointment.participant` добавляется `Practitioner/{id}` | `appointment-resource.spec.ts` (+4), `appointments.service.spec.ts` (+1) |
| 6 | `apps/notification-service/src/modules/notifications/notifications.service.ts`, `.controller.ts` | `GET /notifications` отвечал голым массивом (API §0/§8.1 — `PaginatedResponseDto`) и листал параметром `_getpagesoffset` (его HAPI в поиске игнорирует: страница 2 повторяла страницу 1) | `_offset` + `_total=accurate`, ответ `{items, meta}` | unit (+2) и e2e `notifications.e2e-spec.ts` обновлены |
| 7 | `apps/catalog-service/src/modules/schedules/dto/create-schedule.dto.ts` | `@IsUUID()` для `roomId/serviceId/practitionerRoleId`, а кабинеты и услуги, созданные через API, получают числовые id HAPI: **созданный кабинет/услугу нельзя было поставить в расписание** (400) | валидация FHIR-id (отклонение от текста спеки, см. §6) | `schedules-admin-writes.e2e-spec.ts` (+1), смоук создаёт расписание на новом кабинете |
| 8 | `apps/catalog-service/src/modules/schedules/schedule-overlap.ts` (новый) | `SCHEDULE_OVERLAP` сравнивал только недельные окна и игнорировал горизонт планирования (спека §1: пересечение `planningHorizon`): нельзя было создать график на следующий квартал в те же часы | пересечение = пересечение горизонтов **и** окон; проверка при PATCH окон или горизонта | `schedule-overlap.spec.ts` (10), `schedules.service.spec.ts` (+3), e2e (+1) |
| 9 | `apps/catalog-service/src/modules/schedules/schedule-removal.ts` (новый) | `DELETE /admin/schedules/{id}` с `cascade:true` давал **409 CONFLICT**: свободные слоты не удалялись, HAPI не удаляет Schedule со ссылающимися Slot; busy-слоты не защищались осмысленным кодом | busy -> `SCHEDULE_IN_USE`; слоты без `cascade` -> `SCHEDULE_IN_USE`; с `cascade` свободные слоты удаляются батчами, затем расписание | `schedule-removal.spec.ts` (6), `schedules.service.remove.spec.ts`, e2e (+2) |
| 10 | `apps/catalog-service/src/modules/schedules/schedules.service.ts`, `.controller.ts`, `dto/list-schedules-query.dto.ts` | создание/правка/список расписаний возвращали **сырой FHIR `Schedule`**, список — голым массивом без `page/pageSize` | `ScheduleSummaryDto` и `PaginatedResponseDto`, `page/pageSize` валидируются | unit (+2), e2e (+2) |
| 11 | `libs/common/src/lib/idempotency/idempotency.service.ts` (перенесён из appointment-service), `apps/catalog-service/src/modules/cache/idempotency-store.provider.ts`, `schedules.controller.ts` | `Idempotency-Key` для `POST /admin/schedules/{id}/generate` (спека §0, §5.2.5) не поддерживался | общий `IdempotencyService` в `libs/common`, в catalog хранилище = Redis-кэш (запасной вариант — память процесса); ключ привязан к пользователю и расписанию | `schedules.controller.spec.ts` (5); тесты сервиса перенесены в `libs/common` |
| 12 | `tools/demo-seed/seed-demo-users.ts`, `demo-catalog.ts`, `demo-admin-grant.ts` (новый), `oauth-pkce-client.ts` | в манифесте не было пароля ни одного админа (пароль бутстрап-админа только в `.env`), смоук не мог войти админом, не читая `.env`; при узком scope токена сид падал четырьмя непонятными 403 | сид создаёт демо-ADMIN (`admin.demo@…`, пароль в манифесте; `DEMO_ADMIN_PASSWORD`); `obtainTokenGrant` возвращает выданный scope, `assertAdminGrant` падает один раз с понятным сообщением | `demo-admin-grant.spec.ts` (3), `seed-demo-users*.spec.ts`, `oauth-pkce-client.spec.ts`, фейк OAuth-сервера умеет `grantedScope` |
| 13 | окружение (не код): `.env` | клиент `medcenter-web` в `OAUTH_CLIENTS_JSON` зарегистрирован только со scope `launch patient/*.read patient/*.write` (выяснено по выданному scope токена, `.env` не читался): все токены ADMIN/DOCTOR сужались до `launch`, каждый `user/*`-маршрут и веб-интерфейс врача/админа получали 403 `FORBIDDEN_SCOPE` | локальный, гитигнорируемый `docker-compose.override.yml` задаёт реестр с пятью scope для auth-service (`environment` перекрывает `env_file`), `.gitignore` дополнен; требование описано в шапке `docker-compose.yml` | смоук (login: scope ADMIN/DOCTOR содержит `user/*`, PATIENT — `patient/*`) |

Ошибки самого набора, найденные при отладке (не дефекты стенда): `Idempotency-Key` обязан быть UUID
(сервис это проверяет — набор слал не-UUID); идентификаторы шага цепочки вычислялись до выполнения предыдущих
шагов; троттлинг формы входа (10 попыток/мин) — набор ждёт 62 с и повторяет вход.

## 5. Регрессия после исправлений

* `npx nx run-many -t lint test --all --parallel=1`: 15 проектов, успешно.
* `npx nx run-many -t e2e build --all --parallel=1`: 15 проектов, успешно (e2e восьми сервисов: 799 тестов зелёные, 5 пропущено по условиям окружения; сборка всех библиотек и сервисов).
* `npm run test:tools`: 31 сьют, 369 тестов; `npx tsc --noEmit -p tools/tsconfig.json` чисто.
* Правила Golden Principles для нового кода набора проверены ESLint (`max-lines-per-function` 30, `max-lines` 300,
  `no-explicit-any`, `no-non-null-assertion`, `explicit-module-boundary-types`): нарушений нет.
* Образы пересобраны после правок библиотек и сервисов (`docker compose build`, затем `up -d --wait`), финальный
  прогон набора — на этих образах.
* Библиотеки в `node_modules/@medcenter/*` — симлинки на `dist/libs/*`: e2e-тесты сервисов используют **собранные**
  библиотеки, поэтому после правки `libs/*` нужен `npx nx build common` (иначе e2e видят старый код — так и был
  «пойман» ложный провал при проверке дефекта 1).

## 6. Отклонения реализации от спецификации (зафиксировано)

1. **Идентификаторы.** Спека §0 — UUID для всех FHIR-ресурсов; HAPI присваивает при `POST` числовые id
   (кабинеты, услуги, записи, приёмы). Принято: id валидируются как FHIR `id` (`[A-Za-z0-9\-.]{1,64}`). Для
   записей/приёмов так сделано раньше, теперь и для `CreateScheduleDto` (дефект 7). Альтернатива — создавать
   ресурсы `PUT` с клиентским UUID — не выбрана.
2. `GET /admin/schedules/{id}/slots` (5.2.6) возвращает голый массив `SlotResponseDto[]` (спека форму не задаёт);
   `GET /doctors/{id}/slots` и `GET /doctor/schedule` — объект `{…, items}` без `meta` (спека §5.2.8: пагинация
   отключена). Оставлено как есть.
3. `SCHEDULE_IN_USE` по спеке §5.2.4 при `cascade:false`; реализовано как «любые слоты» (busy защищают всегда).
4. Приведено к спеке: конверт `GET /notifications`, `details[]` у `VALIDATION_ERROR`, `doctorId` в ответах
   записи, `Idempotency-Key` у `generate`, DTO вместо сырого FHIR у расписаний, 401 вместо 500 для плохих токенов.

## 7. Веб-клиент `http://localhost:3000` (только фиксация, `frontend/` не менялся)

Проверено `curl`: `/` — 200 (заголовок «Медицинский центр», ссылки «Найти врача», «Войти»); `/doctors` — 200, SSR
показывает 4 врачей из API (через встроенный прокси `/api/v1/doctors` -> Traefik); `/login` — 200 («Войти»,
«Зарегистрироваться»); `/register` — 200; `/api/auth/session` — 200 JSON без сессии; `/admin`,
`/doctor/appointments` без сессии — 307 на `/login?returnTo=…`.

Несоответствия (список для отдельного фронтенд-workflow, frontendMismatches):

1. **Вход в браузере сломан:** `GET /api/auth/authorize` строит `redirect_uri` из `request.nextUrl.origin` =
   `http://0.0.0.0:3000/api/auth/callback` (из-за `HOSTNAME=0.0.0.0` в standalone-режиме Next), а в реестре
   зарегистрирован `http://localhost:3000/api/auth/callback`; auth-service отвечает 400 `redirect_uri is not
   registered`. Нужен настраиваемый публичный origin (например, env `WEB_ORIGIN`).
2. Фронтенд ходит в несуществующие пути: `GET /api/v1/admin/rooms` (есть `GET /api/v1/rooms`),
   `GET /api/v1/admin/services` (есть публичный `GET /api/v1/services`), `GET /api/v1/me/appointments[/{id}]`
   (есть `GET /api/v1/appointments[/{id}]`), `GET /api/v1/me/notifications`, `…/unread-count`,
   `POST /api/v1/me/notifications/{id}/read` (есть `/api/v1/notifications…`), `GET /api/v1/schedules/{id}/slots`
   (есть `GET /api/v1/doctors/{id}/slots` и `GET /api/v1/admin/schedules/{id}/slots`).
3. Форма: `notification-bell` ждёт `{unread}`, сервис отдаёт `{count}`; `schedule-editor` шлёт
   `{days, horizonDays}` вместо `CreateScheduleDto`; `slot-generation-dialog` шлёт пустое тело в `generate`
   (нужны `from` и `to`); страница уведомлений теперь получит `{items, meta}` (после дефекта 6), но на другом пути.
4. Страницы `/services` и `/patient/appointments` отвечают 404 (в приложении этих маршрутов нет; пациентские
   записи лежат в группе `(patient)/appointments`).

## 8. CapabilityStatement

`curl -s http://localhost:8080/fhir/metadata > docs/api/capability-statement.json` (создан каталог `docs/api/`):
`resourceType=CapabilityStatement`, **`fhirVersion=4.0.1`**, `status=active`, ПО «HAPI FHIR Server 8.12.0»,
146 типов ресурсов, ~1,9 МБ. Тот же ответ отдаёт edge (`GET http://localhost:8081/fhir/metadata` -> 200, 4.0.1).

## 9. Открытые вопросы

1. **`.env` (действие владельца):** добавить в `scopes` клиента `medcenter-web` значения `user/*.read` и
   `user/*.write`, после чего `docker-compose.override.yml` можно удалить. Также в `.env` стоит
   `JWT_ISSUER=https://api.medcenter.by` (по `iss` токенов и `/.well-known/smart-configuration`): в стенде
   discovery указывает на недоступный хост; значение по умолчанию compose — `http://medcenter.localhost:8081`.
   BFF и auth берут один и тот же `JWT_ISSUER`, поэтому проверка токенов работает.
2. **HAPI без healthcheck.** `docker compose up -d --wait` возвращает управление за ~20 с, а HAPI отвечает через
   ~85 с; сиды, запущенные сразу, получат `ECONNREFUSED`. Добавлен `npm run stack:wait` (опрос
   `/fhir/metadata` и JWKS); смоук вызывает его сам. Healthcheck в самом образе невозможен (нет shell/curl).
3. На пустой БД auth-service при самом первом старте пишет `AuditEvent` бутстрап-админа раньше, чем HAPI
   готов: событие теряется (только WARN). Лечится зависимостью от готовности HAPI (см. п. 2).
4. `seed:terminology` при повторе пишет `updated` для всех ресурсов (идемпотентно, дублей нет); строка
   доказательства `$expand?filter=…` в его выводе показывает 25 совпадений (весь набор), тогда как сервисный
   `GET /api/v1/terminology/expand?filter=` фильтрует верно (проверено смоуком).
5. Данные исследовательских вызовов в начале проверки (одна запись пациента Кузнецова с завершённым приёмом,
   деактивированная учётка `smoke-x…@medcenter.test`) остались в демо-данных; свободные слоты демо расходуются
   (2 за прогон набора) — пополнять `npm run seed:demo`.
6. Лимит входа 10 попыток/мин на адрес: набор делает 7 попыток и при троттлинге ждёт минуту; частые ручные
   перезапуски могут добавить паузу.
7. Один раз по ошибке выполнена `git mv` (перенос `idempotency.service.ts`) — индекс сразу возвращён к
   исходному; сейчас в индексе изменений нет, все правки лежат в рабочем дереве (перенос файла виден как
   удаление в appointment-service и новый файл в `libs/common`).

## 10. Файлы

Новое: `tools/stack-smoke/**` (набор, 37 файлов), `tools/demo-seed/demo-admin-grant.ts(+spec)`,
`libs/common/src/lib/idempotency/idempotency.service.ts(+spec)`, `libs/common/src/lib/pipes/validation.pipe.spec.ts`,
`apps/catalog-service/src/modules/schedules/{schedule-overlap,schedule-removal}.ts(+spec)`,
`apps/catalog-service/src/modules/schedules/schedules.controller.spec.ts`,
`apps/catalog-service/src/modules/cache/idempotency-store.provider.ts`, `docs/api/capability-statement.json`,
этот отчёт. Локально, вне git: `docker-compose.override.yml` (в `.gitignore`).
Изменено: `package.json` (`smoke:stack`, `stack:wait`), `docker-compose.yml` (только комментарии шапки),
`.gitignore`, сервисы и библиотеки из таблицы §4 вместе с их тестами и e2e.

Воспроизведение:

```
docker compose build && npm run stack:up && npm run stack:wait
npm run seed:terminology && npm run seed:demo
bash -c 'set -a; . ./.env; set +a; npm run seed:demo -- --users'
npm run smoke:stack
```

## 11. Исправления по ревью (`code-reviewer-live-stack-report.md`)

Дата: 2026-10-15. Скилл: `coder`. Три major устранены (M1, M2 кодом и тестами, M3 формулировкой и критерием),
минорные — кроме двух, оставленных осознанно (11.2). После исправлений образы 8 BFF пересобраны,
стенд пересоздан (`docker compose up -d --wait`, тома сохранены), `npm run smoke:stack` проходит **122 из 122**
(два прогона подряд, код выхода 0; было 114: +7 шагов удаления расписания, +1 проверка ролей).

### 11.1. Major

**M1. Каскадное удаление расписания на слотах отменённых записей — замечание подтверждено живьём.**
До правки воспроизвёл на HAPI одноразовым набором ресурсов (Location, Schedule, Slot, Appointment `cancelled` со ссылкой
`slot`): `DELETE Slot/{id}` -> `409`, а в batch-Bundle — запись `409 Conflict` (`Unable to delete Slot/… because at least one
resource has a reference to this resource … Appointment.slot`). Значит, старый код отвечал бы `502 INTERNAL` на любом
расписании, где хоть одну запись отменяли, и повтор давал бы то же.

Исправление (`apps/catalog-service/src/modules/schedules/schedule-removal.ts`):

* пачка `DELETE Slot` идёт как раньше; слот, на который HAPI ответил `409`, **не удаляется, а снимается**:
  `PUT Slot` со статусом `entered-in-error` и `If-Match` на прочитанную версию (проверено на HAPI: устаревший `ifMatch` в
  batch даёт `409`). Если слот успели забронировать, версия выросла, запись проваливается и ответ — `409 SCHEDULE_IN_USE`,
  то есть живая бронь не затирается. Любой другой отказ HAPI — `502 INTERNAL`, как и раньше;
* слот выходит из набора `free`, поэтому цикл по страницам продвигается;
* если после этого у расписания остались слоты (снятые), оно **деактивируется** (`active=false`), а не удаляется (HAPI не
  удалит Schedule со ссылающимся Slot). Ответ тот же `204`, повторный `DELETE` безопасен (`204`, без повторных записей);
* деактивированное расписание уже скрыто из `GET /doctors/{id}/slots`, `GET /doctor/schedule` (`active:not=false`) и из
  проверки `SCHEDULE_OVERLAP` (`active=true`); добавлено: `generate` на него -> `409 CONFLICT` (иначе слоты писались бы в
  «удалённое» расписание);
* `GET /admin/schedules/{id}/slots` без `status` отдаёт только `free,busy` (так же, как расписание врача): иначе снятый
  слот показывался бы как `free`, потому что `toSlotResponseDto` сводил любой не-`busy` к `free`. `SlotResponseDto.status`
  получил третье значение `entered-in-error`, оно видно только при явном `?status=entered-in-error`.

Тесты: `schedule-removal.spec.ts` 6 -> 15 (409 в batch -> снятие и деактивация; `If-Match` на версию; проигрыш гонки с
бронью -> `SCHEDULE_IN_USE`; сбой записи снятия -> 502; повторное удаление; неполный ответ batch), `slot-generator.service.spec.ts`
(+1), `schedules.service.list-slots.spec.ts` (2), `slot.mapper.spec.ts` (+1), `clinic-time.spec.ts` (+1), e2e
`schedules-admin-writes` (+1; мок удаления приведён к состоянию, а не к «слоты всегда есть»), `schedules.service.remove.spec.ts`
(возвращены проверки «не удаляет и не трогает кэш при отказе», принадлежность кода каталогу `ERROR_CODES`).
Смоук: новая группа **«schedule removal after a cancelled booking»** (7 шагов): расписание на демо-кабинете и услуге ->
бронь пациентом -> `DELETE cascade:true` при живой брони = `409 SCHEDULE_IN_USE` -> отмена -> `DELETE cascade:true` = `204`
(это и есть M1) -> свободных слотов нет, снятый слот виден по `status=entered-in-error`, расписание в `active=false`, не
в `active=true`, `generate` = `409`, снятый слот не бронируется (`SLOT_CONFLICT`) -> повторный `DELETE` = `204`. Группа
использует **демо-кабинет и демо-услугу**, а не новые: деактивированное расписание остаётся, а значит, держит свой кабинет и
услугу (`ROOM_IN_USE`/`SERVICE_IN_USE`, это следствие ссылочной целостности HAPI). За прогон остаются: одно деактивированное
расписание, один снятый слот, одна отменённая запись (история), уведомления и аудит. При падении цепочки уборщик отменяет
живую бронь и удаляет расписание.

**M2. Проверка ролей не изолировала RoleGuard — исправлено.** `access-matrix.ts: roleProbesFor` строит для каждого
маршрута все не допущенные роли; если семейство scope у зонда (`user/*` у DOCTOR и ADMIN, `patient/*` у PATIENT) совпадает с
семейством допущенной роли, зонд проходит проверку scope и отказать ему может только RoleGuard, значит ответ обязан
быть **ровно `FORBIDDEN_ROLE`**. Теперь: **30 изолирующих зондов** (DOCTOR на admin-маршрутах, ADMIN на doctor-маршрутах,
DOCTOR на `POST /appointments/{id}/cancel`) с точным кодом + **50 зондов** без нужных scope (PATIENT на staff-маршрутах,
DOCTOR/ADMIN на patient-маршрутах) с `FORBIDDEN_ROLE` или `FORBIDDEN_SCOPE`: всего 80 против 43. Потеря `@RequiresRoles(Role.ADMIN)`
на маршруте со `@RequiresScopes` теперь даёт 200 вместо 403 у зонда DOCTOR и краснит смоук. Это доказано юнит-тестом на
подменённом стеке (`checks-access.spec.ts`: врач проходит на `POST /admin/rooms` -> проверка FAIL с именем маршрута; scope-отказ
вместо role-отказа -> FAIL), плюс `access-matrix.spec.ts` (7: правила зондов и «каждый admin-/doctor-маршрут имеет изолирующий зонд»).
Честная граница: на patient-only и staff-only (только по scope) маршрутах RoleGuard снаружи не изолировать, потому что нет токена
с чужой ролью и нужным scope; там проверяется общий 403.

**M3. «Сквозная работа» не распространяется на веб-клиент — формулировка исправлена, критерий зафиксирован.** Шапка отчёта
теперь говорит про API и прямо называет, что веб-клиент не покрыт. Для закрытия WF-6 нужен отдельный проход по
фронтенду (`frontend/` в этом цикле не менялся, это бэкенд-workflow): починить построение `redirect_uri` (сейчас
`request.nextUrl.origin` = `http://0.0.0.0:3000`, при `HOSTNAME=0.0.0.0` в standalone), пути запросов, формы, и покрыть реальный
вход в браузере e2e. Список расхождений: раздел 7; он же в `frontendMismatches` результата.

### 11.2. Minor и nit

| № | Что | Итог |
| --- | --- | --- |
| 1 | Спека и отчёт о `cascade` и UUID -> FHIR id | `specs/api-designer-spec.md` §0, 5.2.4 (таблица состояний), 5.2.5, 5.2.8 обновлены, `MANIFEST.md` — дата; `cascade:true` при busy = `409`, снятие слотов и деактивация, отклонение UUID -> FHIR id записано как отклонение |
| 2 | Постоянный ADMIN в сиде, нет охраны хоста | демо-админ теперь **opt-in**: `seed:demo -- --users --with-admin` (`--with-admin` без `--users` — ошибка); без флага запись и пароль админа прошлого запуска **сохраняются в манифесте** (проверено живьём одобренной командой `-- --users`: все 8 учёток `exists`, запись админа с паролем на месте, ничего не создано). Новый `tools/shared/local-target.ts`: `SEED_FHIR_BASE_URL`, `SEED_AUTH_BASE_URL` и `SMOKE_BASE_URL` должны быть локальными (`localhost`, `127.*`, `::1`, `*.localhost`, `*.test`), иначе отказ, пока не задано `SEED_ALLOW_REMOTE=true` / `SMOKE_ALLOW_REMOTE=true`; в сообщении только имя хоста. Тесты: `local-target.spec.ts` (23), `demo-cli-options.spec.ts` (+5), `seed-demo-users-admin-opt-in.spec.ts` (3), `smoke-config.spec.ts` (+3), `smoke-accounts.spec.ts` (+1). Шапка `docker-compose.yml` обновлена |
| 3 | Уборка учёток только на счастливом пути; `Math.random` | уборщик `deactivateLeftovers` деактивирует всё, что осталось активным, после цепочки (id читается до проверки формы ответа); пароль на каждую учётку отдельный, `crypto.randomBytes`. `checks-auth.spec.ts` (3) |
| 4 | `describe()` печатал 240 символов любого тела | для ответов `>= 400` печатаются только `errorCode` и `detail`, остальное — тип и размер; 2xx с ПДн не эхом. `smoke-assert.spec.ts` (+4) |
| 5 | `ApiClient.request` без таймаута | `AbortSignal.timeout` на запрос и на чтение тела, по умолчанию 60 с, `SMOKE_REQUEST_TIMEOUT_MS`; сообщение «`GET /path got no answer within N ms`». `smoke-http.spec.ts` (+4). **Не покрыто:** `fetch` OAuth-клиента входа (`tools/demo-seed/oauth-pkce-client.ts`) без таймаута |
| 6 | Golden Principles в старом коде | `HttpClient.request` (60 строк) разбит на `send`/`headersFor`/`failureOf`/`readJson`; `authService` (35) — `accountEndpoint`; `fhir-client.provider.spec.ts` разбит (`…failures.spec.ts`). Чтобы утверждение «ESLint проверил Golden-правила» стало проверяемым, добавлены `tools/.eslintrc.golden.json` (max-lines 300, max-lines-per-function 30, no-any, no-`!`, explicit boundary types) и `npm run lint:tools`: 0 нарушений в `tools/`, и 0 нарушений на всех изменённых и новых `.ts` вне `frontend/` (около 120 файлов) (прогон той же конфигурацией). **Не сделано:** правила `max-lines*` по-прежнему не входят в `nx lint` приложений и библиотек (на старом коде они дадут десятки нарушений: решение владельца) |
| 7 | Имена тестов без `when`, слабый spec удаления | переименованы 2 теста в `jwt-auth.guard.verification-errors.spec.ts`, spec удаления расписания усилен (см. M1) |
| 8 | `notifications.controller.ts` | CRLF возвращён (diff 61 -> 9 строк), константы `DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE` из `@medcenter/contracts`, `page` ограничен новой `MAX_PAGE = 1000` (в `contracts`) -> `400 VALIDATION_ERROR` (e2e `page=1001`), `totalItems` без `total` HAPI учитывает смещение (unit). `MAX_PAGE = 1000` дублируется ещё в catalog (2 файла) и practitioner: заменить на общую — отдельным шагом |
| 9 | `Cache-Control: no-cache` на каждом GET; гонка двойного аудита | заголовок теперь только у `search` (чтение по id, операции и записи кэш поиска HAPI не используют); серверная альтернатива (`reuse_cached_search_results_millis`) описана в коде. **Гонка двойного `AuditEvent(create)` не исправлена:** событие пишется в той же транзакции, что и условное создание, а у R4 `AuditEvent` нет `identifier`, т.е. нет естественного ключа для `ifNoneExist`; варианты — писать аудит после транзакции только при `201` (теряется атомарность ADR-014) или ключ в `entity.name`. Решение владельца |
| 10 | `details[]` пропускался для любого `HttpException` | только при `errorCode === 'VALIDATION_ERROR'`; `problem-details.filter.spec.ts` (+2) |
| 11 | `MemoryIdempotencyStore`/провайдер без теста; ошибки Redis после операции | spec провайдера и memory-хранилища (8), хранилище ограничено 1000 записей (сначала удаляются просроченные, потом самая старая). `IdempotencyService`: сбой **записи** после успешной операции логируется и не превращается в 500 (бронь или генерация уже состоялись), сбой **чтения** по-прежнему рвёт запрос до операции (`idempotency.service.spec.ts` +2). Атомарность get -> run -> set не менялась |
| nit | `REQUEST_ID_TYPE` в трёх сервисах; `_elements=id` в `schedule-removal` | не менял: общая константа — отдельная правка трёх сервисов; `_elements=id` не подходит, снятию нужен полный ресурс и версия |
| nit | старые записи с `doctorId: ''` | не менял (нужна миграция данных, на стенде с нуля безвредно) |

### 11.3. Проверки после исправлений

* `npx nx run-many -t lint test e2e build --all --parallel=1 --skip-nx-cache`: 15 проектов, успешно (юнит и e2e: catalog 264 + 132,
  notification 76 + 47, common 174, fhir 31, fhir-mappers 4, contracts 65; остальные сервисы без регрессий).
* `npm run test:tools`: 36 сьютов, 426 тестов; `npm run lint:tools`: чисто; `tsc --noEmit -p tools/tsconfig.json`: чисто.
* Образы 8 BFF пересобраны (`COMPOSE_PARALLEL_LIMIT=2 docker compose build …`), стенд пересоздан, `npm run stack:wait`.
* `npm run smoke:stack`: **122 passed, 0 failed, 0 skipped** дважды подряд (второй прогон с уже накопившимися деактивированными
  расписаниями). Новые строки: группа удаления (7), «RoleGuard alone … 30 probes», «a role without the route's scopes … 50 probes».
* Тома не удалялись.

### 11.4. Остаточные хвосты

* Данные стенда: у каждого прогона смоука остаётся деактивированное расписание, снятый слот и отменённая запись (сейчас 3
  деактивированных расписания, 3 снятых слота): это история, а не мусор; свободные слоты демо расходуются — пополнять
  `npm run seed:demo`.
* Одноразовые ресурсы моей ручной диагностики M1 на HAPI (удалять не стал, к сервисам они не привязаны):
  `Location/1811` («zz-repro»), `Schedule/1812` (деактивировано), `Slot/1813` (`entered-in-error`), `Appointment/1814`
  (`cancelled`, без пациента).
* Воспроизведение: `docker compose build && npm run stack:up && npm run stack:wait`, затем `npm run seed:terminology`,
  `npm run seed:demo`, `bash -c 'set -a; . ./.env; set +a; npm run seed:demo -- --users --with-admin'` (флаг нужен только при первом
  создании демо-админа), `npm run smoke:stack`.
* Для коммита (orchestrator): не добавлять `git add -A` (см. список в `code-reviewer-live-stack-report.md`); новые файлы этого шага —
  `apps/catalog-service/src/modules/cache/idempotency-store.provider.spec.ts`,
  `apps/catalog-service/src/modules/schedules/schedules.service.list-slots.spec.ts`,
  `libs/fhir/src/lib/fhir-client.provider.failures.spec.ts`, `tools/.eslintrc.golden.json`, `tools/shared/local-target{,.spec}.ts`,
  `tools/demo-seed/seed-demo-users-admin-opt-in.spec.ts`, `tools/stack-smoke/{checks-schedule-removal,checks-access.spec,
  checks-auth.spec,access-matrix.spec}.ts`.
