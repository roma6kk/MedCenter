# coder-m2-gaps-report.md

**Skill:** coder (backend) · **Задача:** закрытие пробелов M2 — API §5.2.7, §5.2.8 (catalog-service, порт 3003) и
§4.7 (practitioner-service, порт 3002) · **Требования:** FR-003, FR-009, FR-017, NFR-005 · **Дата:** 2026-10-14

> Возобновлённый прогон: предыдущая попытка прервалась по лимиту. Её незакоммиченная работа в
> `apps/catalog-service/**` и `apps/practitioner-service/**` проверена и сохранена. Новых дубликатов модулей
> нет. Реализация трёх эндпоинтов уже была завершена и покрыта тестами. В этом прогоне заново выполнены все
> проверки, сверены контракты с фронтендом и Traefik, написан отчёт.
>
> Второй возобновлённый прогон: исправлены замечания ревью c1 (3 major, 6 minor, 1 nit). Тело отчёта ниже
> приведено в соответствие с текущим кодом, итоги по каждому замечанию собраны в разделе
> «Исправления по ревью (раунд c1)» в конце файла.
>
> Третий прогон: исправлены замечания ревью CG1 (1 major, 5 minor, 4 nit; одно minor и одно nit отклонены
> с причиной). Итоги по каждому замечанию, включая инструкцию миграции окон и остаточные блокеры, в разделе
> «Исправления по ревью (раунд 1, CG1)» в конце файла.

## Что реализовано

| # | Эндпоинт | Доступ | Реализация |
| --- | --- | --- | --- |
| 5.2.7 | `GET /api/v1/doctor/schedule?from=&to=` | `DOCTOR` + `user/*.read` | `SlotsController.ownSchedule` -> `DoctorScheduleService.forRole`. Врач определяется только по claim `fhirUser = PractitionerRole/{id}` (`requirePractitionerRoleId`). |
| 5.2.8 | `GET /api/v1/doctors/{id}/slots?from=&to=` | `@Public()` | `SlotsController.listDoctorSlots` -> `DoctorSlotsService.listFree`. `{id}` — id **Practitioner**. Кэш Redis 15 с. |
| 4.7 | `GET /api/v1/admin/rooms/{id}/usage` | `ADMIN` + `user/*.read` | `RoomsController.usage` -> `RoomUsageService.usage`. |

### 5.2.7 Расписание врача

- **Личность.** `fhirUser` берётся из токена. Параметры `practitionerRoleId`/`actor` в query игнорируются
  (e2e «should ignore a role smuggled through the query»). Fail closed: нет claim, `Patient/...`, лишние
  ссылки (`PractitionerRole/a,PractitionerRole/b`), пустой id или id из одних точек дают
  `403 COMPARTMENT_VIOLATION`, а HAPI не вызывается. Идентичность проверяется раньше перекрёстных правил
  диапазона (лимиты и значения по умолчанию), поэтому токен без роли не узнаёт о них. Формат дат проверяет
  валидационный пайп ещё до метода контроллера, поэтому битая дата даёт 400 и токену без роли.
- **Данные.** `Schedule?actor=PractitionerRole/{id}&active:not=false&_sort=_id` (постранично), затем
  `Slot?schedule=Schedule/a,Schedule/b&status=free,busy&start=ge<UTC-instant>&start=le<UTC-instant>&_sort=start,_id`
  постранично (`_count`/`_offset`, не более 50 страниц по 200 = 10 000 слотов; при упоре в потолок ответ
  помечается `truncated: true`). Границы уходят в HAPI явными UTC-моментами
  (сутки клиники Europe/Minsk), а не голыми датами, которые HAPI читал бы в зоне сервера. Статусы
  `busy-unavailable` и `entered-in-error` в двухстатусный `SlotResponseDto` не входят и не возвращаются.
- **Ответ.** `{ practitionerRoleId, from, to, schedules[], items[] }`. `schedules[]` — сводка расписаний
  (`id`, `isActive`, `practitionerRoleId`, `roomId`, `serviceId`, `horizonFrom/To`, `slotDurationMin`,
  `windows[]` MO–SU, `comment`). `items[]` — слоты (`id`, `scheduleId`, `start`, `end`, `status`) плюс `label`
  вида `02.11.2026 12:00–12:30 · занят` в клиническом времени Europe/Minsk. Поле `label` и конверт `items`
  нужны `DoctorScheduleView` фронтенда (`items[].id`, `items[].label`).
- **Без кэша.** Врач должен видеть новую запись сразу после бронирования.

### 5.2.8 Свободные слоты врача (public)

- **Какой это id: решение.** Практитионер, не `PractitionerRole`. Основания:
  1. каталог врачей (API §4.1/§4.2, `GET /doctors/{id}`) выдаёт и принимает id `Practitioner`
     (`DoctorsService.findById` -> `read Practitioner/{id}`), а путь `/doctors/{id}/slots` — вложенный ресурс того же
     id;
  2. фронтенд ссылается на `/doctors/${d.id}` и `/booking?doctorId=...`, а `BookingWizard` передаёт `draft.doctorId`
     в `SlotPicker` как идентификатор для слотов;
  3. у врача может быть несколько `PractitionerRole` (разные услуги/кабинеты), пациент выбирает человека.
- **Разрешение.** `read Practitioner/{id}` (неизвестный врач -> `404 NOT_FOUND`, а не пустой список; для
  неизвестного id это единственный вызов HAPI), затем `PractitionerRole?practitioner=Practitioner/{id}&active:not=false`. Затем
  `Schedule?actor=Practitioner/{id},PractitionerRole/r1,PractitionerRole/r2&active:not=false`
  (запятая = OR) и `Slot?status=free&_sort=start,_id`.
- **Валидация.** `id` — грамматика FHIR id `[A-Za-z0-9\-.]{1,64}` без id из одних точек (`DoctorIdParamDto`):
  запятая превратила бы reference-поиск в OR по чужим врачам, а `Practitioner/..` в `fetch` сворачивается в базовый
  URL. `from`/`to` — дата или date-time **с явным offset** (без offset HAPI прочитал бы его в зоне сервера, а не
  клиники).
- **Лимиты диапазона** (`resolveSlotRange`): оба параметра необязательны (фронтенд вызывает без них);
  по умолчанию `from` = сегодня **по времени клиники (Europe/Minsk)**, `to` = `from` + **14 дней**; `to` включительно;
  `from <= to`; не более **31 дня** (публичный неаутентифицированный маршрут не должен отдавать весь 90-дневный
  горизонт); `from` не дальше **366 дней** от сегодня. Нарушение -> `400 VALIDATION_ERROR`. Дата без времени
  означает сутки клиники (начало и конец суток по Минску), date-time с offset читается как точный момент.
  Пагинации нет (по API §5.2.8), сортировка по `start` — по мгновению, не по строке.
- **Кэш (NFR-005, FR-003).** Одна страница на (врач, сутки клиники): ключ
  `catalog:doctor-slots:{practitionerId}:{YYYY-MM-DD}`, TTL 15 с (`CACHE_TTLS.SLOTS_SECONDS`). Ключ не зависит от
  написания диапазона клиентом (`Z` и `+00:00`, `.001` и `.002`, дата и date-time дают одни и те же ключи), а
  число ключей конечно: существующие врачи x около 400 суток (`from` не дальше 366 дней, `to - from` не больше
  31 дня, прошлое отсекается). Точное окно и фильтр «слот ещё не начался» применяются в памяти при каждом чтении,
  поэтому кэш не предлагает прошлое. Дни, которых нет в кэше, читаются из HAPI одним поиском (от первого до
  последнего недостающего дня); пустые сутки тоже кэшируются пустой страницей, кроме случая упора в потолок
  страниц: тогда в кэш попадают только полностью прочитанные сутки (раньше суток последнего прочитанного слота). Устаревший `free` в пределах 15 с
  безопасен: бронирование перепроверяется `If-Match` на версии `Slot` (ADR-012).
- **Инвалидация.** У `Schedule` известен только `PractitionerRole`, а ключ строится по `Practitioner`, поэтому
  запись слотов сбрасывает весь префикс `catalog:doctor-slots:` (`CACHE_KEYS.ALL_DOCTOR_SLOTS`) вместе с
  `slots:{schedule}:` — при генерации (`SlotGeneratorService`, только если `generated > 0`) и при удалении
  расписания (`SchedulesService.remove`). Админские записи редки, а TTL всего 15 с. Правка расписания
  (§5.2.3) слотов не создаёт и не удаляет, `active` через API не меняется.

### 4.7 Занятость кабинета

- Ответ `{ roomId, inUse, truncated, items[] }`. `inUse` истинно ровно тогда, когда `DELETE /admin/rooms/{id}`
  ответил бы `409 ROOM_IN_USE`: оба пути используют один запрос `roomScheduleQuery(roomId)`
  (`Schedule?actor=Location/{id}`), расхождение исключено (e2e-пара «usage in use» / «DELETE 409»).
- `items[]`: сначала все `Schedule`, ссылающиеся на кабинет (`resourceType`, `id`, `isActive`, `display` =
  `Иванов Иван · Консультация терапевта · 01.11.2026–30.11.2026 · активно`), затем предстоящие занятые `Slot`
  (`status=busy`, `start >= now`, до 50 штук, `_sort=start`, `truncated=true` при превышении;
  `display` = `02.11.2026 12:00–12:30 · запись · Иванов Иван`). Занятый слот — это забронированный приём
  (ADR-012), поэтому список слотов = предстоящие приёмы кабинета.
- Имена врача и услуги приходят одним поиском: `_include=Schedule:actor` и `_include:iterate=PractitionerRole:practitioner`;
  если связанный ресурс недоступен, выводится ссылка (`PractitionerRole/role-7`).
- Форма совпадает с `RoomUsageDrawer`: `items[].resourceType: 'Schedule' | 'Slot'`, `id`, `display`; остальные поля —
  аддитивные. Пустой `items` = «Кабинет свободен».
- Валидация `{id}` (`RoomIdParamDto`, FHIR id), неизвестный кабинет -> `404 NOT_FOUND` (read `Location/{id}`).
- AuditEvent не пишется: эндпоинт только читает (ADR-014 требует аудит create/update/delete).

## Исправления существующего кода, найденные при работе

Пересечение с работой предыдущей попытки. Все три дефекта находятся в `apps/catalog-service`/`practitioner-service`
(мои пути).

1. **`Schedule?location=` и `Schedule?service=` не существуют в R4.** `RoomsService.remove` (§4.6) и
   `ServicesService.remove` (§5.1.5) искали ссылающиеся расписания по несуществующим параметрам; HAPI отвечает 400,
   что превращается в `500 INTERNAL` вместо `409 ROOM_IN_USE`/`SERVICE_IN_USE`. Кабинет и услуга пишутся в
   `Schedule.actor`, поэтому поиск идёт по `actor=Location/{id}` / `actor=HealthcareService/{id}`. Фильтр
   `active=true` убран: HAPI держит ссылочную целостность и при удалении, неактивное расписание тоже блокирует
   удаление. Тесты `rooms.service.spec` и `services.service.spec` обновлены, добавлен e2e на пару usage/DELETE.
2. **Redis-кэш каталога был выключен.** `RedisCacheService` принимал `CacheStore` (интерфейс) через
   `@Optional()` без токена: у интерфейса нет runtime-типа, Nest отдавал `undefined`, и каждое чтение молча
   промахивалось (NFR-005 не выполнялся ни для услуг, ни для слотов). Добавлен `@Inject(CACHE_STORE)`;
   `cache.module.spec.ts` проверяет, что провайдер доходит до сервиса. Сопутствующая правка
   `test/e2e-env.ts`: `REDIS_URL` не задаётся, иначе e2e начал бы подключаться к Redis хоста, который может
   принадлежать другому проекту. Кэширующие e2e подменяют `CACHE_STORE` in-memory хранилищем
   (`src/modules/cache/__tests__/in-memory-cache-store.ts`). Клиент Redis кэша создаётся с fail-fast опциями
   (`config/redis-options.ts`), см. F-04.
3. **Инвалидация слотов.** `SlotGeneratorService` не сбрасывал кэш слотов после генерации: новые слоты не
   появлялись в `slots:{schedule}:` до истечения TTL. Теперь сбрасываются `slots:{schedule}:` и
   `catalog:doctor-slots:` (тест `slot-cache-invalidation.spec.ts`).

## Структура

```
apps/catalog-service/src/common/
  clinic-calendar.ts                           сутки клиники (Europe/Minsk, UTC+3): дата, границы суток, день недели
  fhir-search.ts / fhir-id.ts / fhir-id-param.dto.ts  постраничное чтение, грамматика FHIR id, DTO для {id}
apps/catalog-service/src/config/
  http-edge.ts / trust-proxy.ts / redis-options.ts    rate-limit store, trust proxy, fail-fast клиент Redis
apps/catalog-service/src/modules/slots/
  slots.module.ts / slots.controller.ts        маршруты §5.2.7 и §5.2.8
  doctor-schedule.service.ts                   §5.2.7
  doctor-slots.service.ts                      §5.2.8 + кэш страниц по суткам
  slot-search.ts                               поиск расписаний и слотов (явные UTC-моменты, _sort=start,_id)
  slot-range.ts / practitioner-role-ref.ts     диапазон и личность врача (fail closed)
  schedule-summary.mapper.ts / clinic-time.ts  сводка расписания и подпись слота в Europe/Minsk
  dto/                                          doctor-id-param, slot-range-query, ответы
apps/catalog-service/src/modules/schedules/
  slot-planner.ts / window-overlap.ts          окна расписания -> слоты в клинической зоне; пересечение окон
  slot-batch-writer.ts                         запись слотов batch-Bundle, учёт неподтверждённых записей
  dto/list-schedules-query.dto.ts / dto/schedule-slots-query.dto.ts   query §5.2.2 и §5.2.6
apps/catalog-service/src/modules/services/dto/list-services-query.dto.ts
apps/catalog-service/src/bootstrap.ts          configureApp (trust proxy + пайп) и createApp (rate-limit, trust proxy, пайп) для main.ts и e2e
apps/practitioner-service/src/bootstrap.ts     то же
apps/practitioner-service/src/common/          fhir-id.ts, page-query.dto.ts (page/pageSize 1..1000 / 1..100)
apps/practitioner-service/src/modules/doctors/dto/  list-doctors-query.dto.ts, doctor-id-param.dto.ts
apps/practitioner-service/src/config/          http-edge.ts / trust-proxy.ts / redis-options.ts
apps/practitioner-service/src/modules/rooms/
  room-usage.service.ts / room-usage.mapper.ts / room-schedules.ts / clinic-time.ts
  dto/room-id-param.dto.ts / dto/room-usage-response.dto.ts
```

`clinic-time.ts` (подписи), грамматика FHIR id, `config/*` (rate-limit, trust proxy, fail-fast Redis) и
`test/e2e-tokens.ts` продублированы в двух сервисах намеренно: общие библиотеки по правилам параллельной работы
не трогались. Кандидат на вынос в `libs/common` при следующей итерации (оркестратор).

## Проверка маршрутизации Traefik (`infra/traefik/dynamic.yml`, только чтение)

| Путь | Router | Сервис | Результат |
| --- | --- | --- | --- |
| `/api/v1/doctor/schedule` | `catalog-doctor-slots` (priority 60) | catalog-service:3003 | OK |
| `/api/v1/doctors/{id}/slots` | `catalog-doctor-slots`, `PathRegexp(^/api/v1/doctors/[^/]+/slots$)`, priority 60 | catalog-service:3003 | OK: приоритет выше `practitioner-doctors` (50), остальные `/api/v1/doctors/**` идут в practitioner-service |
| `/api/v1/admin/rooms/{id}/usage` | `practitioner-rooms-admin` (`PathPrefix(/api/v1/admin/rooms)`) | practitioner-service:3002 | OK |
| `/api/v1/services`, `/api/v1/admin/schedules`, `/api/v1/admin/services` | `catalog-doctor-slots`, `catalog-admin` | catalog-service | OK |
| `/api/v1/doctor/appointments` | `appointment-doctor` (priority 60) | appointment-service | не пересекается с `/api/v1/doctor/schedule` |

Несоответствий маршрутов для трёх эндпоинтов нет. Замечание вне объёма: в `catalog-admin` остался лишний
`PathPrefix(/admin/schedules)` без префикса `/api/v1`.

## Расхождения с фронтендом (`frontend/` не менялся)

Совпадают с контрактом: `GET /doctor/schedule` (`{items:[{id,label}]}`) и `GET /admin/rooms/{id}/usage`
(`{items:[{resourceType,id,display}]}`).

| # | Вызов фронтенда | Проблема | Следствие |
| --- | --- | --- | --- |
| 1 | `slot-picker.tsx`: `GET /api/v1/schedules/{scheduleId}/slots?status=free` | В спеке такого пути нет, в Traefik нет маршрута `/api/v1/schedules`. `BookingWizard` передаёт туда `doctorId`. Нужен `GET /api/v1/doctors/{doctorId}/slots?from=&to=` (§5.2.8). Ответ 5.2.8 содержит `items[]` с `id`, `start`, `status`, то есть совместим с типом `Slot` фронтенда. | 404 на шаге выбора слота |
| 2 | `schedule-editor.tsx`: `POST /api/v1/admin/schedules` с `{ days, horizonDays: 30 }` | `CreateScheduleDto` (§5.2.1) требует `practitionerRoleId`, `roomId`, `serviceId`, `horizonFrom`, `horizonTo`, `windows[]`, `slotDurationMin` | 400 `VALIDATION_ERROR` |
| 3 | `slot-generation-dialog.tsx`: `POST /admin/schedules/{id}/generate` с телом `{}` и `scheduleId="default"` (`admin/schedules/page.tsx`) | `GenerateSlotsDto` (§5.2.5) требует `from` и `to`; реальный id расписания не передаётся | 400 `VALIDATION_ERROR` |
| 4 | `admin/rooms/page.tsx`: `GET /api/v1/admin/rooms?page=` | Роут есть только `GET /api/v1/rooms` (§4.3); `GET /admin/rooms` Traefik отправляет в practitioner-service, где обработчика нет | 404 |
| 5 | `admin/services/page.tsx`: `GET /api/v1/admin/services?page=` | Роут есть только `GET /api/v1/services` (public); `GET /admin/services` в catalog-service не определён | 404 |
| 6 | `doctors/page.tsx`, `doctors/[doctorId]/page.tsx`: ожидают `{items: Doctor[]}` и поле `name` | `GET /doctors` отдаёт голый массив `DoctorResponseDto` (`firstName`, `lastName`, без `name`/`meta`). Конверт `{items, meta}` по API §0 не соблюдён | Пустой список / `undefined` в имени |
| 7 | `GET /rooms`, `GET /services` | Те же голые массивы вместо `{items, meta}` (frontend читает `data.meta` для пагинации) | Таблицы без пагинации |

Пункты 4–7 затрагивают существующие эндпоинты M2 (мои пути), но выходят за рамки этой задачи. Рекомендуется
отдельная правка: конверт `PaginatedResponseDto` для 4.1, 4.3, 5.1.1 и `name` в `DoctorResponseDto`.

## Отклонения и замечания

1. **Диапазон слотов ограничен 31 днём** (не 90), окно по умолчанию 14 дней от сегодняшних суток клиники,
   `from` не дальше 366 дней. Решение для публичного маршрута; в API §5.2.8 эти значения не заданы. Конверт
   ответа `{ doctorId, from, to, items }` тоже не описан в спецификации (там `SlotResponseDto`, пагинация
   отключена). Рекомендуется записать конверт, значения по умолчанию и лимиты в `specs/api-designer-spec.md`
   §5.2.7/5.2.8 (общий файл, через оркестратора).
2. **`GET /doctors/{id}/slots` — public** по API §5.2.8 и условию задачи. В `architect-architecture.md` (таблица
   маршрутов) указан `patient/*.read`. Следует спецификации API.
3. **Ключ кэша** `catalog:doctor-slots:{practitioner}:{YYYY-MM-DD}` вместо `slots:{schedule}:...` из
   архитектуры: публичный запрос привязан к врачу, а не к расписанию, а страница соответствует суткам клиники.
   Префикс при записи сбрасывается целиком.
4. **`ROOM_IN_USE`, `SERVICE_IN_USE`, `SCHEDULE_IN_USE` отсутствуют в `ERROR_CODES`** (`libs/contracts`, общий
   файл не менялся). `ProblemDetailsFilter` берёт код из статуса, и клиент получает `errorCode: CONFLICT`, а
   метка остаётся в `detail`. Здесь поведение прежнее.
5. **Rate-limit:** в `main.ts` обоих сервисов теперь устанавливается Redis-хранилище лимитера и
   `trust proxy` (`TRUST_PROXY`, в compose `1`). Ключ `RateLimitGuard` для анонимного вызова это `ip + метод + путь`
   (без query), поэтому у публичного `/doctors/{id}/slots` бюджет делится по `ip + id`: перебор разных id одним
   клиентом получает новые корзины. Это поведение общей библиотеки `libs/common`; сервис смягчает его кэшем
   (страница на сутки, неизвестный id в кэш не попадает), ограничением диапазона и тем, что неизвестный id
   стоит HAPI одного чтения (404), без поиска ролей.
6. **Файл `schedules.service.ts`** — 282 строки: проверки пересечения окон вынесены в `window-overlap.ts`,
   `update` разбит (`mergeExtensions`).
7. **Нет интеграции с реальным HAPI.** Параметры поиска (`actor`, `active:not`, `_include:iterate`, `_sort=start`,
   `start=ge..&start=le..`) сверены с R4, но e2e работают с замоканным `FHIR_CLIENT`. Прогон на живом HAPI —
   задача стенда.

## Verification evidence (DOD Standard)

Итоговые прогоны после исправлений ревью c1 (реальные результаты):

| Проверка | Команда | Результат |
| --- | --- | --- |
| Unit catalog | `npx nx test catalog-service --maxWorkers=2 --skip-nx-cache` | OK: `Test Suites: 25 passed, 25 total` · `Tests: 197 passed, 197 total` |
| Unit practitioner | `npx nx test practitioner-service --maxWorkers=2 --skip-nx-cache` | OK: `Test Suites: 8 passed, 8 total` · `Tests: 63 passed, 63 total` |
| E2E catalog | `npx nx e2e catalog-service --skip-nx-cache` | OK: `Test Suites: 5 passed, 5 total` · `Tests: 29 passed, 29 total` |
| E2E practitioner | `npx nx e2e practitioner-service --skip-nx-cache` | OK: `Test Suites: 4 passed, 4 total` · `Tests: 16 passed, 16 total` |
| Lint | `npx nx run-many -t lint -p catalog-service practitioner-service --skip-nx-cache` | OK: `All files pass linting` (оба проекта) |
| Typecheck | `tsc --noEmit -p apps/{catalog,practitioner}-service/tsconfig.{app,spec}.json` | OK: ошибок нет, `exit 0` (4 из 4) |
| Build | `npx nx build catalog-service` / `npx nx build practitioner-service` (по очереди) | OK: `Successfully ran target build for project ... and 6 tasks it depends on` |
| Стиль | AST-скрипт длины функций, `wc -l`, grep `any`/`!` | нет файлов > 300 строк, нет функций > 30 строк, нет `any` и `!` в коде проектов |
| Живой стек | собранный `catalog-service` на порту 13003 против локального HAPI и Redis compose-стека | OK: 17 реальных слотов за сутки; три написания одного окна дают один ключ `catalog:doctor-slots:{id}:2026-10-14`; при лимите 5 шестой вызов клиента 429 с `Retry-After: 60`, другой клиент (`X-Forwarded-For`) получает 200; при недостижимом Redis (чёрная дыра) ответ за 30-110 мс вместо 10 с |

Примечание по сборке: `nx build` отмечает `common:build` как flaky: сборка общей библиотеки `dist/libs/common`
гонится с сборками соседних агентов. Обе сборки зелёные, причина не в коде проектов.

## Покрытие тестами

- `common/clinic-calendar.spec.ts`: границы суток клиники, день недели, дни диапазона, согласие фиксированного
  смещения +03:00 с `Intl` Europe/Minsk зимой, летом и в дни перевода часов ЕС.
- `slots/doctor-slots.service.spec.ts`, `slots/doctor-slots.cache.spec.ts`: свободные слоты, поиск `free` по расписаниям
  врача и всех его ролей между явными UTC-моментами, `_sort=start,_id`, пустой результат без поиска `Slot`,
  отбрасывание начавшихся слотов, точное окно в памяти, 404 без записи в кэш; кэш: страница на сутки, одинаковые ключи
  для двух написаний окна, 50 вариантов миллисекунд не растят число ключей, пересечение окон читает только недостающие
  дни, битая страница перечитывается, прошлое окно без обращений к HAPI, начало поиска сдвигается на сегодня.
- `slots/slot-range.spec.ts`: окно по умолчанию (14 дней, сегодня по Минску ночью), сутки клиники как границы, лимиты
  31 дня и 366 дней вперёд, окно целиком в прошлом.
- `slots/slot-search.spec.ts`: постраничное чтение расписаний, `_sort=_id`, `_sort=start,_id`, дедупликация и порядок по
  моменту при разных offset.
- `slots/doctor-schedule.service.spec.ts`, `slots.controller.spec.ts`, `practitioner-role-ref.spec.ts`: fail closed
  (нет `fhirUser`, `Patient/...`, лишние ссылки, пустой id, id из точек), `label` в клиническом времени.
- `slots/schedule-summary.mapper.spec.ts`, `slots/clinic-time.spec.ts`, `common/fhir-search.spec.ts`,
  `common/fhir-id-param.dto.spec.ts`, `slots/dto/doctor-id-param.dto.spec.ts`: warn при битых окнах, подписи слотов,
  потолок страниц, грамматика FHIR id (запятая, 65 символов, точки).
- `schedules/slot-generator.clinic-time.spec.ts`: окно 09:00 -> слот 06:00Z -> подпись `09:00–09:30`, клиническая
  неделя у полуночи, поздний слот, лето, поиск существующих слотов по тем же суткам, занятый слот не перезаписывается,
  нулевая длительность. `schedules/slot-generator.service.spec.ts`, `schedules/schedules.service.spec.ts`,
  `schedules/window-overlap.spec.ts`, `schedules/slot-cache-invalidation.spec.ts`: идемпотентность, окна расписаний,
  сброс страниц при генерации и удалении.
- `cache/redis-cache.service.spec.ts`, `cache/redis-cache.store.spec.ts`, `cache/cache.module.spec.ts`: битая запись
  кэша это промах, `getJson`/`setJson`, ключи, один compact-warn на интервал при недоступном Redis, fail-fast опции
  клиента, привязка `CACHE_STORE`.
- `services/services.service.spec.ts`, `services/dto/list-services-query.dto.spec.ts`: кэшируется только список без
  `search`, ключ на (page, pageSize), поиск идёт в HAPI, границы `page`/`pageSize`/`search`.
- `config/http-edge.spec.ts`, `config/trust-proxy.spec.ts` (оба сервиса): установка Redis-хранилища лимитера, fail-fast
  опции, отказ при пустом `REDIS_URL`, разбор `TRUST_PROXY`.
- `rooms/room-usage.service.spec.ts`, `rooms.controller.spec.ts`, `dto/room-id-param.dto.spec.ts`, `clinic-time.spec.ts`:
  занятый кабинет, поиск через `Schedule.actor`, только предстоящие `busy`-слоты, неактивное расписание остаётся в
  списке, потолок и `truncated`, 404, метаданные `ADMIN`/`user/*.read`.
- e2e `catalog-service/test/doctor-slots.e2e-spec.ts`: 200 без токена, кэш (один поиск `Slot` на два запроса и на два
  написания окна), 400 для диапазона > 31 дня / дальше года / плохой даты / id с запятой, 404, 401/403
  (`FORBIDDEN_SCOPE`, `FORBIDDEN_ROLE`, `COMPARTMENT_VIOLATION`), игнорирование роли из query. Даты считаются от часов.
- e2e `catalog-service/test/rate-limit-proxy.e2e-spec.ts`, `practitioner-service/test/rate-limit-proxy.e2e-spec.ts`:
  429 с `Retry-After`, отдельный бюджет другого клиента при доверии к Traefik, общая корзина без доверия, без хранилища
  лимита нет.
- e2e `catalog-service/test/services-catalog.e2e-spec.ts`: кэш листинга, поиск вне кэша, 400 для `page`/`pageSize`/`search`,
  400 для id услуги и расписания не по грамматике FHIR.
- e2e `practitioner-service/test/room-usage.e2e-spec.ts`: 401/403/400/404, список расписания и приёма, пара
  usage/`DELETE` (`409` и `204`), 400 для `PATCH`/`DELETE` с id из запятой и точек до обращения к HAPI.

## Исправления по ревью (раунд c1)

Ревью: `code-reviewer-catalog-gaps-c1` (3 major, 6 minor, 1 nit). Все замечания признаны верными. Часть работы
(F-01, `config/*`) была сделана до лимита использования и проверена в этом прогоне, остальное доделано здесь.

| ID | Важность | Статус | Что сделано | Чем доказано |
| --- | --- | --- | --- | --- |
| F-01 | major | исправлено | `main.ts` обоих сервисов: `enableRateLimit` (Redis-хранилище `RedisRateLimitStore`, fail-fast клиент, ошибки Redis только в лог) и `applyTrustProxy` (`TRUST_PROXY`, разбор с падением на старте при мусоре). Порядок как в auth-service. В compose `TRUST_PROXY=1` уже стоял для всех BFF. Отклонение №5 отчёта переписано | unit `config/http-edge.spec.ts`, `config/trust-proxy.spec.ts`; e2e `rate-limit-proxy.e2e-spec.ts` в обоих сервисах; на живом стеке 6-й вызов клиента даёт 429, другой клиент 200 |
| F-02a | major | исправлено | Кэш `GET /doctors/{id}/slots` перестроен на страницы по суткам клиники: ключ `catalog:doctor-slots:{id}:{YYYY-MM-DD}`, точное окно и `start > now` применяются в памяти. Диапазон разбирается в моменты (`SlotRange.fromMs/toMs`), `from` не дальше 366 дней вперёд (иначе 400), окно в прошлом даёт пустой ответ без HAPI, неизвестный врач ничего не пишет в кэш | `doctor-slots.cache.spec.ts` (два написания дают одни ключи; 50 вариантов миллисекунд оставляют 3 ключа; перекрывающееся окно читает недостающие дни), `slot-range.spec.ts`, e2e `doctor-slots.e2e-spec.ts`; живой стек: три написания окна, один ключ в Redis |
| F-02b | major | исправлено | `GET /services`: `ListServicesQueryDto` (`page` 1..1000, `pageSize` 1..100, `search` до 100 символов, API §0), в кэш попадает только листинг без `search` (ключ `catalog:services:{page}:{pageSize}`), поиск идёт в HAPI. `NaN` и произвольные размеры страницы больше не доходят до HAPI | `list-services-query.dto.spec.ts`, `services.service.spec.ts` (`list`), e2e `services-catalog.e2e-spec.ts` |
| F-03 | major | исправлено | Генерация слотов переведена на клиническое время: окно `09:00` в понедельник это 09:00 в Минске, то есть 06:00Z; день недели считается по суткам клиники (Беларусь без DST с 2011, фиксированное +03:00, согласие с `Intl` проверено тестом). Выделены `slot-planner.ts` и `common/clinic-calendar.ts`. Поиск уже существующих слотов идёт по тем же суткам, листает все страницы (до 50) и сравнивает моменты, а не строки: повторный запуск не перезаписывает занятый слот. Нулевая длительность слота больше не зацикливает расширение. Окно 5.2.7/5.2.8 в HAPI уходит явными UTC-моментами | `slot-generator.clinic-time.spec.ts` (сквозной: окно -> generate -> подпись `09:00–09:30`), `clinic-calendar.spec.ts`; сверка с живым HAPI: демо-слоты стека лежат на 06:00Z, то есть уже в клинической зоне |
| F-04 | minor | исправлено | `createRedisCacheStore` использует `FAIL_FAST_REDIS_OPTIONS` (`connectTimeout` 1 с, `commandTimeout` 250 мс, без offline-очереди). Предупреждения кэша ограничены до одной компактной строки без стека на вид и 10 с (на запрос приходится по странице на сутки) | `redis-cache.store.spec.ts`, `redis-cache.service.spec.ts` (outage logging); живой стек: недостижимый Redis, ответ за 30-110 мс |
| F-05 | minor | частично, нужен общий файл | Комментарии в `rooms.service.ts` и `services.service.ts` исправлены: коды вне `ERROR_CODES` фильтр заменяет на `CONFLICT`, метка остаётся в `detail`. e2e фиксирует фактическое поведение (`409`, `errorCode: CONFLICT`, `detail` с меткой). Добавление кодов в `libs/contracts` не делалось (общий файл, тест `error-code.spec.ts` проверяет длину списка) | см. blockers |
| F-06 | minor | исправлено | `RoomIdParamDto` на `PATCH` и `DELETE` кабинета; `FhirIdParamDto` на все `:id` в `ServicesController` и `SchedulesController` (после проверки грамматики FHIR запятая и id из точек не доходят до HAPI) | `fhir-id-param.dto.spec.ts`; e2e в обоих сервисах (400 до обращения к HAPI). Вынос `FHIR_ID_PATTERN` и `clinic-time` в `libs/common` оставлен оркестратору |
| F-07 | minor | исправлено в коде, в спеке за оркестратором | Окно по умолчанию 14 дней от сегодняшних суток клиники (было 7 от UTC-даты), лимиты и конверт описаны в отклонении №1 | `slot-range.spec.ts`; запись в `specs/api-designer-spec.md` §5.2.7/5.2.8 нужна от оркестратора |
| F-08 | minor | исправлено | `readWindows` (карточка расписания и генератор) пишет warn с id расписания; битая запись кэша это промах (`getJson`); расписания и роли читаются постранично (`searchAllPages`, потолок пишет warn), а не одной страницей в 200 записей | `schedule-summary.mapper.spec.ts`, `redis-cache.service.spec.ts`, `slot-search.spec.ts` |
| F-09 | minor | исправлено | Все постраничные поиски слотов идут с `_sort=start,_id` (полный порядок), расписаний и ролей с `_sort=_id` | `slot-search.spec.ts`, `doctor-slots.service.spec.ts`, `doctor-schedule.service.spec.ts`; запросы проверены на живом HAPI (200, порядок по `start`, OR по `actor`) |
| F-10 | nit | исправлено | Имена e2e в `should ... when ...` с маркерами AAA (`doctor-slots`, `room-usage`, `services-catalog`, `rate-limit-proxy`); `schedules.service.ts` 282 строки (вынесен `window-overlap.ts`, `update` разбит на `mergeExtensions`), `SlotGeneratorService.generate` 25 строк, спеки разрезаны до 300 строк (`doctor-slots.cache.spec.ts`, `schedules.service.spec.ts`, фикстуры в `__tests__`). Диапазоны date-only больше не читаются HAPI в зоне сервера, `from` по умолчанию это сегодня по Минску. Дубль `e2e-tokens.ts` остался (общая библиотека не трогалась) | `fnlen`-скрипт, `wc -l`, lint |

Дополнительно: исправлен испорченный комментарий (`*</n`) у `slotId` в генераторе; `readWindows` генератора
принимает только массив. Развёртывание: слоты, сгенерированные прежним генератором, лежат на UTC-моментах окна
(09:00Z вместо 06:00Z). Повторная генерация создаст рядом слоты клинического времени с другими id, поэтому в
средах, где слоты уже создавались прежней версией, их нужно удалить и сгенерировать заново (в локальном стеке
слоты уже в клинической зоне).

Остаточные риски раунда c1 (кэш админского `GET /admin/schedules/{id}/slots` по сырым `from`/`to`/`status` и
публичный `GET /doctors` без DTO) закрыты в раунде CG1 (см. CG1-07).
