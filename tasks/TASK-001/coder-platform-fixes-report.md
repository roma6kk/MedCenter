# coder-platform-fixes-report.md

**Skill:** coder (backend) · **Задача:** сквозные исправления платформы — R4-поиск в `practitioner-service`,
каталог кодов ошибок, `trust proxy`, конверт пагинации списков · **Дата:** 2026-10-14

> Возобновлённый прогон. Предыдущие попытки прервались, а часть работы выполняли две копии агента
> одновременно (общий agentId). В рабочем дереве уже лежали: общий HTTP-хелпер в `libs/common`,
> правки `main.ts` семи сервисов, удалённые локальные копии `trust-proxy`/`http-edge`, коды `*_IN_USE`,
> R4-запросы докторов и кабинетов, конверт списка услуг. Всё это проверено и сохранено, дубликатов
> модулей нет. Не было сделано: конверт `{ items, meta }` и поле `name` в `practitioner-service`
> (пункт 4), а также e2e/живая проверка и отчёт — закрыто в этом прогоне.

## Что сделано

### 1. R4-валидные запросы в `practitioner-service`

R4 не имеет `Practitioner?qualification-code=` и `Location?physical-type=` (живой HAPI отвечает 400
`HAPI-0524` — подтверждено повторно, `curl`). Список параметров сверен через `fhir-docs`: у `Location`
нет параметра над `physicalType`, у `PractitionerRole` есть `specialty` (token), `service` (reference)
и цепочка `practitioner.name`.

- `DoctorsService.list`: фильтры `specialty` и `serviceId` уходят в
  `PractitionerRole?specialty=&service=HealthcareService/{id}&practitioner.name=&_include=PractitionerRole:practitioner&_count&_offset&_total=accurate`.
  Врачи берутся из `_include`-нутых `Practitioner` в порядке ролей; практитионер с несколькими ролями на
  странице показан один раз; роль без практитионера пропускается. Без фильтров — обычный
  `Practitioner?name=&_count&_offset&_total=accurate`. Пустые строки `specialty`/`serviceId`
  считаются отсутствующими (пустой токен выпал бы из URL и расширил поиск).
- `RoomsService.list`: `Location` читается порциями (`_count=100&_offset=N`, потолок 1000 записей),
  комнаты отбираются по `physicalType.coding` (`system` HL7 `location-physical-type`, код `ro`),
  страница вырезается из списка комнат. Так пагинация и `totalItems` считают именно комнаты, а не все
  `Location` (здание между кабинетами не укорачивает страницу и не раздувает итог).
- Запросы вынесены в `doctor-search.ts` и `room-search.ts`; точные строки запросов покрыты тестами
  (`doctors.service.query-string.spec.ts` прогоняет настоящий `HttpClient` со шпионом на `fetch`;
  `doctors.service.spec.ts`, `rooms.service.list.spec.ts`).

### 2. Коды ошибок `ROOM_IN_USE`, `SERVICE_IN_USE`, `SCHEDULE_IN_USE`

- `libs/contracts/src/lib/error-code.ts`: в `ERROR_CODES` добавлены три кода (стало **20**), в
  `ERROR_CODE_HTTP_STATUS` для каждого `409`. Коды названы в `specs/api-designer-spec.md` (4.6, 5.1.5, 5.2.4).
  `error-code.spec.ts` обновлён (20 кодов, статус 409).
- Места броска уже передавали `errorCode` в теле `ConflictException` (`rooms.service.ts`,
  `services.service.ts`, `schedules.service.ts`). `ProblemDetailsFilter` продвигает в ответ только коды из
  `ERROR_CODES`, поэтому раньше клиент получал `CONFLICT`. Теперь в ответе `ROOM_IN_USE` /
  `SERVICE_IN_USE` / `SCHEDULE_IN_USE`; метка в начале `detail` сохранена. Устаревшие комментарии
  «кода ещё нет в контракте» удалены.
- Тесты: бросаемый код входит в `ERROR_CODES` (`rooms.service.spec.ts`, `services.service.spec.ts`,
  новый `schedules.service.remove.spec.ts`); e2e `room-usage` ожидает `errorCode: ROOM_IN_USE`.
- Фронтенд не менялся (см. «Расхождения с фронтендом»).

### 3. `trust proxy` и гигиена заголовков для семи BFF

- Новые файлы `libs/common/src/lib/http/`:
  - `trust-proxy.ts` — перенос `parseTrustProxy` из `auth-service` (`true`/`false`, число хопов, список
    IP/CIDR/`loopback`/`linklocal`/`uniquelocal`; прочее бросает ошибку при старте) + тесты;
  - `http-edge.ts` — `applyHttpEdge(app, trustProxy = parseTrustProxy(process.env.TRUST_PROXY))`:
    выставляет Express `trust proxy` и отключает `x-powered-by`; тест на настоящем Express (supertest):
    `req.ip` берётся из `X-Forwarded-For` при одном доверенном хопе, без доверия игнорируется,
    заголовка `X-Powered-By` нет, неверный `TRUST_PROXY` бросает ошибку;
  - `index.ts` и одна строка `export * from './lib/http';` в `libs/common/src/index.ts` (аддитивно).
- `applyHttpEdge(app)` вызывается сразу после `NestFactory.create` в `main.ts`: `patient-service`,
  `appointment-service`, `notification-service`, `encounter-service`, `analytics-service`.
- `catalog-service` и `practitioner-service` имели локальные копии (`config/http-edge.ts`,
  `config/trust-proxy.ts` + тесты) — удалены. `bootstrap.ts` вызывает общий `applyHttpEdge`; разбор
  `TRUST_PROXY` идёт до `NestFactory.create`, поэтому неверное значение ломает старт до создания
  приложения. Остаток `enableRateLimit` перенесён в `config/rate-limit.ts` (+ спека). `bootstrap.spec.ts`
  проверяет `trust proxy` и `x-powered-by`; в `rate-limit-proxy.e2e-spec.ts` обоих сервисов добавлен тест
  на отсутствие `X-Powered-By`.
- `apps/auth-service` не тронут (у него своя копия).

### 4. Конверт пагинации списков (API §0)

Формат `PaginatedResponseDto` из `libs/contracts`: `{ items, meta: { page, pageSize, totalItems,
totalPages } }`, как в `appointment-service` и `patient-service`.

- `GET /api/v1/services` (`catalog-service`): вместо массива возвращается конверт. Поиск в HAPI идёт с
  `_total=accurate`; без `Bundle.total` итог считается как `(page-1)*pageSize + items.length`.
  Кэшируется весь конверт; ключ страницы версионирован (`catalog:services:v2:{page}:{pageSize}`), чтобы
  массив, закэшированный прежним релизом, не отдавался как конверт (префикс `catalog:services:` сохранён,
  инвалидация по префиксу работает). Тесты конверта вынесены в `services.service.page.spec.ts`
  (основной spec был бы >300 строк).
- `GET /api/v1/doctors` (`practitioner-service`): `DoctorsService.list` возвращает `DoctorPage`.
  `totalItems` берётся из `Bundle.total` (при ролевом поиске это число подходящих ролей; врач с
  несколькими подходящими ролями учитывается по числу ролей — граничный случай, для демо-данных и для
  типичной модели «одна роль на специальность» итог точен).
- `GET /api/v1/rooms`: `RoomsService.list` возвращает `RoomPage`; `totalItems` — число комнат (см. п. 1).
- Общий помощник `src/common/page-envelope.ts` (`toPage`) — один расчёт `meta` для докторов и комнат
  (+ `page-envelope.spec.ts`).
- `DoctorResponseDto` получил `name` (given + family, например `Мария Иванова`). Расчёт — в локальном
  `doctors/doctor.mapper.ts` поверх общего `toDoctorResponseDto` из `libs/fhir-mappers`: общую библиотеку
  не трогал (вне владения). `GET /doctors/{id}` тоже отдаёт `name`. `room-usage.mapper` по-прежнему
  использует `firstName`/`lastName` общего маппера.

## Проверка на живом HAPI (`http://localhost:8080/fhir`, засеян `tools/demo-seed`)

Прямые запросы с точными строками, которые формируют сервисы:

| Запрос | Результат |
| --- | --- |
| `Practitioner?_count=20&_offset=0&_total=accurate` | 200, total 4 |
| `Practitioner?name=Иван` (url-encoded) | 200, total 1 (Иванова) |
| `PractitionerRole?specialty=419192003&_include=PractitionerRole:practitioner&…&_total=accurate` | 200, total 1: роль + Practitioner Иванова |
| то же с `specialty=http://snomed.info/sct\|419192003` и `practitioner.name=Иван` | 200, total 1 |
| `PractitionerRole?service=HealthcareService/{id}&_include=…` | 200, total 1 |
| `Location?_count=100&_offset=0` | 200, 5 комнат (`ro`) |
| `Practitioner?qualification-code=…`, `Location?physical-type=ro` (старые) | 400 `HAPI-0524` |

Сквозная проверка: собранные `dist/apps/practitioner-service` и `dist/apps/catalog-service` запущены
локально против живого HAPI и Redis (тестовая пара ключей, JWKS на локальном порту, процессы остановлены):

- `GET /api/v1/doctors` → 200, `items` — 4 врача с `name`/`firstName`/`lastName`/`specialty`,
  `meta {page:1,pageSize:20,totalItems:4,totalPages:1}`; `?pageSize=2&page=2` → Сидорова, Козлов,
  `totalItems 4, totalPages 2`;
- `GET /api/v1/doctors?specialty=419192003` (и с `search=Иван`) → 200, одна Иванова, `totalItems 1`;
- `GET /api/v1/rooms?pageSize=2&page=1|2|3` → 200, комнаты 101/112, 204/210, 305, `totalItems 5, totalPages 3`;
- `GET /api/v1/services?pageSize=2&page=1|2` → 200, конверт `totalItems 6, totalPages 3`; в Redis появились
  ключи `catalog:services:v2:1:2` и `catalog:services:v2:2:2`;
- заголовка `X-Powered-By` нет ни в одном ответе.

## Проверки

Запуск по одному проекту (`--parallel=1`): `npx nx run-many -t lint test build -p practitioner-service,
catalog-service,patient-service,appointment-service,notification-service,encounter-service,
analytics-service,contracts,common --parallel=1 --maxWorkers=2 --skip-nx-cache`.

| Проект | test |
| --- | --- |
| contracts | 5 suites / 34 tests passed |
| common | 11 suites / 86 tests passed |
| practitioner-service | 15 suites / 104 tests passed |
| catalog-service | 31 suites / 219 tests passed (после выноса `services.service.page.spec.ts`; до этого 30 / 219) |
| patient-service | 11 suites / 177 tests passed |
| appointment-service | 17 suites / 138 tests passed |
| encounter-service | 10 suites / 86 tests passed |
| analytics-service | 16 suites / 186 tests passed |
| notification-service | 1 suite / 27 tests passed |

- **lint:** `All files pass linting` для всех 9 проектов.
- **build:** `Done compiling TypeScript files` для всех 9 проектов (и их зависимостей `fhir`, `messaging`,
  `terminology`, `fhir-mappers`, `config`).
- Итог nx: `Successfully ran targets lint, test, build for 9 projects and 5 tasks they depend on`.
- **e2e** (`nx run-many -t e2e` для семи сервисов): notification 1/1, appointment 25/25, patient 24/24,
  practitioner 30/30, analytics 59 passed + 1 skipped (60), encounter 23/23, catalog 38/38;
  `Successfully ran target e2e for 7 projects`.
- **tsc `--noEmit`** для `tsconfig.app.json` и `tsconfig.spec.json` `practitioner-service` и
  `catalog-service`: без ошибок.
- **Фронтенд-тест покрытия кодов:** `cd frontend && npx jest src/lib/api/error-code-map.spec.ts` — 6/6
  passed (фронтенд не менялся, см. ниже).
- Nx в первом полном прогоне отметил `catalog-service:test` как flaky (по истории хэшей). Падение в моих
  прогонах не воспроизвелось: повторные запуски дали 219/219 passed.

## Расхождения с фронтендом (`frontend/` не менялся)

1. **Каталог кодов ошибок.** `frontend/src/lib/api/problem.ts` держит собственную копию `ERROR_CODES`
   (17 кодов), а `error-code-map.spec.ts` сверяет карту UX с этой копией, а не с `libs/contracts`, поэтому
   тест остаётся зелёным без правок. Бэкенд теперь отдаёт 20 кодов: `ROOM_IN_USE`, `SERVICE_IN_USE`,
   `SCHEDULE_IN_USE` (409). Для них в `error-code-map.ts` нет записи, а тесты
   `problem.spec.ts`/`problem-boundary.spec.ts` фиксируют ровно 17 — владельцу фронтенда нужно добавить
   три кода в `ERROR_CODES` и `errorCodeMap` (UX — `banner-generic`/`schedule-highlight`) и поднять счётчик в тестах.
   `errorCodeToUx` пока нигде в компонентах не вызывается, поэтому на рантайме это не ломается.
2. **Админские списки.** `frontend/src/app/(admin)/admin/rooms/page.tsx` и `.../admin/services/page.tsx`
   запрашивают `GET /api/v1/admin/rooms?page=` и `GET /api/v1/admin/services?page=`. В спеке таких
   маршрутов нет: списки — `GET /api/v1/rooms` (4.3) и `GET /api/v1/services` (5.1.1), под `/admin/*` только
   `POST/PATCH/DELETE`. По спеке маршруты не добавлял. Форма ответа `{ items, meta }` теперь совпадает.
3. Публичная страница врачей читает `items[].name` и `specialty` — оба поля теперь в ответе
   (`specialty` необязателен: если у `Practitioner` нет `qualification`, поля нет).

## Замечания

- Поиск услуг `GET /services?search=` идёт по `HealthcareService?name=` — это поиск по началу строки в
  HAPI; запрос «Терап» по названию «Приём терапевта…» вернул пустой конверт. Поведение прежнее и вне
  этой задачи; при необходимости заменить на `name:contains`.
- Общая библиотека `libs/fhir-mappers` не менялась (поле `name` добавлено локально). Если другим сервисам
  понадобится `name`, его стоит перенести в `toDoctorResponseDto`.
- Чтение комнат ограничено `LOCATION_SCAN_LIMIT = 1000` записей `Location`; клиника с тысячами
  локаций получит усечённый список — для данного домена это сознательная граница.
- Не менялись: `apps/auth-service`, `libs/fhir-mappers`, `specs/*`, `docker-compose.yml`, `frontend/*`.
  `TRUST_PROXY` для контейнеров задаётся в `docker-compose.yml` (вне владения; за Traefik нужно `1`).
