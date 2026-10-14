# coder-m4-encounter-report.md

**Skill:** coder (backend) · **Задача плана:** Task 14 (M4) — `encounter-service` (FR-007, FR-010…FR-014,
BR-003/004/005/008/009) · **API:** `specs/api-designer-spec.md` §7.1–7.7 · **Порт:** 3007 · **Дата:** 2026-10-14

> Возобновлённый прогон: предыдущая попытка прервалась по лимиту. Её незакоммиченная работа в
> `apps/encounter-service/**` (все файлы untracked) проверена и сохранена: она уже реализовала §7.1–7.7,
> проходила `tsc`, unit- и e2e-тесты. Дубликатов модулей нет. В этом прогоне усилена проверка доступа врача
> к карте пациента (см. «Что изменено в этом прогоне») и составлен отчёт. Общие файлы не менялись.

## Что реализовано

| # | Эндпоинт | Доступ | Реализация |
| --- | --- | --- | --- |
| 7.1 | `POST /api/v1/encounters` `{appointmentId}` | `DOCTOR` + `user/*.write` | `EncountersService.open()`: врач (`fhirUser = PractitionerRole/{id}`) должен быть участником Appointment, затем статус `booked` (BR-008). Один `transaction`-Bundle: условный `POST Encounter` (`ifNoneExist: appointment=Appointment/{id}`) + `AuditEvent`. `201` при создании, `200` при повторе. |
| 7.2 | `GET /api/v1/encounters/{id}` | `DOCTOR` (участник) / `ADMIN`, `user/*.read` | `findOne()`: один поиск `Encounter?_id=…&_revinclude=` (Condition, ClinicalImpression, CarePlan, Observation, ServiceRequest, MedicationRequest). Ответ содержит клиническое содержимое в именах полей `CompleteEncounterDto`. |
| 7.3 | `POST /api/v1/encounters/{id}/complete` | `DOCTOR` (участник) + `user/*.write` | `complete()`: участник → статус `in-progress` → Appointment всё ещё `booked` → МКБ-10 → ATC/UCUM/НСИ → один атомарный `transaction`-Bundle → публикация `encounter.completed.v1`. |
| 7.4 | `GET /api/v1/patients/{id}/history` | владелец-`PATIENT` / `DOCTOR`, делящий с пациентом Encounter или Appointment / `ADMIN` | `PatientAccessService.resolveReadablePatient()` → `HistoryService.historyOf()`. |
| 7.5 | `GET /api/v1/patients/{id}/prescriptions` | как 7.4 | `PrescriptionsService.prescriptionsOf()`. |
| 7.6 | `GET /api/v1/me/history` | `PATIENT` + `patient/*.read` | пациент только из claim `patient` токена (ADR-013); query `patient` не читается. |
| 7.7 | `GET /api/v1/me/prescriptions` | `PATIENT` + `patient/*.read` | то же. |
| — | `GET /health` | `@Public()` | liveness для `HEALTH_PATH` из `docker-compose.yml`. |

Маршруты в Traefik (`encounter-me` priority 40, `encounter-patient-history` priority 60, `/api/v1/encounters`) уже
описаны в `infra/traefik/dynamic.yml`; `docker-compose.yml` содержит сервис `encounter-service` (порт 3007).

### Структура `apps/encounter-service`

```
project.json, jest*.ts, tsconfig*, .eslintrc.json, package.json   идентичны appointment-service (diff с заменой имени)
src/main.ts                       Redis rate-limit store, глобальный ValidationPipe, порт 3007
src/app/app.module.ts             APP_GUARD: JwtAuthGuard → ScopeGuard → RoleGuard → RateLimitGuard; ProblemDetailsFilter; RequestIdMiddleware
src/app/health.controller.ts      GET /health (@Public)
src/common/access/                claims-identity (patient/PractitionerRole из токена, FHIR_ID_PATTERN), fhir-id.pipe, scope-policy
src/common/audit/audit-event.ts   AuditEvent той же формы, что в appointment-service (ADR-014)
src/common/fhir/                  fhir-transaction (локальная копия паттерна appointment-service + ifNoneExist), fhir-read, fhir-reference, fhir-search, fhir.module
src/common/paging/                PageQueryDto (page/pageSize/sortOrder, MAX_PAGE=1000), конверт PaginatedResponseDto
src/common/validators/            @MatchesICD10, @MatchesATC (грамматика из libs/terminology)
src/common/concurrency.ts         mapWithConcurrency (не больше 6 одновременных lookup-ов терминологии)
src/modules/encounters/           controller, service, encounter-access, dto/ (7 файлов), mappers/ (completion, clinical-resources, opening, view, clinical-view)
src/modules/history/              controller, history.service, prescriptions.service, patient-access.service, dto/, mappers/
src/modules/terminology/          TerminologyValidatorService ($validate-code по seeded ValueSet), seeded-terminology
src/modules/events/               EncounterPublisherService (encounter.completed.v1; сбой брокера логируется)
test/                             jwt-perimeter, complete-encounter, history (e2e), app-harness, fake-hapi, test-tokens, e2e-env
```

### Транзакция 7.3 (одна на всё)

`transaction`-Bundle, порядок записей:

1. `PUT Encounter/{id}` с `If-Match: W/"<versionId>"` — `status=finished`, `period.end`, `statusHistory`,
   `diagnosis[]` (rank 1 — основной диагноз). Повторное или параллельное завершение читает ту же версию, HAPI
   отвечает 412 на второй Bundle, весь Bundle откатывается, сервис отдаёт `409 ENCOUNTER_STATE_INVALID`.
2. `POST Condition[]` (`category=encounter-diagnosis`, код МКБ-10 в `https://fhir.by/CodeSystem/InternClassificDiseases10`,
   `verificationStatus`: `working → unconfirmed` по R4 `condition-ver-status`), `fullUrl = urn:uuid:…`.
3. `POST ClinicalImpression` (`summary`, `finding[].itemReference → Condition`, `investigation[].item → Observation`).
4. `POST CarePlan` (`description` = рекомендации, `addresses → Condition[]`).
5. `POST Observation[]` (`valueQuantity` с UCUM `http://unitsofmeasure.org`).
6. `POST ServiceRequest[]` и `POST MedicationRequest[]`: каждый ссылается на `Encounter/{id}` **и** на основной
   `Condition` через `reasonReference` (BR-005); `MedicationRequest.medicationCodeableConcept` — ATC (BR-009).
7. Два `AuditEvent`: `update` (Encounter) и `create` (клиническая запись). Журнал аналитики ключуется по первой
   сущности AuditEvent, поэтому это две записи, а не одна (ADR-014).

После коммита `EncounterPublisherService.publishCompleted()` отправляет `encounter.completed.v1` в
`medical.events`. Ошибка брокера логируется и не пробрасывается: ответ 5xx на уже закоммиченное завершение
спровоцировал бы повтор, который может закончиться только 409. Outbox нет (как и в M3).

### Терминологическая проверка (до записи)

1. Грамматика на DTO: `@MatchesICD10`, `@MatchesATC` (`libs/terminology`) → `400 VALIDATION_ERROR`.
2. `ValueSet/$validate-code` с canonical `https://fhir.by/ValueSet/...` (`url` + `system` + `code`), максимум 6
   параллельных запросов, дубликаты запрашиваются один раз:
   - МКБ-10 → `InternClassificDiseases10`; промах → `422 INVALID_ICD10_CODE`. Членство строгое: засеянная
     категория `J06` не пропускает незасеянную подкатегорию.
   - ATC → `atc`, UCUM → `ucum-units` (закрытый список, BR-009), НСИ-услуги → `nsi-services`, НСИ-исследования →
     `nsi-observations`; промах или система вне seed → `422 TERMINOLOGY_NOT_FOUND`. Свободный текст вместо UCUM
     (`горсть`) отклоняется без обращения к HAPI.
   - Ответ HAPI 400/404/422 на `$validate-code` трактуется как «код неизвестен»; недоступность сервера
     терминологии (5xx, таймаут) пробрасывается как 502/504, а не маскируется под ошибку клиента.
3. Полученные `display` кладутся в `Observation`/`ServiceRequest`/`MedicationRequest.code.coding.display`.

## Что изменено в этом прогоне

1. **`PatientAccessService` (API 7.4/7.5): перепроверка найденного ресурса в процессе.** Раньше связь «врач — пациент»
   определялась по `Bundle.total` ответа `_summary=count`: если бы HAPI проигнорировал параметр поиска, `total`
   расширил бы доступ. Теперь ищется один ресурс (`_count=1`), и код сам проверяет тип, статус, пациента и
   `PractitionerRole` врача (`isCareEncounter`, `isCareAppointment`), иначе fail closed. Тот же приём принят в
   `patient-service`. Для Encounter добавлен фильтр статусов `planned…finished` (`cancelled` и `entered-in-error`
   доступа не дают), как в `patient-service`. HAPI 404 на поиск теперь пишется в лог с контекстом
   (`resourceType`, `upstreamStatus`), поведение (403 без утечки существования id) не изменилось.
2. Тесты: в `patient-access.service.spec.ts` добавлены 7 проверок (чужой пациент, чужой врач, `entered-in-error`,
   Appointment в `cancelled`/`noshow`/`proposed`, Appointment другого врача); существующие сверяют новые параметры
   запроса. TDD: 🔴 9 failed → 🟢 22 passed на `modules/history`.
3. Отчёт `tasks/TASK-001/coder-m4-encounter-report.md`.

## Отклонения и решения

1. **7.1: повторное открытие.** Приём на booked-запись один. Повтор открытия `in-progress` приёма возвращает его
   (`200`, `created=false`), первый вызов отвечает `201`. Если у записи уже есть `finished`-приём, ответ
   `409 ENCOUNTER_STATE_INVALID`. Идемпотентный повтор удобен фронтенду (кнопка «Открыть приём» может нажиматься
   дважды), а гонка двух врачей/вкладок решается условным созданием (`ifNoneExist`) внутри транзакции:
   дубликата не будет, второй вызов получает `200` с существующим приёмом.
2. **`appointmentId` — FHIR id, а не UUID.** Спека типизирует его как UUID, но HAPI выдаёт POST-ресурсам свои id
   (так же решено в `appointment-service`, `CreateAppointmentDto`). Принимается `[A-Za-z0-9-.]{1,64}`, id из одних
   точек отвергается (`.`/`..` сворачиваются в базовый URL).
3. **Оптимистичная блокировка вместо pessimistic** (принятое отклонение M3): `If-Match` на версии Encounter внутри
   `transaction`-Bundle. Appointment в транзакции не пишется (правило единственного владельца), поэтому
   состояние записи (BR-008) проверяется чтением перед транзакцией, а не `If-Match`. Окно гонки «отмена записи
   между чтением и коммитом» остаётся; отмена и завершение приёма — действия разных ролей над одной записью, и в
   худшем случае отменённая запись получит завершённый приём. Закрыть окно можно только записью в Appointment.
4. **PATIENT в 7.4/7.5.** `@RequiresScopes` требует все перечисленные scope, а маршрут общий для пациента и
   персонала, поэтому scope выбирается по роли в `assertReadScope()` (приём `appointment-service/scope-policy.ts`):
   `PATIENT → patient/*.read`, `DOCTOR/ADMIN → user/*.read`. Чужой id у пациента → `403 COMPARTMENT_VIOLATION`.
5. **Неизвестный пациент у врача → 403, а не 404** (защита от перебора id): HAPI на reference-поиск по неизвестному
   client-assigned id отвечает 404, и это трактуется как «связи нет».
6. **7.5: список назначений = конкатенация двух поисков.** HAPI не ищет по двум типам ресурсов одним запросом.
   Сначала `MedicationRequest` (по `authoredon`), затем `ServiceRequest` (по `authored`); срез страницы считается
   точными смещениями по `Bundle.total` лекарств: два вызова FHIR на страницу, без неограниченных сканов.
   Элементы — объединение с дискриминатором `kind: 'medication' | 'service'`.
7. **Статус `working`.** В R4 такого значения `condition-ver-status` нет; рабочий диагноз без достаточных
   оснований — это `unconfirmed`. Обратный маппинг применяется при чтении (7.2/7.4).
8. **Нет AuditEvent на GET-эндпоинтах** (API §0 / ADR-014: аудит на create/update/delete).
9. **`nestjs-pino`, `@nestjs/swagger`, `@nestjs/terminus` не установлены**, ни один сервис их не использует:
   логирование через Nest `Logger`, DTO без `@ApiProperty` (как в остальных сервисах).
10. **Заголовок `Idempotency-Key`** на 7.3 не читается: естественная идемпотентность даёт `If-Match`, повтор →
    `409 ENCOUNTER_STATE_INVALID`.

## Расхождения с фронтендом (`frontend/` не менялся)

1. **Критичное: фронтенд не вызывает 7.1.** Ссылка «Открыть приём» в `src/app/(doctor)/doctor/appointments/page.tsx`
   ведёт на `/encounters/{item.id}`, где `item.id` — id **записи** (Appointment). `EncounterView` затем вызывает
   `GET /api/v1/encounters/{appointmentId}` и `POST …/{appointmentId}/complete`, а API ожидает id **приёма**
   (Encounter), созданного через `POST /api/v1/encounters {appointmentId}`. Следование спеке: по этому id
   сервис ответит `404 NOT_FOUND`. Исправление на стороне фронтенда: по клику вызвать `POST /api/v1/encounters`
   (идемпотентно, `201`/`200`) и перейти на `/encounters/{response.id}`.
2. **`/me/prescriptions` и `/patients/{id}/prescriptions` возвращают и `ServiceRequest`.** Тип `Prescription` во
   фронтенде содержит только `atcCode`/`dosageText`/`note?`. Элементы `kind: 'service'` не имеют `atcCode` и
   отрисуются с пустым ATC-чипом. Спека (§7.5) прямо включает `ServiceRequest`; фронтенду нужно ветвление по `kind`.
3. `EncounterView` читает из 7.2 только `status`; клиническое содержимое (`summary`, `diagnoses[]`,
   `observations[]`, `serviceRequests[]`, `medicationRequests[]`, `recommendations`) сервис отдаёт в именах полей
   `CompleteEncounterDto`, так что read-only форму можно заполнить напрямую.
4. История (`{id, date, diagnosis}`) и форма `completeEncounterSchema` совместимы с DTO (проверены имена полей,
   границы длин, `verificationStatus`). UCUM-единицы фронтенда (`Cel, mg, g, mL, mmol/L, mg/dL`) есть в seed.

## Найдено, но не изменено

- Общий `JwtAuthGuard` (`libs/common`) не превращает ошибки `jose` в 401 (отмечено в отчёте `patient-service`);
  периметр `jwt-perimeter.e2e-spec.ts` проверяет 401 для запроса без токена и для `/health`.
- Живой стек не запускался: e2e работают на `FakeHapi` (атомарные транзакции с `If-Match`, условное создание,
  `urn:uuid`, `_revinclude`, `$validate-code` по фиксированному набору кодов). Живая версия
  `complete-encounter` против HAPI добавляется оркестратором.

## Verification evidence (DOD Standard)

| Проверка | Команда | Результат |
| --- | --- | --- |
| Unit | `npx nx test encounter-service --maxWorkers=2 --skip-nx-cache` | ✅ `Test Suites: 10 passed, 10 total` · `Tests: 86 passed, 86 total` |
| E2E | `npx nx e2e encounter-service --skip-nx-cache` | ✅ `Test Suites: 3 passed, 3 total` · `Tests: 23 passed, 23 total` |
| Lint | `npx nx lint encounter-service --skip-nx-cache` | ✅ `All files pass linting` |
| Typecheck | `npx tsc --noEmit -p apps/encounter-service/tsconfig.app.json` и `…/tsconfig.spec.json` | ✅ exit 0 / exit 0 |
| Build | `npx nx build encounter-service --skip-nx-cache` | ✅ `Successfully ran target build for project encounter-service and 6 tasks it depends on` |
| Шаблон | `diff` `project.json`, `jest*.ts`, `tsconfig*`, `.eslintrc.json`, `main.ts`, `app.module.ts` с appointment-service | ✅ идентичны (с заменой имени) |
| Стиль | AST-проверка: файлы ≤ 300 строк, функции ≤ 30 строк; grep `any` / `!` | ✅ нарушений нет (макс. файл `encounters.service.ts`, 230 строк) |

Замечание: первый запуск `nx build` в этой сессии упал с `Cannot find module '@medcenter/common'` и был помечен
Nx как flaky. Причина — параллельные агенты одновременно пересобирают общие библиотеки в `dist/`. Повторный запуск
собрал сервис и 6 зависимых библиотек без ошибок (запуск выше).

E2E поднимает настоящий `AppModule` (guard-стек, `ValidationPipe`, problem+json-фильтр) над `FakeHapi` и
записывающим издателем событий; JWT подписываются локальным RS256-издателем с JWKS.

## Покрытие тестами

- `modules/encounters/encounters.service.spec.ts` (тесты плана Task 14): повторное завершение → `ENCOUNTER_STATE_INVALID`;
  код вне seed МКБ-10 → `INVALID_ICD10_CODE`; ATC вне seed → `TERMINOLOGY_NOT_FOUND` без записи; назначения
  ссылаются на Encounter и Condition; одна `If-Match`-транзакция; проигранная гонка → 409 и ничего не
  публикуется; публикация `encounter.completed`; не участник → 403 до раскрытия статуса; no-show записи → 409.
- `encounters-open.service.spec.ts`: открытие, не-booked запись, не участник, токен без `PractitionerRole`,
  повтор, гонка условного создания, удалённая услуга, `finished`-приём, чтение 7.2 (врач/чужой врач/ADMIN/404).
- `mappers/*.spec.ts`: R4-маппинг завершения (UCUM, ATC display, `unconfirmed`, закрытие периода и ссылки на диагнозы, два AuditEvent,
  `investigation` в ClinicalImpression), ранжирование диагнозов по `Encounter.diagnosis.rank`, представление приёма.
- `terminology-validator.service.spec.ts`: ICD-10/ATC/UCUM/НСИ, 404 как неизвестный код, проброс 5xx, дедупликация.
- `history/*.spec.ts`: `HistoryService`, `PrescriptionsService` (смещения между двумя типами), `PatientAccessService`
  (16 тестов, включая перепроверку в процессе), `claims-identity.spec.ts`, `encounter-publisher.service.spec.ts`.
- e2e: `jwt-perimeter` (401, публичный `/health`), `complete-encounter` (J06.9 / 36.6 Cel / J01FA10: шесть типов
  ресурсов в одной транзакции, публикация события, replay → 409, две параллельные попытки → ровно одна выигрывает,
  422/400/403, чтение 7.2), `history` (компартмент по токену, игнорирование `?patient=`, врач с общим Encounter,
  чужой врач → 403, ADMIN, пагинация, 400 для id из точек и `pageSize>100`).
