# Seed: терминология и демо-данные (tools/)

Дата: 2026-10-14. Ветка: `feature/clinic-platform-wip`. Скилл: `coder`.

Прогон возобновлённый: две предыдущие попытки были прерваны лимитом. Перед работой проверено
состояние `tools/` и живого HAPI (`http://localhost:8080/fhir`): готовая часть сохранена,
дублирования нет. Эта сессия довела терминологический seed (доказательства `$validate-code` и
`$expand?filter=`), проверила демо-seed на реальных кодах сервисов, **переписала шаг
пользователей под реальный поток авторизации auth-service** и написала тесты ко всему `tools/`.

## Что сделано

### 1. `tools/terminology-seed` — идемпотентный, с доказательствами

- Запись через `PUT` на детерминированный id либо на id уже существующей копии того же
  canonical (`canonical-upsert.ts`); `POST` не используется. Устаревшая `complete`-копия
  CodeSystem удаляется (иначе HAPI уходит в путь `$expand` через Hibernate Search, которого в
  compose нет). Все CodeSystem — `content: fragment` (снимок — выборка МКБ-10/АТХ/НСИ).
- Новое: `terminology-proof.ts`. Для каждого кода снимка вызывается `ValueSet/$validate-code`
  (это ровно тот вызов, которым пользуются проверки сервисов, BR-004/BR-009), и для трёх
  ключевых кодов — `$expand?url=...&filter=...`.
- `expansion-codes.ts` вынесен из `seed-terminology.ts` (разрыв цикла импортов, файл < 300 строк).
- Снимок: `ucum.json` (22 единицы, закрытый список BR-009), `atc.json` (17), `icd-10.json` (25,
  включая `J06.9`, `J01FA10` в АТХ), `services.json` (10), `observations.json` (7).
  UCUM как CodeSystem не публикуется (внешняя система): ValueSet `ucum-units` перечисляет
  коды сам.

### 2. `tools/demo-seed` — FHIR-часть

Организация, 5 кабинетов (`Location`), 4 врача (`Practitioner` + `PractitionerRole` со
специальностью SNOMED CT), 6 услуг (`HealthcareService`, тип из НСИ-снимка), 6 расписаний
(`Schedule`) и свободные `Slot` на 14 дней (404 слота). Идентификаторы — UUID v5 от
`<ResourceType>/<ключ>` (`tools/shared/deterministic-id.ts`), запись — `PUT` внутри
`transaction`-Bundle в порядке зависимостей. Слоты создаются «если нет» и никогда не
перезаписываются, чтобы повторный запуск не освободил уже забронированный слот.

Форма ресурсов сверена с кодом сервисов (читал, не угадывал):

| Ресурс / поле | Кто читает | Что сделано в seed |
|---|---|---|
| `Schedule.actor` = [PractitionerRole, Location, HealthcareService] + 3 расширения (длительность, окна JSON, горизонт) | `catalog-service` `SchedulesService.create`, `SlotGeneratorService`, appointment `scheduleActorId` | тот же порядок actor и те же URL расширений из `MEDCENTER_EXT` |
| `Slot`: id = sha256(`<scheduleId>\|<start>`)[0..64], `status: free`, расширение `SLOT_ACTORS` | `SlotGeneratorService.slotId`, doctor-slots, booking | та же функция и поля: слот, который сгенерирует сервис, пропускается как существующий |
| окна расписания - **время клиники** (API §5.2.1, Минск UTC+3) | `planSlots` (`slot-planner.ts`) | окна хранятся как есть (`09:00-13:00`), слоты - UTC-instants (09:00 -> 06:00Z); parity-тест с `planSlots` (см. «Исправления по ревью», F1) |
| `PractitionerRole.practitioner` / `.healthcareService` / `.specialty` | doctor-slots (`PractitionerRole?practitioner=`), `DoctorsService.listByService`, appointment `_include=PractitionerRole:practitioner` | заполнены; `active: true` (фильтр `active:not=false`) |
| `Practitioner.name[0]` (`text`, `family`, `given`), `qualification[0].code.text` | `toDoctorResponseDto`, `humanNameOf` | заполнены |
| `Location`: `identifier`, `physicalType` `ro`, `extension ROOM_FLOOR` | `RoomsService.toLocation/toResponseDto` | как в сервисе + `status`, `managingOrganization` |
| `HealthcareService`: `type` (НСИ), `extension SERVICE_DEFAULT_DURATION`, `comment`, `name` | `ServicesService.toResponseDto`, `CodeSystem/$lookup` | как в сервисе; коды 10001…10007 есть в снимке |
| BR-007 (`SCHEDULE_OVERLAP`) | `assertNoOverlap` | окна одного врача не пересекаются (проверено тестом) |

Манифест id пишется в `tools/demo-seed/output/demo-manifest.json` (`output/` в `.gitignore`,
проверено `git check-ignore`). В нём id всех ресурсов, окна расписаний (время клиники), число слотов, горизонт.

### 3. `tools/demo-seed` — шаг пользователей (`--users`)

В прошлой версии шаг был написан «вслепую» (предположение UI-1). Теперь он сверен с кодом
`apps/auth-service/src/modules/oauth/login` и `modules/users` и **переписан**:

1. `GET /oauth/authorize?...` без сессии отвечает **HTML-формой входа (200)** и ставит cookie
   `mc_as_csrf`, а не редиректом. Клиент разбирает скрытые поля `csrf` и `authorize_query`.
2. `POST /oauth/login` (`application/x-www-form-urlencoded`): **ровно** поля `csrf`,
   `authorize_query`, `email`, `password` + cookie `mc_as_csrf`. Ответ `302` на
   `/oauth/authorize?...` и cookie `mc_as_session` (одноразовая).
3. `GET /oauth/authorize?...` с cookie сессии: `302` на `redirect_uri?code=...&state=...`.
4. `POST /oauth/token` (`authorization_code` + `code_verifier`, публичный клиент PKCE).
5. Врачи — `POST /api/v1/admin/users` (Bearer админа, scope `user/*.write`) с телом
   `{email, password, firstName, lastName, roles: ['DOCTOR'], practitionerRoleId}`; пациенты —
   публичный `POST /api/v1/auth/register` с `{email, password, firstName, lastName, birthDate, gender}`.
6. `409 EMAIL_TAKEN` → `exists` (пароль прошлого запуска сохраняется); любой другой `409`
   (например `PRACTITIONER_ROLE_TAKEN`) — это ошибка, а не «уже есть».

Безопасность клиента входа: куки и креды уходят только на origin auth-service (форма с чужим
`action` отклоняется), `state` сверяется, пароль не печатается и не попадает в тексты ошибок.
Пароли демо-аккаунтов не лежат в коде: из env (`DEMO_*_PASSWORD`), либо из манифеста прошлого
запуска, либо генерируются под политику auth-service (>= 10, строчная, прописная, цифра, символ)
и пишутся только в gitignored-манифест.

**Шаг не запускался** (auth-service ещё не развёрнут). Он проверен юнит- и контрактными
тестами: `fake-auth-server.ts` рендерит **настоящую** страницу входа (`renderLoginPage`) и
использует настоящие `sanitizeAuthorizeQuery`/`authorizeLocation` из auth-service, поэтому
смена разметки или набора полей формы сломает тесты seed, а не первый боевой запуск.

### 4. Общее (`tools/shared`)

- `fhir-http.ts`: клиент HAPI на `fetch`; **каждый запрос с `Cache-Control: no-cache`** (см.
  «Найденное при проверке» ниже).
- `in-memory-fhir.ts`: двойник HAPI для тестов (`PUT` 201/200, no-op при неизменном теле,
  `transaction`, поиск с OR через запятую, `$expand?filter=` по display, `$validate-code`).
- `tools/tsconfig.json` (новый): `npx tsc -p tools/tsconfig.json` проверяет все seed-файлы,
  включая те, которые не импортируют тесты.

## Как запускать

```bash
# 1. Терминология (HAPI на http://localhost:8080/fhir, по умолчанию)
npm run seed:terminology

# 2. FHIR-часть демо: организация, кабинеты, врачи, услуги, расписания, слоты на 14 дней
npm run seed:demo
npm run seed:demo -- --days=30 --from=2026-11-02      # другой горизонт (до 90 дней)

# 3. Пользователи (после развёртывания auth-service и шага 2)
export BOOTSTRAP_ADMIN_EMAIL=...    # значения bootstrap-админа; seed .env не читает
export BOOTSTRAP_ADMIN_PASSWORD=...
npm run seed:demo -- --users          # либо --fhir --users: оба шага подряд

npm run test:tools                    # тесты всех seed
```

Переменные (только имена): `SEED_FHIR_BASE_URL` (HAPI; `FHIR_BASE_URL` сервисов seed НЕ читает, см. F5; из контейнерной сети
`hapi` с хоста не виден), `SEED_AUTH_BASE_URL` (по умолчанию `http://localhost:8081`),
`OAUTH_CLIENT_ID` (`medcenter-web`), `OAUTH_REDIRECT_URI`
(`http://localhost:3000/api/auth/callback`; клиент должен быть зарегистрирован в
`OAUTH_CLIENTS_JSON` с этим URI и scope `launch user/*.read user/*.write`),
`DEMO_EMAIL_DOMAIN` (`medcenter.test`), `DEMO_DOCTOR_PASSWORD`, `DEMO_PATIENT_PASSWORD`.
Демо-логины: `doctor.ivanova|petrov|sidorova|kozlov@<домен>`, `patient.kuznetsov|lebedeva|novikov@<домен>`.
Пароли сгенерированных аккаунтов — в `tools/demo-seed/output/demo-manifest.json`.

Повторный запуск безопасен. Если манифест потерян, а аккаунт уже существует, пароль неизвестен:
задайте `DEMO_*_PASSWORD` либо сбросьте пользователя.

## Доказательства (живой HAPI, 2026-10-14)

### Терминология: J06.9, J01FA10, Cel

```
OK ICD-10 J06.9: $validate-code=true $expand?filter="Острая инфекция верхних дыхательных путей неуточнённая" -> 1 match(es), found=true
OK ATC J01FA10: $validate-code=true $expand?filter="Азитромицин" -> 1 match(es), found=true
OK UCUM Cel: $validate-code=true $expand?filter="градус Цельсия" -> 1 match(es), found=true
$expand .../nsi-services: 10 codes, missing: 0; $validate-code rejected: 0/10
$expand .../nsi-observations: 7 codes, missing: 0; $validate-code rejected: 0/7
$expand .../atc: 17 codes, missing: 0; $validate-code rejected: 0/17
$expand .../InternClassificDiseases10: 25 codes, missing: 0; $validate-code rejected: 0/25
$expand .../ucum-units: 22 codes, missing: 0; $validate-code rejected: 0/22
```

Все 5 ValueSet `$expand`-ятся и отдают каждый код снимка; `$validate-code` принимает каждый код
(неизвестный код `zzz` даёт `result=false`).

**Важно:** `filter` в `$expand` у HAPI (расширение в памяти) сопоставляется **только с display**,
а не с кодом: `filter=J06.9` возвращает пустое расширение, `filter=Азитромицин` — `J01FA10`.
Поэтому доказательство через `filter` строится по display концепта; по коду проверяет
`$validate-code`. Это же зафиксировано в `TerminologyService` auth-service (код-фильтр там
применяется на стороне сервиса).

### Идемпотентность: два подряд запуска

Снимок `{id -> meta.versionId}` всех CodeSystem/ValueSet до и после каждого запуска
(`before == run1 == run2 == run3 == run4`: **True**):

```
CodeSystem: 4   (cs-nsi-services v1, cs-nsi-observations v1, 1002 [ATC, id сервера] v2, cs-icd10 v1)
ValueSet:   5   (vs-nsi-services v1, vs-nsi-observations v1, vs-atc v3, 1004 [МКБ-10, id сервера] v2, vs-ucum v1)
```

Дубликатов нет, ни одна версия не выросла (HAPI не создаёт версию для неизменного `PUT`).
Id `1002`/`1004` — копии, созданные ранними `POST`-запусками; seed «усыновляет» их, а не
создаёт вторую.

### Демо FHIR: два подряд запуска

Снимок `{id -> versionId}` по 430 ресурсам (1 Organization, 5 Location, 4 Practitioner,
4 PractitionerRole, 6 HealthcareService, 6 Schedule, 404 Slot) после каждого из последних
запусков идентичен: **True**. Отчёт запуска: `created=0` по всем расписаниям.

```
Organization 1 | Location 5 | Practitioner 4 | PractitionerRole 4 | HealthcareService 6 | Schedule 6 | Slot 404
Slot ivanova-primary planned=80 created=0 | ivanova-repeat 90/0 | petrov-primary 36/0 | petrov-ecg 36/0 | sidorova-primary 90/0 | kozlov-primary 72/0
```

Первый запуск нового календарного дня честно сдвигает горизонт: на 2026-10-14 он создал 47 новых
слотов (новый день 10-27) и обновил 6 `Schedule` (расширение горизонта) — это ожидаемо.

Запросы в форме сервисов дают данные: `PractitionerRole?practitioner=Practitioner/{id}&active:not=false`
-> 1; `Schedule?actor=Practitioner/..,PractitionerRole/..&active:not=false` -> 2;
`Slot?schedule=..&status=free&start=ge..&start=le..&_sort=start` -> 170 (первый слот
`2026-10-14T06:00:00Z` = 09:00 по Минску); `PractitionerRole?service=HealthcareService/{id}` -> 1;
`Schedule?actor=Location/{room}` -> 2; `PractitionerRole?specialty=419192003` -> 1.

## Проверки

| Проверка | Результат |
|---|---|
| `npm run test:tools` | 21 сьют, **294 теста, все зелёные** (после исправлений ревью; было 3 сьюта / 39 тестов) |
| `npx tsc -p tools/tsconfig.json` | 0 ошибок |
| ESLint (корневой `.eslintrc.json`, `--no-ignore`, `tools/**/*.ts`) | 43 файла, 0 ошибок, 0 предупреждений |
| Размеры | максимум 244 строки на файл, функции <= 30 строк |
| `seed:terminology` x4, `seed:demo` x4 на живом HAPI | см. выше, идемпотентно |
| Шаг `--users` | **не запускался** (auth-service не развёрнут); покрыт тестами |

Что покрыто тестами: UUID v5 (вектор RFC 4122), клиент HAPI (пейджинг, ошибки, no-cache),
слоты (окна во времени клиники -> UTC-instants, границы окон, parity с `planSlots`, id как у `SlotGeneratorService`), форма ресурсов и
ссылочная целостность набора, порядок записи, идемпотентность и «не освобождать забронированный
слот», чанки по 100, манифест (слияние секций, права файла, повреждённый файл), CLI и env,
генерация паролей под политику, PKCE (вектор RFC 7636), cookie-jar, разбор настоящей страницы
входа, весь поток входа против двойника auth-service, планирование и разбор ответов шага
пользователей (в т.ч. «пароль не печатается»).

## Найденное при проверке

1. **Кэш поиска HAPI (60 с).** Одинаковый поиск HAPI отдаёт из кэша: проверочный запрос
   показывал 357 слотов при 404 реальных. Для seed это опасно: «слот уже есть?» могло бы
   дать устаревший ответ и привести к перезаписи забронированного слота. `FhirHttp` теперь шлёт
   `Cache-Control: no-cache` (проверено: HAPI это уважает). Та же уязвимость есть у проверки
   существования в `SlotGeneratorService` (поиск `Slot` перед записью) — это код catalog-service,
   не мой.
2. **`practitioner-service`: `RoomsService.list` ищет `Location?physical-type=room`.** В R4 у
   `Location` такого параметра нет (HAPI-0524, допустимые: `_id, address*, endpoint, identifier,
   name, near, operational-status, organization, partof, status, type`). `GET /api/v1/admin/rooms`
   упадёт 400 -> 502. Сам сервис пишет `physicalType` с кодом `ro`, так что и значение `room`
   не совпало бы.
3. **`practitioner-service`: `DoctorsService` ищет `Practitioner?qualification-code=`.** В R4 у
   `Practitioner` такого параметра нет (HAPI-0524). `GET /api/v1/doctors?specialty=` упадёт.
   Рабочая замена: `PractitionerRole?specialty=<код>` + `_include=PractitionerRole:practitioner`
   (seed кодирует `PractitionerRole.specialty` в SNOMED CT; запрос по `419192003` возвращает 1).
4. **Фронтенд:** страница врачей читает `{ items: [{ name, specialty }] }`, а сервис отдаёт
   голый массив `{ id, firstName, lastName, specialty }`; `roomId` маппер не заполняет, хотя
   `PractitionerRole.location` в seed есть.

Пункты 2-4 — чужие пути (practitioner-service, catalog-service, frontend), я их не правил.

## Отклонения и решения

- `$expand?filter=` по коду у HAPI не работает (только display) — см. выше; доказательство
  строится по display + `$validate-code`.
- Добавлен `tools/tsconfig.json` (в `tools/**`, в моей зоне).
- `fake-auth-server.ts` и `oauth-login-form.spec.ts` читают (импортируют) два чистых файла
  auth-service: `login/login-page.ts` и `login/authorize-query.ts`. Если они переедут или
  изменят разметку формы, `npm run test:tools` покажет, что seed надо перепроверить.
- Из конфигурации убрана `OAUTH_LOGIN_PATH`: путь формы берётся из атрибута `action` страницы
  входа (по умолчанию `/oauth/login`).
- Общие файлы: в корневой `package.json` — одна аддитивная строка `seed:demo`
  (скрипт `seed:terminology` и `test:tools` уже были). Больше ничего вне `tools/**` и этого
  отчёта не менялось. Зависимости не добавлялись, `.env` не читался, git-команды,
  меняющие состояние, не запускались.

## Файлы

- `tools/shared/`: `deterministic-id.ts`, `fhir-http.ts`, `in-memory-fhir.ts`, `seed-env.ts` + 3 спека.
- `tools/terminology-seed/`: `canonical-upsert.ts`, `expansion-codes.ts`, `seed-terminology.ts`,
  `terminology-proof.ts`, `terminology-resources.ts`, `snapshot/{atc,icd-10,ucum}.json` + спеки.
- `tools/demo-seed/`: `demo-catalog.ts`, `demo-ids.ts`, `demo-lookup.ts`, `demo-slots.ts`,
  `demo-resources.ts`, `seed-demo-fhir.ts`, `demo-manifest.ts`, `demo-credentials.ts`,
  `demo-cli-options.ts`, `oauth-flow-error.ts`, `oauth-cookie-jar.ts`, `oauth-login-form.ts`,
  `oauth-pkce-client.ts`, `seed-demo-users.ts`, `seed-demo.ts`, `fake-auth-server.ts`,
  `.gitignore` + 11 спеков.
- `tools/tsconfig.json`, `package.json` (`seed:demo`), этот отчёт.

## Следующие шаги

- `/code-reviewer` по `tools/**`.
- Когда auth-service будет развёрнут: `npm run seed:demo -- --users` и проверка, что токен
  врача несёт `fhirUser = PractitionerRole/{id}` из манифеста.
- Передать владельцам practitioner-service, catalog-service и frontend пункты 1-4 из «Найденного при проверке».

## Исправления по ревью (F1-F5)

Прогон возобновлён после лимита; исправлены все major и дешёвые minor замечания в `tools/**`.
Проверки после исправлений: `npm run test:tools` - 21 сьют, 294 теста, зелёные; `npx tsc -p tools/tsconfig.json` -
0 ошибок; ESLint (`--no-ignore 'tools/**/*.ts'`) - 0 замечаний; файлы <= 300 строк, функции <= 30 строк;
`npx nx test auth-service` (там же drift-тест снимка) - 426 тестов зелёные.

### F1 (major) - окна расписаний писались в UTC, а catalog-service читает время клиники: исправлено

Замечание подтверждено: в рабочем дереве catalog-service (`common/clinic-calendar.ts`, `schedules/slot-planner.ts`,
`planSlots()`) окно `09:00` - это 09:00 по Минску (06:00Z), день недели - клинический. Seed же клал в расширение
`schedule-weekly-windows` окна `06:00-10:00`; после выката правки catalog-service кнопка «сгенерировать слоты»
создала бы вторую, пересекающуюся сетку на 03:00Z-07:00Z (двойная запись).

- `demo-slots.ts`: `toUtcWindows` и ограничение «не пересекать полночь UTC» удалены; `clinicWindows()` хранит окна как
  есть (`09:00-13:00`), проверяет только «окно умещается в клинические сутки». `expandSlotIntervals()` идёт по
  календарным дням клиники: день недели берётся от даты, instant = полночь клиники (UTC-полночь - 3 ч) + минуты окна.
  Instants слотов и их id не изменились (тот же `start`), поэтому уже созданные 404 слота остались теми же.
- `demo-slots.ts`: `clinicDateOf(instant)` (now + 3 ч); дефолт `--from` в `seed-demo.ts` - клиническая дата, а не UTC-дата
  (между 00:00 и 03:00 по Минску они различаются).
- Манифест: `windowsUtc` -> `windows` (время клиники). Комментарии и шапки (`demo-catalog.ts`, `demo-resources.ts`,
  `demo-cli-options.ts`, `seed-demo-fhir.ts`) приведены в соответствие.
- Новый `demo-slots-parity.spec.ts`: импортирует настоящий `planSlots` из catalog-service (как `fake-auth-server` -
  страницу входа auth-service) и сравнивает start/end со слотами seed для **всех** `SCHEDULES` на трёх горизонтах
  (14 дней с понедельника; с воскресенья через границу месяца и года; один день), плюс проверка через `Intl`
  (`Europe/Minsk`), что первый слот каждого расписания начинается в `localStart`, а последний кончается не позже
  `localEnd`. Старая семантика (UTC) этот тест роняет.
- Живая проверка (HAPI, 2026-10-14): `npm run seed:demo` переписал 6 `Schedule` (версия 3, окна `09:00-13:00` и т.д.), слоты
  не создавались и не менялись (`created=0` по всем расписаниям). Скрипт читает **сохранённые** окна из HAPI, прогоняет
  их через `planSlots` catalog-service и сверяет sha256-id с существующими слотами: запланировано 404, из них
  «создал бы `POST /admin/schedules/{id}/slots`» - **0**.

### F2 (major) - АТХ `C09AA05` был подписан «Лизиноприл»: исправлено

`C09AA05` - рамиприл, лизиноприл - `C09AA03`. Запись заменена на `{ "code": "C09AA03", "display": "Лизиноприл" }` в
`tools/terminology-seed/snapshot/atc.json` **и** в копии `apps/auth-service/src/modules/terminology/import/snapshot/atc.json`
(drift-тест `snapshot-resources.spec.ts` сравнивает построители обеих копий, поэтому правка должна быть синхронной;
это единственная правка вне `tools/**`, однострочная, по прямому указанию замечания). Остальные 16 кодов АТХ перечитаны
(названия соответствуют классификации). Новый `snapshot-content.spec.ts` фиксирует формат кодов АТХ/МКБ-10,
отсутствие дублей и исправленную пару (`C09AA03` - лизиноприл; `C09AA05` не может быть лизиноприлом).
Живая проверка: `ValueSet/atc $validate-code`: `C09AA03` -> `result=true`, `display=Лизиноприл`; `C09AA05` -> `result=false`
(`Unknown code`). Применено `npm run seed:terminology` (обновилась только CodeSystem `1002`, версия 2 -> 3).

### F3 (major) - вне `tools/**`: не исправлялось, передано владельцу practitioner-service

Подтверждено повторно: `Location?physical-type=room` и `Practitioner?qualification-code=...` на живом HAPI дают
`400 HAPI-0524` (в R4 таких параметров нет), в рабочем дереве `doctors.service.ts:28,54` и `rooms.service.ts:27` их ещё
используют. Файлы принадлежат другому агенту, который правит practitioner-service прямо сейчас, и seed не может это
исправить законно: кастомные `SearchParameter` на HAPI замаскировали бы дефект и ушли бы от чистого R4 International (и
значение `room` всё равно не совпало бы с кодом `ro`, который сервис сам пишет). Рекомендация владельцу без изменений:
`PractitionerRole?specialty=<SNOMED>&_include=PractitionerRole:practitioner` (+ `service=HealthcareService/{id}`);
для кабинетов - убрать `physical-type` и постфильтровать `physicalType.coding[0].code === 'ro'`. Данные seed для этого
готовы: специальность кодируется и в `Practitioner.qualification[0].code`, и в `PractitionerRole.specialty` (SNOMED).

### F4 (minor) - потеря сгенерированных паролей и неатомарный манифест: исправлено

- `seed-demo-users.ts`: запрос, который отклонился (сеть, рестарт auth-service), превращается в запись `failed` **с
  сохранённым паролем** (исход неизвестен: аккаунт мог быть создан до потери ответа; повторный запуск возьмёт тот же
  пароль и получит `409 EMAIL_TAKEN` -> `exists` с тем же паролем). Тело `201`, не являющееся JSON, больше не бросает
  исключение: аккаунт записывается как `created` с паролем, `userId` пуст, в `detail` пояснение. `toUserRecord` не бросает.
  Цикл больше не прерывается одним аккаунтом.
- `seedDemoUsers(config, fetch, onProgress)`: после **каждого** аккаунта вызывается `onProgress(section)`; `seed-demo.ts`
  пишет манифест при каждом вызове. Секция «на данный момент» дополняется записями прошлого манифеста для ещё не
  обработанных аккаунтов, поэтому прерванный повторный запуск не теряет ранее записанные пароли.
- `writeManifest`: запись во временный файл рядом (`<path>.<pid>.tmp`, режим `0600`) и `rename()`; при ошибке временный файл
  удаляется. Обрыв посреди записи оставляет прежний манифест целым, а `0600` теперь применяется при каждой записи, а не
  только при создании файла.
- Тесты: `should keep the passwords of created accounts when a later request rejects`, повторный запуск после
  «аккаунт создан, ответ потерян» (тот же пароль, одно создание), `201` не-JSON, `onProgress` после каждого аккаунта,
  прерванный повторный запуск, атомарность записи (`rename` отказывает -> прежний файл цел, временных файлов нет),
  ужесточение прав. Двойник эндпоинтов аккаунтов вынесен из спека в `fake-auth-api.ts`.
- Шаг `--users` на живом стеке не запускался (нужны `BOOTSTRAP_ADMIN_*`, `.env` seed не читает); покрыт тестами.

### F5 (minor) - неохраняемое удаление по canonical и `FHIR_BASE_URL` сервисов: исправлено

Текст замечания в задании обрезан («...только если она выглядит как копия»), поэтому правило сформулировано здесь.

- `canonical-upsert.ts`: legacy `CodeSystem` удаляется **только** если он узнаваем как собственная копия seed:
  `content: complete`, в теле перечислены понятия и их не больше, чем в снимке (`isLegacySeedCopy`, вложенные понятия
  считаются). `not-present` (понятия лежат только в таблицах HAPI), `complete` без списка понятий и копия, у которой понятий
  больше снимка, - не удаляются: `planCanonicalUpsert` бросает ошибку с id, canonical и числом понятий и советом удалить
  вручную либо направить seed на другой сервер. Удаление терм-индекса необратимо (повторный `PUT` его не вернёт), поэтому
  seed не трогает настоящий импорт НСИ/МКБ-10/АТХ (ADR-002/016).
- `seedTerminology` теперь сначала планирует **все** ресурсы (`planUpsert`, только чтение) и лишь потом пишет
  (`applyUpsert`): отказ останавливает прогон до первой записи (тест: после отказа нет ни одного не-GET запроса).
- `recreateValueSet` больше не ищет и не удаляет «всё с этим url»: он трогает только `ValueSet`, который этот прогон только
  что записал (усыновлённый серверный id, например `1004`, либо детерминированный), и записывает его обратно под тем же id
  (тест: удаляется ровно `ValueSet/1004`, дубликата нет).
- `shared/seed-env.ts`: `resolveFhirBaseUrl` читает только `SEED_FHIR_BASE_URL` (иначе - локальный HAPI). `FHIR_BASE_URL`
  сервисов **не** используется как запасной вариант; если он задан, а `SEED_FHIR_BASE_URL` нет, печатается предупреждение
  (значение не выводится). Обновлены тесты и шапка `seed-demo.ts`.
- Теги `meta.tag` на терминологических ресурсах не добавлялись: построители `terminology-resources.ts` сравниваются
  drift-тестом auth-service с его собственными, а менять чужой построитель нельзя.

### Живое доказательство идемпотентности (HAPI, 2026-10-14, после исправлений)

Снимок `{id@versionId}` по CodeSystem, ValueSet, Organization, Location, Practitioner, PractitionerRole, HealthcareService,
Schedule, Slot (4/5/1/5/4/4/6/6/404). Первый прогон исправленных seed изменил ровно то, что должен: CodeSystem `1002`
(АТХ, F2) и 6 `Schedule` (окна, F1). Затем ещё `seed:demo` x2 и `seed:terminology` x1: снимок до и после **идентичен**
(`True`), слотов создано 0 (`planned=80/90/36/36/90/72 created=0`), дубликатов нет.

Наблюдение (не дефект seed): для `ValueSet/atc` HAPI сейчас отдаёт сохранённое расширение и игнорирует `filter`
(`filter=zzzz` тоже возвращает 17 кодов; для МКБ-10, НСИ и UCUM фильтр работает), поэтому «ATC J01FA10 ... 17 match(es)» -
доказательство по ATC сводится к «код есть в расширении». Настоящий барьер сервисов - `$validate-code` (BR-004/BR-009) -
проверяет каждый код снимка и отвергает неизвестный; с него и стоит считать доказательство.

### Итоговый статус замечаний

| Замечание | Статус |
|---|---|
| F1 major (окна в UTC) | исправлено, parity-тест, живая проверка |
| F2 major (АТХ C09AA05) | исправлено в обеих копиях снимка, тест, живая проверка |
| F3 major (practitioner-service) | вне зоны; подтверждено, передано владельцу |
| F4 minor (пароли/манифест) | исправлено, тесты |
| F5 minor (удаление/FHIR_BASE_URL) | исправлено, тесты |

Изменения вне `tools/**`: `apps/auth-service/src/modules/terminology/import/snapshot/atc.json` (одна строка, F2). Зависимости не
добавлялись, `.env` не читался, git-команд, меняющих состояние, не запускалось.
