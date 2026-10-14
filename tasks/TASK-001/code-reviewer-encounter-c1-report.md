# Code Review — encounter-service (Task 14, M4), раунд 1

Дата: 2026-10-14. **Skill:** code-reviewer · **Объект:** незакоммиченные изменения `apps/encounter-service/**`
(весь каталог новый, untracked) · **Отчёт исполнителя:** `coder-m4-encounter-report.md`.
**Источники:** `writing-plans-plan.md` Task 14, `specs/api-designer-spec.md` §0/§1/§7/§9.4,
`specs/architect-architecture.md` §5, ADR-009/012/013/014, `.claude/GOLDEN-PRINCIPLES.md`, шаблон
`apps/appointment-service`, FHIR R4 (`get_fhir_resource`: Encounter/ClinicalImpression/CarePlan search-params).
Изменения в shared-библиотеках: нет (`sharedChanges: []`; `libs/`, `package.json`, `infra/`, `frontend/` не тронуты).

## Проверки (DoD Standard)

| Проверка | Команда | Результат |
| --- | --- | --- |
| Unit | `npx nx test encounter-service --maxWorkers=2 --skip-nx-cache` | ✅ 10 suites, 86 tests passed |
| E2E | `npx nx e2e encounter-service --skip-nx-cache` | ✅ 3 suites, 23 tests passed (на `FakeHapi`, живой HAPI не использовался) |
| Lint | `npx nx lint encounter-service` | ✅ All files pass linting |
| Typecheck | `tsc --noEmit -p tsconfig.app.json` и `tsconfig.spec.json` (реальный бинарь `node_modules/typescript/bin/tsc`) | ✅ exit 0 / exit 0 |
| Шаблон | `diff` `project.json`, `jest*.ts`, `tsconfig*`, `.eslintrc.json`, `package.json`, `main.ts` с appointment-service (замена имени/порта) | ✅ идентичны. `app.module.ts` отличается (см. NT-5) |
| Стиль | grep `any` / `!`-assertion / `console` / `eslint-disable`; размеры файлов (макс. `encounters.service.ts`, 230 строк) | ✅ нарушений нет (`!:` — только definite assignment в DTO, как в других сервисах) |

## Summary

Сервис сделан добротно и по шаблону appointment/catalog-service. Все 8 маршрутов §7.1–7.7 + `/health`
присутствуют, коды/статусы совпадают со спекой (201/200 для 7.1, 200 для 7.3, `ENCOUNTER_STATE_INVALID` 409,
`INVALID_ICD10_CODE`/`TERMINOLOGY_NOT_FOUND` 422, `COMPARTMENT_VIOLATION` 403). Guard-стек глобальный
(`APP_GUARD`), `errorCode` только из `ERROR_CODES`, внешние входы валидируются (`class-validator`, `FhirIdPipe`,
`FHIR_ID_PATTERN` на `appointmentId`, id врача/пациента из токена проверяются как FHIR id перед подстановкой в
поиск), все параметры FHIR-поиска кодируются через `URLSearchParams`, инъекции в поиск я не нашёл.
Идентичность врача — fail closed (`fhirUser` не `PractitionerRole/{id}` → 403 до обращения к HAPI).
Компартмент пациента берётся только из токена; параметр `?patient=` не читается (проверено e2e).

Транзакция 7.3 корректна по R4: `PUT Encounter` с `If-Match` на прочитанную версию + `POST`
Condition/ClinicalImpression/CarePlan/Observation/ServiceRequest/MedicationRequest + 2 AuditEvent; ссылки между
новыми ресурсами через `urn:uuid`; каждое назначение ссылается на Encounter и основной Condition (BR-005);
UCUM-количество; `working → unconfirmed` (в R4 `condition-ver-status` нет `working`); `ClinicalImpression.status =
completed` допустимо в R4 (`in-progress | completed | entered-in-error`). HAPI-статусы 409/412 приводятся
`FhirClient` к 409, `commitTransaction` превращает их в `ENCOUNTER_STATE_INVALID`, публикация события идёт после
коммита. Параллельное завершение проверено e2e (ровно один 200, один 409, один набор ресурсов).

Критичных и мажорных дефектов в коде `apps/encounter-service/**` не найдено. Остались Minor (выравнивание
AuditEvent с шаблоном, строгость кодовых систем, нагрузка на HAPI при валидации терминологии, пробел в тестах
на `assertReadScope`) и Nit. Отдельно подтверждено расхождение с фронтендом, которое ломает сквозной сценарий
«открыть приём», но лежит вне owned paths (раздел «Вне области»).

| Severity | Кол-во |
| --- | --- |
| Critical | 0 |
| Major | 0 |
| Minor | 9 |
| Nit | 7 |

## Issues Found

### Critical (Must Fix)

Нет.

### Major (Should Fix)

Нет.

### Minor (Consider)

- [ ] **MN-1. AuditEvent не несёт `requestId` — не совпадает с актуальным шаблоном и журналом §9.4.**
  `apps/encounter-service/src/common/audit/audit-event.ts:23-41` (в `entity` нет BALP-сущности `XrequestId`),
  `encounters.service.ts:84-152` (id запроса не передаётся), `mappers/encounter-opening.mapper.ts:72-82`,
  `mappers/encounter-completion.mapper.ts:112-125`. Комментарий в `audit-event.ts:20-21` обещает «same shape as
  appointment-service», но appointment-service (рабочая копия) уже пишет `requestId` через `entity[type=XrequestId]`
  (`appointment-service/.../audit.ts:30-46`), и `analytics-service/.../audit-event.mapper.ts:69-84,115` читает его
  в `AuditEventDto.requestId` (API §9.4). Для всех событий приёма поле в журнале будет пустым, корреляция
  «запрос → аудит» (NFR-007) для M4 теряется. Контракт задачи: «follow appointment-service audit.ts».
  **Fix:** принимать `requestId` из `RequestWithRequestId` в контроллере, прокинуть в `AuditEventParams`, добавить
  `{ what: { identifier: { value } }, type: { system: 'https://profiles.ihe.net/ITI/BALP/CodeSystem/BasicAuditEntityType', code: 'XrequestId' } }`;
  тест на форму в `encounter-completion.mapper.spec.ts`.
- [ ] **MN-2. `codeSystem` у Observation и ServiceRequest принимает любую засеянную систему (МКБ-10, АТХ, UCUM).**
  `terminology/terminology-validator.service.ts:102-116`, `terminology/seeded-terminology.ts:16-22`,
  `mappers/encounter-completion.mapper.ts:43-52`, `dto/observation.dto.ts:6-9`, `dto/service-request.dto.ts:6-9`.
  `seededValueSetOf` проверяет лишь «система есть в seed», а не «система допустима для этого поля». Тело
  `observations[{codeSystem:'http://www.whocc.no/atc', code:'J01FA10', ...}]` проходит проверку, и Observation
  получает код АТХ; `serviceRequests` с кодом МКБ-10 — аналогично. Данные записываются в клиническую карту, BR-009
  говорит об НСИ-кодах. Опасность умеренная (вводит только врач), но это дешёвая защита целостности.
  **Fix:** `@IsIn([FHIR_BY.OBSERVATION_CODE_SYSTEM])` и `@IsIn([FHIR_BY.SERVICE_CODE_SYSTEM])` в DTO либо проверка
  допустимой системы по полю в `terminologyRefsOf`; тест «Observation с АТХ-кодом → 400/422».
- [ ] **MN-3. Валидация терминологии: до ~160 неkэшируемых GET на один приём и 400 от HAPI трактуется как «код неизвестен».**
  `terminology/terminology-validator.service.ts:14` (`NOT_FOUND_STATUSES` = 400/404/422), `:87-99`, `:102-116`,
  `:118-131`. Один `complete` с 20 диагнозами, 50 наблюдениями (код + единица), 20 услугами и 20 препаратами —
  до ~160 различных `$validate-code` (по 6 параллельно) без кэша, при rate-limit 120 req/мин на пользователя это
  до ~19 тыс. обращений к HAPI в минуту и заметная латентность 7.3 при тайм-ауте клиента 10 с. Seed — статический
  снапшот. Кроме того, `FhirClientError` документирует 400/422 от HAPI как «дефект нашего запроса» (→ 500), а здесь
  они маскируются под клиентскую ошибку 422 (при незагруженном seed врач получит «код МКБ-10 недействителен» для
  `J06.9`; сигнал только `warn` в логе).
  **Fix:** кэш в процессе с TTL (ключ `system|code`, как минимум для положительных ответов) либо один `$expand`
  на ValueSet и локальная проверка; оставить в `NOT_FOUND_STATUSES` только 404 (и 422 с «Unknown ValueSet»
  после проверки на живом HAPI), 400 — пробрасывать; логировать `error`, если неизвестен весь ValueSet.
- [ ] **MN-4. Отображаемое название диагноза берётся от клиента и не сверяется с seed.**
  `dto/condition.dto.ts:14-17`, `mappers/clinical-resources.mapper.ts:71`, `encounters.service.ts:129,145-150`
  (`assertIcd10Codes` возвращает `void`, `display` ValueSet отбрасывается; для АТХ/НСИ/UCUM, наоборот,
  используется display от сервера терминологии, `:130`). В карте и в событии `encounter.completed.v1`
  (`diagnoses[].display`) может оказаться текст, не соответствующий коду (`J06.9` + «Перелом»). Спека объявляет
  `display` полем DTO, поэтому это не нарушение, а непоследовательность. **Fix:** `assertIcd10Codes` вернуть
  `TerminologyDisplays`, класть серверный display в `coding.display`, а текст врача — в `code.text`; событие
  формировать из серверного display.
- [ ] **MN-5. Нет теста на `assertReadScope` — единственный контроль scope для 7.4/7.5.**
  `common/access/scope-policy.ts:20-28`, вызовы `modules/history/history.controller.ts:39,52`. Для общих маршрутов
  пациента и персонала декоратор scope недоступен, и выбор `patient/*.read` / `user/*.read` по роли — самостоятельная
  проверка безопасности. Все тесты (`test/history.e2e-spec.ts`, `PATIENT`/`DOCTOR`/`ADMIN` в `app-harness.ts:59-76`)
  используют токены с полным набором scope; ветки «PATIENT только с `patient/*.write`», «DOCTOR с `patient/*.read`»,
  «DOCTOR только с `user/*.write`» не проверены, регресс (например замена `READ_SCOPE_BY_ROLE`) пройдёт зелёным.
  **Fix:** unit-спек `scope-policy.spec.ts` (3 роли × наличие/отсутствие scope → `FORBIDDEN_SCOPE`/`FORBIDDEN_ROLE`)
  и один e2e на `GET /patients/pat-1/history` с токеном без нужного scope.
- [ ] **MN-6. При совпавшем условном создании (гонка двойного открытия) в журнал попадает ложный AuditEvent(create).**
  `mappers/encounter-opening.mapper.ts:63-83`, `encounters.service.ts:187-200`. Транзакция всегда содержит
  `POST AuditEvent` на `urn:uuid` нового Encounter; если `ifNoneExist` совпал (`200`), HAPI подставит id уже
  существующего приёма, и аудит утверждает, что текущий пользователь его создал. Окно узкое (двойной клик),
  поэтому Minor. **Fix:** принять и задокументировать; либо писать audit отдельной записью после проверки
  `201` (теряется атомарность — решать осознанно).
- [ ] **MN-7. `sortOrder` по умолчанию `desc` расходится с API §0 (`asc`) и не внесён в список отклонений.**
  `common/paging/page-query.dto.ts:46-52` (комментарий в `:22-25` объясняет выбор, но `coder-m4-encounter-report.md`
  в «Отклонения и решения» его не содержит); `sortBy` из §0 не поддержан вовсе. Для клинической истории
  «новое первым» разумно, но отклонение должно быть записано в отчёт/спеку.
- [ ] **MN-8. Врач видит всю историю пациента, а не только свои приёмы, и достаточно одной `booked`-записи.**
  `modules/history/patient-access.service.ts:68-78` (доступ по общему Encounter **или** Appointment в статусах
  `booked/arrived/checked-in/fulfilled`), `modules/history/history.service.ts:23-36` (выдаются все `finished`
  Encounter пациента, включая приёмы других врачей). API §0: компартмент врача — «только свои Encounter/Appointment
  как участник». Модель «лечебной связи» принята в patient-service (`code-reviewer-patient-r1-report.md`), и 7.4
  по спеке открыт DOCTOR, поэтому не Major. Но пациент записью к любому врачу открывает ему диагнозы и
  рекомендации других специалистов. **Fix:** согласовать с владельцем продукта; варианты — для связи только через
  Appointment возвращать лишь приёмы самого врача (`participant=<roleRef>` в `historyOf`), полную историю — при
  общем Encounter; зафиксировать решение в spec.
- [ ] **MN-9. Сквозная проблема состояния: никто не переводит Appointment в `fulfilled`, запись остаётся `booked` после приёма.**
  `encounters.service.ts:219-229` (читает статус, не пишет), `specs/api-designer-spec.md:547` (статус `fulfilled` в
  `AppointmentResponseDto`), `libs/contracts/.../encounter-completed.event.ts` (нет `appointmentId`). После
  завершения приёма пациент может отменить запись (appointment-service освободит слот и опубликует
  `appointment.cancelled.v1`), врач — поставить no-show, а в журнале «Пациенты дня» остаётся «Открыть приём»
  (повторное открытие даст 409). Исполнитель верно не пишет Appointment (правило единственного владельца,
  architect §5). Исправление лежит вне owned paths: потребитель `encounter.completed.v1` в appointment-service
  (с добавлением `appointmentId` в событие — правка `libs/contracts`). Передать оркестратору как отдельную задачу;
  это же закрывает документированное окно гонки BR-008 (отчёт, отклонение 3).

### Nit

- [ ] **NT-1. Имена тестов без `when`** (GOLDEN-PRINCIPLES «should … when …») — 28 из 95: `encounters.service.spec.ts:55,60,70,129`,
  `encounter-completion.mapper.spec.ts:34,47,54,91`, `encounter-view.mapper.spec.ts:54,86`, `history.service.spec.ts:26`,
  `terminology-validator.service.spec.ts:33,58,65,72,80`, `prescriptions.service.spec.ts:84`,
  `encounters-open.service.spec.ts:69,157,165`, `patient-access.service.spec.ts:136`, `claims-identity.spec.ts:55`,
  `test/complete-encounter.e2e-spec.ts:117,126,134`, `test/history.e2e-spec.ts:99`, `test/jwt-perimeter.e2e-spec.ts:38,54`
  (имена из плана Task 14 в `encounters.service.spec.ts:55,70` можно оставить дословно).
- [ ] **NT-2. Булево поле без префикса `is/has`**: `OpenEncounterResult.created` (`dto/encounter-response.dto.ts:83-86`,
  `encounters.service.ts:184-198`) → `isCreated`.
- [ ] **NT-3. Сообщения `internal()` уходят клиенту.** `ProblemDetailsFilter` отдаёт `message` любого `HttpException`,
  в том числе 500: `encounters.service.ts:57-59,98,167,192` и `common/fhir/fhir-transaction.ts:44-47` содержат id
  Appointment/Encounter. Утечки данных нет (id пришёл от вызывающего), но противоречит принципу «500 не показывает
  внутренности» (`problem-details.filter.ts` комментарий). Достаточно короткого `detail` без id, а id — в `Logger.error`.
- [ ] **NT-4. 404 vs 403 раскрывает существование id приёма/записи.** `encounters.service.ts:86,161` (`fhir.read` →
  404 для несуществующего, 403 для чужого). Для пациентов решение №5 отчёта намеренно отдаёт 403; id в HAPI
  последовательные, врач может перебрать существование Appointment/Encounter. Согласовать единообразно
  (как в appointment-service — приемлемо, раз там так же).
- [ ] **NT-5. `HealthController` лежит в `app/` без unit-теста**, а у шаблона `modules/health/{health.controller,health.module}.ts`
  со спеком; отчёт утверждает, что `app.module.ts` идентичен appointment-service, на деле он отличается
  (`app.module.ts:21-22` вместо `HealthModule`). Поведение покрыто e2e (`jwt-perimeter.e2e-spec.ts:54`).
- [ ] **NT-6. `FakeHapi.$validate-code` смотрит только на `code`** (`test/fake-hapi.ts:98`), игнорируя `url` и `system`,
  и не покрыты e2e сценарии «двойное открытие» и «врач с общей записью без приёма». Unit-тесты сверяют точные
  параметры (`terminology-validator.service.spec.ts:20-24,39-43`), поэтому риск мал; живой прогон
  (`complete-encounter` против compose-HAPI) остаётся за оркестратором — обязателен перед закрытием M4, чтобы
  проверить `$validate-code` на `content: fragment`, `ifMatch` в транзакции и `urn:uuid` в `AuditEvent.entity`.
- [ ] **NT-7. Назначения со статусами `entered-in-error`/`cancelled` показываются пациенту наравне с действующими**
  (`modules/history/prescriptions.service.ts:55-61`, поле `status` отдаётся, но фронтенд его не использует).
  Сегодня сервис такие не создаёт; при появлении гасить `entered-in-error` на сервере (`status:not=entered-in-error`).

### Вне области (подтверждено чтением кода, не влияет на вердикт)

- **OOS-1. [frontend, сквозной сценарий сломан] Фронтенд не вызывает 7.1 и ходит в 7.2/7.3 с id записи.**
  `frontend/src/app/(doctor)/doctor/appointments/page.tsx:37` — ссылка `/encounters/${item.id}` (id **Appointment**),
  `components/doctor/encounter-view.tsx:11` → `GET /api/v1/encounters/{appointmentId}`,
  `components/doctor/encounter-complete-form.tsx:287` → `POST …/{appointmentId}/complete`; `POST /api/v1/encounters`
  во `frontend/src` не вызывается нигде (grep). По этому id сервис честно отвечает `404 NOT_FOUND`. Расхождение
  зафиксировано исполнителем (frontendMismatches); подтверждаю: до правки фронтенда врач не сможет ни открыть, ни
  оформить приём из UI. **Fix (frontend):** по клику «Открыть приём» вызвать `POST /api/v1/encounters {appointmentId}`
  (идемпотентно, 201/200) и перейти на `/encounters/{response.id}`.
- **OOS-2. [frontend]** `app/(patient)/prescriptions/page.tsx:8,22-24` типизирует элемент как `{atcCode, dosageText}`;
  элементы `kind: 'service'` (спека §7.5 включает ServiceRequest) отрисуются с пустым АТХ-чипом. Нужно ветвление по `kind`.
- **OOS-3. [libs/common]** `JwtAuthGuard` не превращает ошибки `jose` в 401 (поддельный/просроченный токен → 500
  `INTERNAL`); найдено ранее в отчётах patient-/analytics-service, в e2e encounter-service проверен только случай
  «без токена».

### Positive Notes

- **Безопасность:** все эндпоинты закрыты `RequiresRoles` + `RequiresScopes` или `assertReadScope`; доступ врача к
  приёму проверяется по `Encounter.participant`/`Appointment.participant` **до** раскрытия статуса (403 раньше 409);
  доступ к карте пациента — поиск `_count=1` плюс перепроверка в процессе (тип, статус, пациент, роль), «не смогли
  доказать — 403»; неизвестный пациент у врача → 403 без утечки существования; id в путях и в `appointmentId`
  ограничены грамматикой FHIR id, id из одних точек отвергаются; секретов в коде нет.
- **Конкурентность:** одна `transaction` с `If-Match` и условный `POST` с `ifNoneExist` вместо блокировок; replay
  и параллельная отправка дают 409 и ноль частичных записей; событие публикуется только после коммита, сбой брокера
  логируется с контекстом (не молча), решение объяснено в комментарии.
- **FHIR R4:** корректные ссылки (`Encounter.diagnosis` с rank, `ClinicalImpression.finding/investigation`,
  `CarePlan.addresses`, `reasonReference` на Condition), UCUM-количество, `statusHistory`, обратный маппинг
  `unconfirmed → working`, поисковые параметры (`participant`, `appointment`, `patient`, `date`, `:encounter`
  `_revinclude`) сверены со спецификацией R4.
- **Постраничность 7.5:** конкатенация двух типизированных поисков с точными смещениями (два вызова на страницу,
  без неограниченного скана), счётчик через `_summary=count`; граничные случаи покрыты `prescriptions.service.spec.ts`.
- **Тесты:** 86 unit + 23 e2e поверх настоящего `AppModule` (guard-стек, ValidationPipe, problem+json) и
  атомарного `FakeHapi`; e2e доказывает именно поведение (шесть типов ресурсов в одном Bundle, ссылки на Condition
  и Encounter, ровно один победитель гонки, 422 до любой записи).
- Отчёт исполнителя честен: отклонения (id вместо UUID, 200 при повторном открытии, scope по роли, `unconfirmed`,
  Nest `Logger` вместо pino, окно гонки BR-008) обоснованы, расхождения с фронтендом найдены самим исполнителем.

## Вердикт

**approve** — критичных и мажорных замечаний в `apps/encounter-service/**` нет. Minor MN-1…MN-5 желательно закрыть
малой правкой в следующем раунде (особенно MN-1 — выравнивание с актуальным AuditEvent шаблона и MN-5 — тест на
контроль scope). MN-8 и MN-9 требуют решения владельца продукта/оркестратора. Одобрение относится к сервису; сквозной
сценарий «открыть приём из UI» блокирует OOS-1 (frontend) и должен быть исправлен до приёмки M4.

## Context Summary

Ревью encounter-service (Task 14, M4), раунд 1: 0 critical, 0 major, 9 minor, 7 nit; unit 86/86, e2e 23/23,
lint и tsc (app + spec) зелёные. Сервис соответствует §7.1–7.7, безопасен (fail-closed личность врача, компартмент
по токену, перепроверка доступа в процессе) и корректен по FHIR R4 (атомарная `If-Match`-транзакция, события после
коммита). Замечания: AuditEvent без `requestId` (не как в шаблоне), слишком мягкая проверка `codeSystem`, нагрузка на
HAPI и 400→«неизвестный код» в терминологии, нет теста на `assertReadScope`, Appointment не переходит в `fulfilled`.
Вне области подтверждено: фронтенд ходит в 7.2/7.3 с id записи и не вызывает 7.1.

## Next Steps

- **Next by flow:** `/test-generator [encounter-service M4 r1: unit на assertReadScope (роль × scope), e2e на двойное открытие, MN-2 (Observation с АТХ-кодом), живой прогон complete-encounter против HAPI]`
- **Альтернативы:**
  - `/coder [encounter-service: MN-1 requestId в AuditEvent, MN-2 допустимые codeSystem, MN-3 кэш/обработка 400 в терминологии, MN-4 display диагноза из ValueSet по code-reviewer-encounter-c1-report.md]`
  - `/finishing-branch` — после решения по OOS-1 (frontend) и MN-8/MN-9.
