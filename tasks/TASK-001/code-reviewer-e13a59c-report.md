# Code review: e13a59c «backend gaps» (состояние HEAD 54ddbab)

Ревьюер: code-reviewer (r1), 2026-10-23. Проверялся код HEAD (с учётом поздних коммитов в тех же файлах: consent, audit, 538f7d2), незакоммиченные изменения рабочего дерева не учитывались.
Контракт: `specs/api-designer-spec.md` §1, §4.1/4.2, §4.4/4.5, §6.2, §6.6, §7.3; ADR-011/012/013/014/019; `AGENTS.md`; `.claude/GOLDEN-PRINCIPLES.md`.
Живые проверки (только чтение, через Traefik `localhost:8081`): `GET /api/v1/doctors`, `?specialty=code`, `?specialty=system|code`.

Итог: Critical — 0, Major — 1, Minor — 4. Изменения в целом корректны, хорошо покрыты тестами и смоуком.

## Critical

Нет.

## Major

### M1. Открытие приёма не меняет Appointment, поэтому If-Match на записи не ловит гонку «открытие приёма ↔ неявка/отмена»
- `apps/appointment-service/src/modules/appointments/appointments.service.ts:158-194` (`markNoShow` / `assertNoEncounter`), `apps/encounter-service/src/modules/encounters/encounters.service.ts:169-212` (`open`), `encounters.service.ts:429-439` (`readStillBookedAppointment`).
- Сценарий: врач в двух вкладках (или врач и пациент) почти одновременно: (1) `POST /encounters` (open) проходит проверку `booked` и коммитит Encounter `in-progress`; (2) `noshow` уже выполнил `Encounter?appointment=` и не видит приём, коммитит `noshow` — его `If-Match` на Appointment проходит, потому что открытие приёма Appointment не трогало. Итог: запись `noshow` + приём `in-progress`, который нельзя ни завершить (7.3 → 409, `appointment is noshow`), ни закрыть иначе; клиническая форма, заполненная врачом, теряется на 409. Код и спец §6.6 эту гонку признают, но не устраняют. Та же «вечная» `in-progress`-ситуация достижима без гонки через отмену (6.4): `readCancellable` (`appointments.service.ts:139-149`) не проверяет наличие приёма — это до e13a59c, но чинится тем же способом.
- Исправление: при открытии приёма в той же transaction Bundle делать `PUT Appointment` с `If-Match` и реальным изменением (например FHIR R4 `status=arrived`/`checked-in`, либо meta.tag/extension «encounter opened»), чтобы версия записи росла; тогда `noshow`/`cancel` с `If-Match` проигрывают гонку (409), а в `cancel` добавить ту же проверку `assertNoEncounter` (или статус `arrived` сам её закрывает). Если выбирается `arrived` — это изменение контракта (`APPOINTMENT_STATUSES`, §6), требует решения владельца. Тест: unit «noshow проигрывает, если batch отклонён 412», e2e на FakeHapi — open + noshow с одной прочитанной версией.

## Minor

### m1. Проигранная гонка `noshow` отвечает `409 CONFLICT`, а не `ENCOUNTER_STATE_INVALID`
- `appointments.service.ts:169-176` — `commitTransaction(..., 'CONFLICT')`.
- Сценарий: запись отменили или завершили приём (→ `fulfilled`) между чтением и коммитом `noshow` → клиент получает `CONFLICT`, хотя §6.6 и §1 говорят, что не-`booked` запись даёт `ENCOUNTER_STATE_INVALID` (этот же коммит перевёл синхронную ветку на `ENCOUNTER_STATE_INVALID`). Фронтенд, ветвящийся по `errorCode`, увидит два разных кода для одной ситуации.
- Исправление: передавать `'ENCOUNTER_STATE_INVALID'` в `commitTransaction`; добавить unit-тест с `fhir.batch` → `FhirClientError(412)` (сейчас lost-race для noshow не покрыт, в отличие от `book`).

### m2. Идентификатор кабинета не нормализуется на границе: сохраняется с пробелами, принимается «пустой» из пробелов
- `apps/practitioner-service/src/modules/rooms/dto/create-room.dto.ts:5-8`, `dto/update-room.dto.ts:11-15`, `rooms.service.ts:128`, `room-identifier.ts:4-6`.
- Сценарий: `POST /admin/rooms {identifier: "   "}` проходит `@IsNotEmpty` (он не триммит), хранится как `"   "`, ключ сравнения `''`; `{identifier: " 204 "}` хранится и отдаётся с пробелами, хотя уникальность считается по `trim()`. Получаем кабинет с невидимым номером и расхождение между тем, что сравнивается, и тем, что хранится.
- Исправление: `@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)` перед валидаторами (или `@Matches(/\S/)`), хранить нормализованное значение; тест на `"   "` → 400 и на `" 204 "` → хранится `"204"`. Также `toLocaleLowerCase()` зависит от локали процесса — для детерминизма лучше `toLowerCase()` (кириллица обрабатывается одинаково).

### m3. Комментарий `toStatusList` расходится с поведением
- `apps/appointment-service/src/modules/appointments/dto/list-appointments-query.dto.ts:10-22`.
- JSDoc обещает «list without blanks», а пустые элементы не отбрасываются: `status=booked,` и `?status=&status=booked` → 400. Тест (`'booked,'` → reject) и §6.2 («неизвестное значение → 400») это поведение закрепляют, так что меняется только комментарий: «пустое значение целиком = без фильтра; пустой элемент списка — ошибка».

### m4. `encounters.service.ts` перерос лимит размера файла
- `apps/encounter-service/src/modules/encounters/encounters.service.ts` — 440 строк (GOLDEN-PRINCIPLES: ~300). e13a59c добавил `loadCompletable`/`readStillBookedAppointment`, поздние коммиты — consent/bypass.
- Исправление: вынести открытие (`open`/`create`/`reopen`/`openingBypassOnce`) в `encounter-opening.service.ts` или загрузку для завершения в отдельный helper. Не срочно.

## Замечено вне объёма e13a59c (не findings этого ревью)
- `libs/common/src/lib/filters/problem-details.filter.ts:44-58` — статический `fromValidationError` нигде не используется и при этом не кладёт `details[]` в ответ (противоречит §1, если кто-то начнёт его вызывать). Удалить или исправить.
- `DoctorsService.list` с фильтром `serviceId`/`specialty` пейджит по ролям: `totalItems` — число ролей, а не врачей (задокументировано в JSDoc, на текущих данных 1 роль на врача).
- `?specialty=a,b` работает как ИЛИ (токен FHIR) — публичные данные, не уязвимость, но в §4.1 не описано.

## Проверено, OK
- 7.3: `PUT Encounter` и `PUT Appointment(fulfilled)` в одной transaction Bundle, оба с `If-Match` на прочитанные версии (`encounter-completion.mapper.ts:129-136,173-183`); HAPI 409/412 → `409 ENCOUNTER_STATE_INVALID`, событие публикуется только после коммита. e2e покрывает изменение записи между чтением и коммитом, повтор и параллельное завершение (`complete-encounter.e2e-spec.ts:66-131`).
- Других писателей Appointment, которые ломали бы `If-Match` завершения, нет (только cancel/noshow в appointment-service).
- Порядок проверок: 403 участника раньше 409 состояния в `open`, `complete`, `noshow` (статус не раскрывается чужому врачу; есть тест).
- AuditEvent на `Appointment` (update) пишется в той же Bundle (ADR-014); аналитика считает `fulfilled` как `booked` (read-model не меняет статус) — сумма booked/cancelled/noshow не ломается; patient-access считает `fulfilled` связью пациент-врач.
- 422 `details[]`: поля по пути DTO для каждой строки, включая повторяющиеся коды; `detail` сохранён; `details[]` пропускается фильтром только для `VALIDATION_ERROR`/`INVALID_ICD10_CODE`/`TERMINOLOGY_NOT_FOUND`, записи без `{field,message}` отбрасываются. Входные коды ограничены грамматикой DTO и `ArrayMaxSize`, параметры `$validate-code` не собираются строкой.
- §6.2 `status`: `@IsIn(APPOINTMENT_STATUSES, {each:true})` после нормализации — инъекции в FHIR-токен нет; компартмент из токена, `patient` из query отбрасывается whitelist; смоук проверяет `fulfilled`, список и 400.
- Врачи: `specialtyCode`/`specialtySystem` из `qualification[0].code.coding`; живая проверка — `?specialty=394579002` и `?specialty=http://snomed.info/sct|394579002` возвращают кардиолога, `practitionerRoleIds` заполнены. Поиск ролей одним запросом на страницу (нет N+1), ids из HAPI, `active=false` исключены.
- Кабинеты: 409 `CONFLICT` с идентификатором в `detail` на create и rename, PATCH на собственный идентификатор допустим, без `identifier` скан не выполняется, 404 раньше проверки; скан Location ограничен 1000. Гонка двух create признана в спецификации (её сейчас чинит другой агент).
- problem+json: все новые ошибки — каталогизированные `errorCode` через `ProblemDetailsFilter`.

## Верификация
- Тесты/линт в рамках ревью не перезапускались: в рабочем дереве есть чужие незакоммиченные изменения (`libs/common`, `libs/fhir`, practitioner/catalog), прогон отражал бы их, а не HEAD. По данным коммита e13a59c тесты и смоук проходили.
- Имя отчёта соответствует правилу префикса (`code-reviewer-…`), отчёт не закоммичен.
