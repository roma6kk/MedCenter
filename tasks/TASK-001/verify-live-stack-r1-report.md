# Независимая проверка живого стенда, раунд 1 (verify, повторный прогон)

Дата: 2026-10-16, прогоны 08:17-08:35 (+03), то есть 05:17-05:35 UTC. Ветка: `feature/clinic-platform-wip`, HEAD = `20795ce`
(база сравнения: «изменено с 20795ce» = рабочее дерево относительно HEAD).
Скилл: `verify`. Уровень: Standard плюс 7 проверок стенда из задания. DoD: `.clinerules/DOD.md` (идентичен `.claude/DOD.md` по назначению).

Режим: скептичный. Предыдущий отчёт этого же файла (от 2026-10-15) не использовался как доказательство: все 7 проверок
воспроизведены заново на стеке, который хост поднял после перезагрузки. Код не менялся, state-changing git-команд не запускалось
(`git add/commit/stash/checkout/reset/restore` не вызывались). `.env` не читался и не печатался. Значения секретов нигде не
выводились; пароли демо-учёток не печатались (учётки названы по email). Чужой контейнер `corporate-redis-cache` не тронут,
тома проекта не удалялись и не пересоздавались.

## Вердикт

**PASS по всем 7 обязательным проверкам.** Блокирующих замечаний нет. Есть 7 не блокирующих замечаний (раздел «Замечания вне 7 проверок»),
главное из них: корневой `npm run typecheck` красный (5 уже закоммиченных `main.spec.ts`), в Standard-таблице DoD это строка FAIL, но она
существовала в HEAD до этих изменений и не влияет на сборку, тесты и образы.

| # | Проверка | Статус |
|---|---|---|
| 1 | `docker compose ps`: 14 контейнеров запущены и healthy | PASS (13 с состоянием healthy; hapi без docker-healthcheck, отвечает 200) |
| 2 | `npm run smoke:stack` дважды подряд | PASS (122/122 три раза подряд: два требуемых прогона и контрольный третий, код выхода 0) |
| 3 | Безопасность edge | PASS |
| 4 | Гонка BR-001: ровно один 201 и один 409, 5 раз | PASS (5 из 5 двухсторонних гонок + 2 гонки по 6 запросов; плюс 3 встроенные гонки smoke) |
| 5 | Клиническая цепочка в HAPI | PASS |
| 6 | Юнит-тесты и lint затронутых проектов | PASS (11 проектов, 1334 теста, lint чистый; дополнительно 4 зависимых проекта, tools и сборка всех 15 проектов) |
| 7 | `docs/api/capability-statement.json` | PASS |

## Контекст стенда на момент проверки

Хост был перезагружен за 14 минут до начала (`uptime`: up 14 min на 08:18). Docker поднял все 14 контейнеров по `restart: unless-stopped`
в 05:17:46 UTC (все `StartedAt` совпадают с точностью до секунды). То есть проверка шла на холодном старте стека, а не на стеке,
который кто-то подготовил заранее. Данные (тома postgres, HAPI-БД, RabbitMQ, Redis) пережили перезагрузку: демо-справочники,
демо-пользователи и прежние 10 завершённых приёмов были на месте (12 после двух первых прогонов smoke).

Первые 30 секунд после старта в логах notification-service и analytics-service есть `ECONNREFUSED` к RabbitMQ (`:5672`) и HAPI (`:8080`),
временные метки 05:17:51-05:18:22 UTC. Это сервисы, стартовавшие раньше брокера и HAPI (при рестарте демоном `depends_on` не применяется).
Затем они подключились сами: `RestartCount = 0` у всех 14 контейнеров, брокерная цепочка работает (Communication появляются, см. п. 5).
После 05:18:22 UTC `ECONNREFUSED` не было. HAPI начал отвечать на `/fhir/metadata` примерно через 75 секунд после старта контейнера (первые четыре опроса с интервалом 10 с вернули отказ соединения).

Образы 8 BFF собраны 2026-10-15 11:55 (+03), позже самого свежего изменённого исходника (`catalog-service/test/...` в 11:42), то есть
контейнеры выполняют код рабочего дерева. Образ web (2026-10-14 00:50) новее любых правок в `frontend/` (файлов новее образа нет,
`git diff 20795ce -- frontend` пуст).

## 1. Контейнеры

`docker compose ps -q | wc -l` = 14, `docker compose config --services | wc -l` = 14. Через минуту после старта:

| Контейнер | state | health | restarts |
| --- | --- | --- | --- |
| analytics, appointment, auth, catalog, encounter, notification, patient, practitioner (8 BFF) | running | healthy | 0 |
| postgres, redis, rabbitmq, traefik, web | running | healthy | 0 |
| hapi (`hapiproject/hapi:v8.12.0-2@sha256:0ff86a...`) | running | нет healthcheck (`.State.Health` отсутствует) | 0 |

Оговорка по hapi: образ distroless, в `docker-compose.yml` это отмечено комментарием («distroless image: no shell for a healthcheck»),
а зависимость от него оформлена как `service_started`. Поэтому «healthy» в docker-смысле у hapi получить нельзя. Вместо этого проверен отклик:
`GET http://localhost:8080/fhir/metadata` три раза подряд дал 200 (0,37 / 0,58 / 0,46 с), `GET /fhir/Patient?_summary=count` дал 200 с `total: 15`.
После всех прогонов (13 минут работы, включая три smoke, гонки, тесты и сборку) все 14 контейнеров по-прежнему `Up`, 13 из них `healthy`, рестартов 0.

## 2. `npm run smoke:stack`

Три прогона подряд на одном стенде (логи в scratchpad сессии: `smoke-run1.log`, `smoke-run2.log`, `smoke-run3.log`):

| Прогон | Итог | Код выхода | Строк `ok` |
| --- | --- | --- | --- |
| 1 | `TOTAL 122 passed, 0 failed, 0 skipped` | 0 | 122 |
| 2 (идемпотентность) | `TOTAL 122 passed, 0 failed, 0 skipped` | 0 | 122 |
| 3 (контроль после гонок, тестов и сборки) | `TOTAL 122 passed, 0 failed, 0 skipped` | 0 | 122 |

Прогон 1 занял 27,5 с. Во всех группах `PASS`: setup 3, edge 5, login (PKCE) 7, auth-service 13, terminology 7, catalog 8,
admin catalog 16, schedule removal 7, access 5, chain: booking 8, chain: encounter 6, terminology: invalid codes 6,
chain: patient record 4, chain: notification + analytics + audit 7, compartment (ADR-013) 11, BR-001 race + cancel 5, no-show 3,
route coverage 1 (все 55 маршрутов `/api/v1` восьми сервисов получили хотя бы один 2xx). Строк `FAIL` и `SKIP` нет.

Как понимать «from scratch»: набор не создаёт демо-данные сам, он требует засеянные справочники и манифест
`tools/demo-seed/output/demo-manifest.json` (в `.gitignore`). Пересоздавать тома для чистого старта не пришлось и по правилам не требовалось
(«не удалять тома без необходимости»), поэтому «с нуля» здесь означает холодный старт всего стека после перезагрузки хоста,
без ручной подготовки перед прогоном. Собственная подготовка smoke (логины PKCE шестью учётками, регистрации, создание и удаление
каталожных данных, уникальные суффиксы) сработала при каждом из трёх запусков.

Наблюдение для эксплуатации: каждый прогон безвозвратно занимает два свободных слота демо-врача (слот цепочки приём/завершение
и слот сценария no-show остаются busy). Сейчас у демо-врача 128 свободных слотов на ближайшие 14 дней, предусловие smoke
(«не меньше 4») выполняется с большим запасом.

## 3. Безопасность edge

Выполнено командами, значения секретов не выводились.

Маршрутизация через Traefik `http://localhost:8081`:

| Запрос | Ответ |
| --- | --- |
| `GET /fhir/Patient` | **404** |
| `GET /fhir/metadata` | **200**, `"fhirVersion": "4.0.1"` |
| `/fhir/Patient/1`, `/fhir/Observation`, `/fhir/`, `/fhir`, `/fhir/Patient?_summary=count`, `/fhir/%24export` | 404 |
| `/FHIR/Patient`, `//fhir/Patient`, `/fhir/metadata/../Patient`, `/fhir/metadata%2f..%2fPatient`, `/fhir/metadata/` | 404 |
| то же через TLS `https://localhost:443`: `/fhir/Patient` 404, `/fhir/metadata` 200 | совпадает |
| `GET /api/v1/notifications` без токена | 401 |

Ни один из 11 вариантов обхода (регистр, двойной слеш, `..`, закодированный слеш, `$export`) не открыл ресурсы HAPI; наружу отдаётся только `metadata`.
Прямой `GET http://localhost:8080/fhir/metadata` также даёт `fhirVersion 4.0.1`.

Привязка портов: `docker port medcenter-hapi-1` = `8080/tcp -> 127.0.0.1:8080`; `ss -ltn`: `127.0.0.1:8080`. Все опубликованные порты проекта
(`443`, `8081`, `3000`, `3001`, `5433`, `5672`, `6380`, `8080`) слушают только на `127.0.0.1`; фильтр по `0.0.0.0`, `*`, `[::]` для этих портов пуст.
Порты остальных BFF и management-порт RabbitMQ (15672) на хост не опубликованы.

`JWT_PRIVATE_KEY` в окружении контейнеров (проверялось по имени: `docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | grep -x JWT_PRIVATE_KEY`
для каждого из 14 контейнеров): **есть только у `medcenter-auth-service-1`**. У остальных 13 (analytics, appointment, catalog, encounter,
notification, patient, practitioner, hapi, postgres, rabbitmq, redis, traefik, web) переменной нет.
Дополнительно по именам чувствительных переменных: среди BFF `JWT_PUBLIC_KEY`, `OAUTH_CLIENTS_JSON`, `BOOTSTRAP_ADMIN_*` и `POSTGRES_PASSWORD` есть только у auth-service;
`DB_PASSWORD` только у auth и analytics; `FHIR_CLIENT_SECRET` у всех 8 BFF (необязательные учётные данные клиента HAPI); у web и traefik чувствительных имён нет.

Предупреждение о методике: `JWT_PRIVATE_KEY` и `JWT_PUBLIC_KEY` многострочные (PEM). Сырой вывод `... | cut -d= -f1` для auth-service напечатал бы
строки тела ключа, потому что `cut` режет по `=` построчно, а PEM-строки не содержат `=`. Поэтому вывод везде фильтровался (`grep -x` по точному имени
или `grep -E` по шаблону имён); в таком фильтре от PEM попадает только маркер `-----END RSA PRIVATE KEY-----`, материала ключа нет.
Если проверку будут повторять, не печатайте список имён без фильтра.

## 4. Гонка BR-001

Независимый скрипт (вне репозитория, `scratchpad/race-verify.ts`): для переиспользования взяты только `signIn`, `loadAccounts`, `ApiClient` из `tools/stack-smoke`,
собственные проверки и запросы к HAPI написаны заново. Три пациента входят через настоящий PKCE-поток; `POST /api/v1/appointments` отправляется параллельно
(`Promise.all`, разные `Idempotency-Key`) на один свободный слот; после каждого раунда запрашивается HAPI напрямую
(`GET /fhir/Appointment?slot=Slot/{id}`), затем победитель отменяется администратором (cleanup).

| Раунд | Участников | Коды ответов | 201 | 409 | Appointment в HAPI со статусом `booked` до очистки |
| --- | --- | --- | --- | --- | --- |
| 1 | 2 | 409,201 | 1 | 1 | 1 |
| 2 | 2 | 409,201 | 1 | 1 | 1 |
| 3 | 2 | 409,201 | 1 | 1 | 1 |
| 4 | 2 | 201,409 | 1 | 1 | 1 |
| 5 | 2 | 409,201 | 1 | 1 | 1 |
| 6 (усиленный) | 6 | 201,409,409,409,409,409 | 1 | 5 | 1 |
| 7 (усиленный) | 6 | 409,201,409,409,409,409 | 1 | 5 | 1 |

Во всех 409 тип проблемы `https://api.medcenter.by/errors/slot-conflict` (код `SLOT_CONFLICT`). Каждый раунд шёл на другом слоте, победитель менялся
(иногда первый запрос, иногда второй), то есть исход определяет конкуренция, а не порядок отправки. После очистки в HAPI по каждому слоту
все Appointment имеют статус `cancelled`, зависших `booked` нет. Итог скрипта: `RACE RESULT: all rounds exactly one 201 and the rest 409`.

Это же независимо подтверждено встроенным шагом smoke «two concurrent POST /appointments for one free slot -> exactly one 201 and one 409 SLOT_CONFLICT»
во всех трёх прогонах (проверка 2). Механизм виден в логах HAPI: на каждую гонку приходятся ошибки `HAPI-0550/HAPI-0823` и
`duplicate key value violates unique constraint "idx_resver_id_ver"` (оптимистическая блокировка версии `Slot`) в моменты 05:20:25, 05:21:53 (прогоны smoke)
и 05:22:48-49 (мои раунды). Это ожидаемая работа блокировки, BFF превращает её в 409; но в логах HAPI она выглядит как ERROR.

## 5. Клиническая цепочка в HAPI (прямой запрос на `localhost:8080`)

Свежие цепочки созданы моими двумя первыми прогонами smoke (метки `meta.lastUpdated` 05:20:10 и 05:21:42 UTC). Разбор последней, `Encounter/2253`:

| Ресурс | Что найдено |
| --- | --- |
| `Encounter/2253` | `status = finished`, class `AMB`, `subject = Patient/1439`, `appointment = Appointment/2249`, `diagnosis[0].condition = Condition/2254`, `statusHistory` с `in-progress`, `period` start и end заданы |
| `Condition/2254` | код `https://fhir.by/CodeSystem/InternClassificDiseases10` `J06.9`, `clinicalStatus = active`, `verificationStatus = confirmed`, `category = encounter-diagnosis`, `encounter = Encounter/2253`, `subject = Patient/1439` |
| `Observation/2257` | код `https://fhir.by/CodeSystem/nsi-observations` `20006` «Температура тела», `valueQuantity = 36.6 Cel` (`system http://unitsofmeasure.org`, `code Cel`), `status = final`, `encounter = Encounter/2253` |
| `MedicationRequest/2259` | `medicationCodeableConcept` `http://www.whocc.no/atc` `J01FA10`, `status = active`, `intent = order`, **`encounter = Encounter/2253`**, **`reasonReference = Condition/2254`**, `subject = Patient/1439`, `requester = PractitionerRole/6ef5270b-...` |
| `ServiceRequest` | 1 шт. на приём (`?encounter=Encounter/2253`) |

Предыдущая цепочка (`Encounter/2188`) имеет ту же структуру: `Condition/2189` J06.9, `Observation/2192` 36.6 Cel, `MedicationRequest/2194` J01FA10 со ссылками
на `Encounter/2188` и `Condition/2189`. Всего в HAPI на момент этого запроса 12 завершённых Encounter (после двух прогонов smoke; после третьего их 13). Ссылки замкнуты: MedicationRequest ссылается на Encounter и на Condition,
Condition и Observation ссылаются на тот же Encounter.

Communication для пациента (`GET /fhir/Communication?recipient=Patient/1439&sent=ge2026-10-16T05:21:00Z&_sort=sent`):

| sent (UTC) | category | текст |
| --- | --- | --- |
| 05:21:41.497 | appointment | «Вы записаны на приём. Начало: 2026-10-19T08:00:00.000Z» |
| 05:21:42.205 | encounter | «Приём завершён. Результаты доступны в медицинской карте.» |
| 05:21:53.683 | appointment | «Вы записаны на приём...» (сценарий отмены) |
| 05:21:53.775 | appointment | «Запись на приём отменена. Причина: ...» |

Communication о завершении приёма появился через 0,12 с после перехода Encounter в `finished`. Всего в HAPI 142 Communication. Это подтверждает работу цепочки
encounter-service → RabbitMQ → notification-service → HAPI.

## 6. Юнит-тесты и lint

Список затронутых проектов получен из `git diff --name-only` плюс `git ls-files --others --exclude-standard` относительно HEAD `20795ce`:
apps `catalog-service` (22 файла), `appointment-service` (10), `encounter-service` (7), `notification-service` (5), `practitioner-service` (1),
`patient-service` (1), `analytics-service` (1); libs `common` (8), `fhir` (3), `fhir-mappers` (2), `contracts` (2). Не затронуты:
`auth-service`, `messaging`, `config`, `terminology`, `frontend/`.

Команда: `npx nx run-many -t test lint -p catalog-service,appointment-service,encounter-service,notification-service,practitioner-service,patient-service,analytics-service,common,contracts,fhir,fhir-mappers --parallel=1 --skip-nx-cache`
(без кэша nx, то есть тесты действительно исполнялись). Итог: `Successfully ran targets test, lint for 11 projects`, код выхода 0, 4 мин 2 с.

| Проект | Suites | Tests | lint |
| --- | --- | --- | --- |
| contracts | 7 | 65 | чисто |
| common | 17 | 174 | чисто |
| fhir | 3 | 31 | чисто |
| fhir-mappers | 1 | 4 | чисто |
| practitioner-service | 15 | 106 | чисто |
| patient-service | 12 | 183 | чисто |
| appointment-service | 17 | 142 | чисто |
| encounter-service | 11 | 96 | чисто |
| catalog-service | 36 | 264 | чисто |
| analytics-service | 17 | 193 | чисто |
| notification-service | 4 | 76 | чисто |
| **Итого** | **140** | **1334** | |

Дополнительно (Standard-уровень DoD, всё с `--skip-nx-cache`):

| Проверка | Результат |
| --- | --- |
| `nx run-many -t test lint -p auth-service,terminology,messaging,config` (зависят от изменённых libs) | PASS: config 8, messaging 6, terminology 27, auth-service 673 passed + 14 skipped (1 suite пропущен: интеграционные Postgres-тесты `describePostgres`, включаются переменной окружения, файлы не менялись) |
| `npm run test:tools` | PASS: 36 suites, 426 tests |
| `npm run lint:tools` (golden-правила: max-lines 300, max-lines-per-function 30, no-explicit-any, no-non-null-assertion) | PASS, код 0 |
| `npx nx run-many -t build --all --parallel=1 --skip-nx-cache` | PASS: 15 проектов |
| `npx tsc --noEmit -p tsconfig.base.json` (`npm run typecheck`) | **FAIL**, см. замечание 1 |
| `tsc --noEmit -p apps/<svc>/tsconfig.spec.json` для analytics, appointment, encounter, notification, patient | PASS (ошибок нет) |

## 7. `docs/api/capability-statement.json`

Файл существует (1 951 728 байт, 2026-10-15 10:01): `resourceType = CapabilityStatement`, **`fhirVersion = 4.0.1`**, `status = active`, `kind = instance`,
`software = HAPI FHIR Server 8.12.0`, `rest[0].mode = server`, 146 типов ресурсов. Сравнение с живым `GET http://localhost:8081/fhir/metadata`:
версия 4.0.1, 146 типов ресурсов, наборы типов совпадают полностью (различий в обе стороны 0). Файл лежит в неотслеживаемом `docs/`
(в git его нет), поэтому его нужно добавить в коммит.

## Минимальный и стандартный DoD

| Пункт | Статус | Подробности |
| --- | --- | --- |
| Незакоммиченные изменения (`git diff --stat`) | информационно | 70 файлов изменено (+1142/-745), 68 `M` + 2 `D`, 37 неотслеживаемых путей. Коммитит оркестратор |
| Именование файлов в `tasks/` и `specs/` | замечание 5 | Отчёты этой задачи названы с префиксом скилла. Есть старые файлы без префикса скилла |
| Тесты, lint, сборка | PASS | См. п. 6 |
| `tsc --noEmit` | FAIL (не блокирует) | Замечание 1 |
| Покрытие новым кодом | PASS | Новые модули имеют `.spec.ts`: `idempotency-store.provider`, `schedule-overlap`, `schedule-removal`, `schedules.controller`, `local-target`, `demo-admin-grant`, `libs/common/.../idempotency/`, `validation.pipe`, `fhir-client.provider.failures`; smoke покрывает 55 маршрутов |
| OWASP (выборочно) | PASS | Edge закрывает HAPI (п. 3), секреты изолированы по контейнерам, порты на `127.0.0.1`, JWT-защита (401 без токена), compartment-проверки (403) в smoke, SMART-scope матрица проверена |
| Belgian-терминология (AGENTS.md) | PASS | В изменённых и новых файлах вне `labs/`, `tasks/`, `.claude/`, `.clinerules/`, PDF и DOCX упоминаний нет |
| `TODO/FIXME/HACK` в изменённых и новых исходниках | PASS | Не найдено |
| Файлы длиннее 300 строк | замечание 3 | 3 файла |

## Замечания вне 7 проверок (не блокирующие)

1. **Корневой `npm run typecheck` красный.** 35 ошибок TS2451/TS2393 «Cannot redeclare block-scoped variable» в пяти
   `apps/{analytics,appointment,encounter,notification,patient}-service/src/main.spec.ts` (7 в каждом: `mockCreate`, `mockRedis`,
   `mockSetRateLimitStore`, `ENV`, `MANAGED_KEYS` и две функции). Причина: файлы без `import`/`export` считаются скриптами, их глобальные
   объявления сталкиваются, когда `tsc -p tsconfig.base.json` компилирует репозиторий целиком. Файлы не изменены относительно HEAD
   (последний коммит `20795ce`), то есть дефект уже в закоммиченном коде. Поэтому сборка проектов, jest и `tsc -p apps/<svc>/tsconfig.spec.json`
   проходят. Простейшее исправление: добавить `export {};` (или `import`) в эти пять файлов. CI-воркфлоу в репозитории нет (`.github/` отсутствует),
   `typecheck` ни в каком хуке не вызывается.
2. **У HAPI нет docker-healthcheck** (distroless-образ), поэтому `docker compose ps` показывает 13 healthy из 14 и `depends_on` для HAPI использует `service_started`.
   Следствие виднее при холодном старте: notification и analytics 30 секунд логировали `ECONNREFUSED` к HAPI и RabbitMQ, пока те не поднялись
   (восстановились сами). Можно решить внешним healthcheck (например, из контейнера traefik/другого сервиса) или ретраями старта.
3. **Три файла длиннее ~300 строк** (golden-принцип): `libs/fhir/src/lib/fhir-client.provider.ts` 356 строк (в HEAD 336),
   `apps/appointment-service/src/modules/appointments/appointments.service.spec.ts` 305 (в HEAD 286),
   `apps/catalog-service/test/schedules-admin-writes.e2e-spec.ts` 318 (в HEAD 212). `nx lint` проходит, потому что правило `max-lines` в `.eslintrc.json` корня и проектов не настроено (проверено `grep`); оно включено только в `tools/.eslintrc.golden.json` (`npm run lint:tools`).
4. **`Communication.subject` пуст, адресат лежит в `Communication.recipient`**; статус всех уведомлений `in-progress`.
   Поиск `Communication?subject=Patient/1439` вернёт 0, `?recipient=Patient/1439` вернёт 50. Для R4 это допустимо (`subject` необязателен),
   но клиенты, ищущие по `subject`, ничего не найдут. Код наблюдения температуры локальный (`nsi-observations 20006`), без LOINC; задание этого не требует.
5. **Имена файлов без префикса скилла** в отслеживаемом дереве: `tasks/TASK-001/review-auth-service-backend.md`,
   `tasks/TASK-001/review-findings-final-checklist.md` (префикс `review-` не совпадает с именем скилла), `tasks/TASK-002/implementation-plan.md`.
   Правило AGENTS.md запрещает такие файлы в `tasks/`. К нынешним изменениям не относятся.
6. **Мусор в корне репозитория, неотслеживаемый:** пустой файл `**For` (6 октября), PDF/DOCX лабораторных работ, каталог `labs/`, `.claude/settings.local.json`.
   При коммите нужен точечный `git add`: `git add -A` затащит их в историю. В образы они не попадают: `.dockerignore` пропускает только `package.json`, `package-lock.json`, `nx.json`, `tsconfig.base.json`, `apps/` и `libs/`.
7. **Параллельная запись в `tasks/TASK-001/`:** в 08:19:34, уже во время моей проверки, появился файл `coder-frontend-mismatches-input.md`
   (в начале текста написано «Собрано оркестратором»). Это не мой файл; на результаты стенда он не влияет. Для учёта: задание утверждало, что в чекауте работает
   только один агент, а в дереве за время проверки появился ещё один артефакт.

## Воспроизведение

```bash
docker compose ps; docker port medcenter-hapi-1; ss -ltn
npm run smoke:stack                      # x2
npx ts-node scratchpad/race-verify.ts    # гонка, нужен TS_NODE_PROJECT=tsconfig.base.json
curl -s http://localhost:8080/fhir/Encounter?status=finished  # цепочка в HAPI
npx nx run-many -t test lint -p catalog-service,appointment-service,encounter-service,notification-service,practitioner-service,patient-service,analytics-service,common,contracts,fhir,fhir-mappers --parallel=1
```

Логи прогонов (smoke x3, гонка, nx, tools, typecheck, build) сохранены в scratchpad сессии
`/tmp/claude-1000/-mnt-BE48B9DF48B9971D-projs-MedCenter/dc59563e-9984-43f8-9c25-f3dfc920d1da/scratchpad/`.

## Context Summary

Проверено на Standard-уровне плюс 7 живых проверок из задания; воспроизведено всё заново после холодного старта хоста. Все 7 обязательных
проверок PASS: 14 контейнеров запущены (13 healthy, hapi без healthcheck отвечает 200), smoke 122/122 трижды, edge закрывает HAPI и держит
`JWT_PRIVATE_KEY` только в auth-service, гонка BR-001 даёт ровно один 201 в 7 из 7 раундов (и в 3 из 3 прогонах smoke), цепочка
Encounter/Condition/Observation/MedicationRequest/Communication подтверждена прямо в HAPI, 1334 теста и lint 11 затронутых проектов зелёные,
capability-statement.json валиден. Блокеров нет; единственный красный пункт Standard DoD (корневой `typecheck`) уже был в HEAD.

## Next Steps

**Все обязательные проверки PASS, следующий шаг по потоку:** `/finishing-branch` с этим контекстом (перед коммитом: добавить неотслеживаемый `docs/`,
`tools/stack-smoke/`, новые `*.ts` и отчёты точечно, не брать мусор из замечания 6).

Необязательно до коммита: `/coder` для исправления замечания 1 (`export {};` в пяти `main.spec.ts`) и замечания 3 (разбить три длинных файла).
