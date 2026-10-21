# Отчёт coder: пробелы бэкенда, найденные фронтендом (7 пунктов)

Дата: 2026-10-21. Ветка `feature/clinic-platform-wip`, база `d90e328`. Возобновлённый прогон: незавершённая работа предыдущего прогона в `apps/*`, `libs/*`, `tools/stack-smoke`, `specs/api-designer-spec.md` проверена, признана корректной и полной (все пункты реализованы с тестами) и принята как есть. Что-либо заново писать не потребовалось, доработок не понадобилось. Каталог `frontend/` не тронут. Команды git, меняющие состояние, не запускались.

## Что сделано по пунктам

| # | Пункт | Решение | Где |
|---|-------|---------|-----|
| 1 | Appointment остаётся `booked` после завершения приёма | `Appointment.status='fulfilled'` ставится в той же HAPI `transaction` Bundle, что и клинические ресурсы. `PUT Encounter` и `PUT Appointment` несут `If-Match` на прочитанные версии. | `encounter-service`: `encounters.service.ts`, `mappers/encounter-completion.mapper.ts` |
| 2 | `noshow` отвечал 200 для записи с завершённым приёмом | Не `booked` или есть `Encounter` (in-progress или finished) -> 409 `ENCOUNTER_STATE_INVALID`. Проверка владельца (403) идёт раньше. | `appointment-service`: `appointments.service.ts` |
| 3 | 422 называет код только в `detail` | Добавлен `details[{field, message}]` с путём DTO (`diagnoses.1.code`, `medicationRequests.1.atcCode`, `observations.0.unit`). `detail` сохранён. Фильтр ошибок пропускает `details[]` для `VALIDATION_ERROR`, `INVALID_ICD10_CODE`, `TERMINOLOGY_NOT_FOUND`. Текст `@MatchesATC` / `@MatchesICD10` приведён к виду `<property> must be an ATC code such as J01FA10`, как у остальных `must be …`, тест закрепляет формулировку. | `encounter-service`: `terminology-validator.service.ts`, `clinical-code.validators.spec.ts`; `libs/common`: `problem-details.filter.ts`; `libs/contracts`: `problem-details.ts` |
| 4 | У `GET /appointments?upcoming=true` нет фильтра статуса | Необязательный `status`: один статус или список через запятую (`booked,cancelled,noshow,fulfilled`), допустим и повтор параметра. Whitelist в DTO, неизвестное значение -> 400 `VALIDATION_ERROR` с `details[{field:'status'}]`. FHIR-поиск `Appointment?status=a,b`. Семантика `upcoming` не изменена. | `appointment-service`: `list-appointments-query.dto.ts`, `appointment-queries.service.ts` |
| 5 | `DoctorResponseDto` без токена специальности и ролей | Добавлены `specialtyCode`, `specialtySystem` (из `Practitioner.qualification[0].code.coding`, тот же концепт, по которому фильтрует `?specialty=`) и `practitionerRoleIds: string[]` (активные роли, по возрастанию, `[]` если нет). Один дополнительный поиск `PractitionerRole` на страницу. | `practitioner-service`: `doctors.service.ts`, `doctor.mapper.ts`, `doctor-response.dto.ts`; `libs/fhir-mappers`: `practitioner.mapper.ts` |
| 6 | Дубликат `identifier` кабинета проходил (201) | `POST` и `PATCH /admin/rooms` -> 409 `CONFLICT`, `detail`: `CONFLICT: room identifier "…" is already used by room {id}`. Сравнение без учёта регистра и крайних пробелов. PATCH с собственным `identifier` допустим. | `practitioner-service`: `rooms.service.ts`, `room-identifier.ts` |
| 7 | Спека 2.2.6 про дубликат email | Текст приведён к факту: 409, `errorCode=CONFLICT`, `EMAIL_TAKEN` в начале `detail`. Поведение не менялось. | `specs/api-designer-spec.md` |

### Почему `fulfilled` в той же транзакции (пункт 1)

- ADR-011: источник истины — HAPI. Состояние приёма и записи должно меняться одной атомарной операцией, без саги и без компенсаций.
- `PUT Appointment` с `If-Match` повторяет оптимистичную блокировку, которой уже защищена запись на слот (ADR-012). Если запись за время работы врача отменили или пометили неявкой, а также при конкурентном завершении приёма, вся Bundle откатывается, ответ 409 `ENCOUNTER_STATE_INVALID`, событие `encounter.completed.v1` не публикуется.
- Альтернативы отвергнуты. Обновление записи отдельным вызовом после коммита оставляет окно, в котором приём завершён, а запись `booked`, и теряет атомарность при падении. Изменение записи по событию (RabbitMQ) делает `fulfilled` eventually consistent и добавляет межсервисную зависимость.
- Аудит: в Bundle теперь три `AuditEvent` (`update` Encounter, `update` Appointment, `create` клинических ресурсов).
- Внешний контракт ответа 7.3 не менялся. Эффект виден в `GET /appointments/{id}` и в списках 6.2, 6.3, 6.5: `status='fulfilled'`.
- После завершения приёма запись нельзя ни пометить неявкой (409 `ENCOUNTER_STATE_INVALID`), ни отменить (409 `APPOINTMENT_NOT_CANCELLABLE`).

## Изменения API (для фронтенда)

Все изменения аддитивные и обратно совместимые. Описаны в `specs/api-designer-spec.md` (разделы 1, 2.2.1/2.2.6, 4.1/4.2, 4.4/4.5, 6.2, 6.6, 7.3).

- `POST /api/v1/encounters/{id}/complete` (7.3): после успеха `Appointment.status='fulfilled'` (в теле ответа ничего не добавлено). Если запись изменилась, пока шло оформление, -> 409 `ENCOUNTER_STATE_INVALID`.
- `POST /api/v1/encounters/{id}/complete`, ответы 422 `INVALID_ICD10_CODE` и `TERMINOLOGY_NOT_FOUND`: новое поле `details[{field, message}]`. `field` — путь в формате точечной нотации, как у 400: `diagnoses.1.code`, `medicationRequests.0.atcCode`, `observations.0.code`, `observations.0.unit`, `serviceRequests.0.code`. По записи на каждое поле с плохим кодом. `detail` без изменений.
- Тексты 400 `VALIDATION_ERROR` для `diagnoses[].code` и `medicationRequests[].atcCode`: `<property> must be an ICD-10 code such as J06.9` и `<property> must be an ATC code such as J01FA10`.
- `GET /api/v1/appointments` (6.2): новый необязательный query-параметр `status` со значениями `booked|cancelled|noshow|fulfilled` (одно значение, список через запятую или повтор параметра). Неизвестное значение -> 400 `VALIDATION_ERROR`, `details[{field:'status'}]`. Для «предстоящих активных» нужно `upcoming=true&status=booked`. Без `status` `upcoming=true` по-прежнему отдаёт и отменённые.
- `POST /api/v1/doctor/appointments/{id}/noshow` (6.6): теперь 409 `ENCOUNTER_STATE_INVALID` для записи не в статусе `booked` и для записи, у которой есть приём (in-progress или finished). Раньше для не-`booked` было 409 `CONFLICT`, а для записи с завершённым приёмом — 200. Это единственное поведенческое изменение, и оно по заданию (код 409 сменился с `CONFLICT` на `ENCOUNTER_STATE_INVALID`).
- `GET /api/v1/doctors` и `GET /api/v1/doctors/{id}` (`DoctorResponseDto`): новые поля `specialtyCode?: string` (значение для `?specialty=`), `specialtySystem?: string` (`?specialty=system|code`), `practitionerRoleIds: string[]` (всегда массив). `specialty` остаётся отображаемым текстом. Для врача без кодированной квалификации `specialtyCode` и `specialtySystem` отсутствуют.
- `POST /api/v1/admin/rooms`, `PATCH /api/v1/admin/rooms/{id}`: 409 `CONFLICT` при занятом `identifier` (без учёта регистра и пробелов). `detail`: `CONFLICT: room identifier "…" is already used by room {id}`.
- Спека 2.2.1/2.2.6 (`POST /admin/users`): дубликат email -> 409, `errorCode=CONFLICT`, `EMAIL_TAKEN` в начале `detail`. Коды ошибок (раздел 1, каталог) уточнены для `CONFLICT`, `ENCOUNTER_STATE_INVALID`, `INVALID_ICD10_CODE`, `TERMINOLOGY_NOT_FOUND`.

## Проверки

| Проверка | Результат |
|----------|-----------|
| `npx nx run-many -t test lint build -p common contracts fhir-mappers encounter-service practitioner-service appointment-service --parallel=1` | PASS (22 из 22 задач, результаты взяты из кэша nx: входы совпадают с успешным прогоном предыдущего запуска). Тесты по 6 проектам: 64, 176, 4, 125, 165 и 109 passed, 0 failed |
| `npx jest tools/stack-smoke` | 12 наборов, 96 тестов passed |
| `npx tsc --noEmit -p tools/tsconfig.json` | без ошибок |
| `docker compose up -d --build practitioner-service appointment-service encounter-service` + `npm run stack:wait` | образы пересобраны, стек отвечает на http://localhost:8081 |
| `npm run smoke:stack` | TOTAL 131 passed, 0 failed, 0 skipped (с первого запуска; `seed:demo` не понадобился) |
| Размер файлов, `any`, `!` | файлы кода <= 300 строк, `any` и non-null `!` не добавлены |

Новые проверки smoke (`tools/stack-smoke`), существующие утверждения не ослаблялись, у двух сменился ожидаемый код 409 по новому контракту:

- chain: encounter: `noshow` при приёме in-progress -> 409 `ENCOUNTER_STATE_INVALID`; после завершения запись `fulfilled` у пациента, врача и админа; `noshow` после приёма -> 409 `ENCOUNTER_STATE_INVALID`, отмена -> 409 `APPOINTMENT_NOT_CANCELLABLE`, статус остаётся `fulfilled`.
- terminology: invalid codes -> 422: `details[]` содержит `diagnoses.1.code`, `medicationRequests.1.atcCode`, `observations.0.unit`, `detail` сохранён.
- chain: patient record: `?status=fulfilled`, `?status=booked&upcoming=true`, `?status=booked,fulfilled`, плохой `status` -> 400 с `details[].field='status'`.
- BR-001 race + cancel: `?status=cancelled` содержит отменённую запись, `status=booked&upcoming=true` — нет, `upcoming=true` без `status` по-прежнему её содержит.
- no-show: повторная неявка -> 409 `ENCOUNTER_STATE_INVALID` (раньше ожидался `CONFLICT`).
- catalog: `GET /doctors` и `GET /doctors/{id}` отдают `specialtyCode`, `specialtySystem`, `practitionerRoleIds` с ролью врача; `?specialty=` принимает `code` и `system|code`.
- admin catalog: дубликат `identifier` -> 409 `CONFLICT` при создании (в том числе в другом регистре) и при переименовании.

Образы `catalog-service` и остальных сервисов не пересобирались: `libs/common` и `libs/contracts` изменились только в части `details[]` для двух 422-кодов (эти коды выдаёт только encounter-service), `fhir-mappers` — аддитивные поля у практиционера (используются `practitioner-service`, пересобран, и `catalog-service`, поведение которого не затронуто).

## Что проверить вручную

Аккаунты берутся из `tools/demo-seed/output/demo-manifest.json` (пароли здесь не приводятся). Для вызова API используйте токен из браузерной сессии либо запросы через интерфейс.

1. Завершение приёма -> запись `fulfilled` (пункт 1).
   - Войти как `doctor.ivanova@medcenter.test`, в журнале записей открыть приём по записи в статусе «забронирована», заполнить и завершить.
   - Ожидаемо: приём завершён; в журнале врача эта запись теперь `fulfilled`.
   - Войти как пациент этой записи (например `patient.kuznetsov@medcenter.test`, если запись его): в кабинете запись `fulfilled`, `GET /api/v1/appointments/{id}` -> `status: fulfilled`; кнопка отмены должна отвечать 409 `APPOINTMENT_NOT_CANCELLABLE`.
   - Фронтенд пока может не знать статус `fulfilled` в бейдже: проверить, что отображается разумно.
2. Неявка после приёма (пункт 2).
   - Для записи с завершённым или идущим приёмом: `POST /api/v1/doctor/appointments/{id}/noshow` от `doctor.ivanova@medcenter.test` -> 409 `ENCOUNTER_STATE_INVALID`. Для чужой записи (другой врач) по-прежнему 403 `COMPARTMENT_VIOLATION`.
   - Для свежей `booked` записи без приёма -> 200, `status: noshow`. Повторный вызов -> 409 `ENCOUNTER_STATE_INVALID`.
3. Поля ошибки 422 (пункт 3).
   - Врач: завершить приём с диагнозом `Z99.99` (нет в seed) вторым в списке -> 422 `INVALID_ICD10_CODE`, `details[0].field = diagnoses.1.code`, в `detail` по-прежнему перечислен код.
   - Назначение с `atcCode: Z99ZZ99` -> 422 `TERMINOLOGY_NOT_FOUND`, `details[].field = medicationRequests.N.atcCode`.
   - Назначение с `atcCode: abc` -> 400 `VALIDATION_ERROR`, сообщение `atcCode must be an ATC code such as J01FA10`.
   - Фронтенд может подсвечивать поле по `details[].field` (формат `diagnoses.1.code`, не `diagnoses[1].code`).
4. Фильтр статуса (пункт 4).
   - Пациент: `GET /api/v1/appointments?upcoming=true&status=booked` -> нет отменённых; `?status=cancelled` -> только отменённые; `?status=booked,fulfilled` -> оба; `?status=done` -> 400 с `details[].field = status`; `?upcoming=true` без `status` -> по-прежнему включает отменённые.
5. Поля врача (пункт 5).
   - Любой аккаунт или аноним: `GET /api/v1/doctors` -> у каждого врача `practitionerRoleIds` (массив) и, у врачей с кодированной специальностью, `specialtyCode`/`specialtySystem`; `GET /api/v1/doctors?specialty=<specialtyCode>` и `?specialty=<specialtySystem>|<specialtyCode>` возвращают этого врача.
   - `admin@medcenter.local`: форма создания DOCTOR-аккаунта может брать `practitionerRoleIds[0]` как `practitionerRoleId`.
6. Дубликат кабинета (пункт 6).
   - `admin@medcenter.local`: создать кабинет с занятым `identifier` (также в другом регистре) -> 409 `CONFLICT`, `detail` называет `identifier` и id существующего кабинета. Переименование другого кабинета в занятый `identifier` -> 409. PATCH с собственным `identifier` -> 200.
7. Спека (пункт 7): раздел 2.2.6 описывает 409 `CONFLICT` + `EMAIL_TAKEN` в `detail`. Проверка чтением; поведение: регистрация/создание пользователя с занятым email -> 409.

### Известные ограничения

- `fulfilled` ставится только через завершение приёма (7.3). Автоматического перевода прошедших записей без приёма (кроме ручной неявки) нет.
- Проверка уникальности `identifier` кабинета выполняется сервисом (HAPI не имеет unique-ограничения): чтение всех кабинетов и сравнение. Два одновременных `POST` с одинаковым `identifier` в один момент не отслеживаются (админские записи, низкая частота).
- `noshow` не видит приём, открытый в промежуток между проверкой и коммитом. Такой приём всё равно нельзя завершить, так как запись уже не `booked` (7.3 -> 409).
- `practitionerRoleIds` содержит все активные роли врача, а не только подошедшие под фильтр `serviceId`/`specialty`; ради него на странице `GET /doctors` выполняется один дополнительный поиск ролей (до 200).
- `details[].field` для 422 в точечной нотации (`diagnoses.1.code`), как и у 400, а не `diagnoses[1].code` из формулировки задачи: единый формат для клиента.
- `?status=` не меняет сортировку и пагинацию; `upcoming` и `status` соединяются по И.
- Кабинеты, созданные до введения проверки, могли иметь дубликаты `identifier`: они не правятся автоматически, но переименование одного из них в свободный `identifier` допустимо.

## Context Summary

Пункты 1-7 реализованы (код и тесты были написаны в прерванном прогоне, в этом прогоне проверены и приняты), спека обновлена. Сервисы `practitioner-service`, `appointment-service`, `encounter-service` пересобраны, `npm run smoke:stack` зелёный: 131 passed, 0 failed. Тесты, lint, build по затронутым проектам проходят.

## Next Steps

**Next by flow:** `/code-reviewer [backend gaps 1-7: fulfilled appointment in the completion transaction, noshow 409, details[] for 422, status filter, doctor specialty token + practitionerRoleIds, room identifier uniqueness]` - проверить реализованный код на качество и ошибки.

**Alternatives:**
- `/test-generator [backend gaps]` - дополнить тесты.
- `/debugger [defect]` - разобрать дефекты, найденные при ручном тестировании.
