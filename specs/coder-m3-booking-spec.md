# coder-m3-booking-spec.md

Живая спецификация M3 (Booking, concurrency-critical). Источник — план `tasks/TASK-001/writing-plans-plan.md` §M3
(задачи 12–13); архитектурное решение — ADR-012 в `specs/architect-architecture.md`; контракт API — §6 и §8
`specs/api-designer-spec.md`.

## 1. Библиотеки

### `libs/messaging` (`@medcenter/messaging`)
- `EVENT_PUBLISHER` + `AmqpEventPublisher` — публикация в topic-exchange `medical.events` через confirm-канал
  (`amqplib`); `publish` резолвится только после подтверждения брокером. Соединение открывается лениво, при сбое
  переподключение на следующей публикации. `RABBITMQ_URL` обязателен (падение на старте, не на первом событии).
- `bindQueueWithDlq(channel, queue, routingKey)` — очередь + `<queue>.dlq`, dead-letter через пустой exchange.

### `libs/common` — `patient-compartment.ts`
- `claimsOf(request)`, `requirePatientRef(claims)` — общие для сервисов; компартмент берётся только из токена (ADR-013).

### `libs/fhir-mappers` — `appointment.mapper.ts`
- Исправлено: участники (`patientId`, `practitionerRoleId`, `serviceId`, `doctorId`), `cancelReason` из
  `cancelationReason.text` (R4 — CodeableConcept), `slotId` из `slot[0]`.

## 2. `apps/appointment-service` (порт 3005, FR-004/005/006)

| Метод | Путь | Доступ | Статус |
| --- | --- | --- | --- |
| `POST` | `/api/v1/appointments` (+ `Idempotency-Key`) | `PATIENT` + `patient/*.write` | 201 |
| `POST` | `/api/v1/appointments/{id}/cancel` | `PATIENT` (владелец) или `ADMIN` | 200 |
| `POST` | `/api/v1/doctor/appointments/{id}/noshow` | `DOCTOR` + `user/*.write`, **участник-практик** (см. §2a) | 200 |

### 2a. Ownership no-show (API §6.6, FR-006)
- Врач помечает неявку только если его `fhirUser` (`PractitionerRole/{id}`) совпадает с practitioner-участником записи.
  Проверка идёт **до** проверки статуса, чтобы не раскрывать состояние чужой записи (`403 COMPARTMENT_VIOLATION`).
- Fail-closed: токен без `fhirUser` или с ссылкой не на `PractitionerRole/` отклоняется.
- **Зависимость от auth-service:** claim `fhirUser` сейчас в токен не выставляется (token path не читает
  `ExternalLink`). Пока auth не выдаёт `fhirUser = PractitionerRole/{id}` из `external_link`, no-show недоступен
  никому, кроме администрирования. Это сознательный отказ по безопасности; изменение — в auth-service (отдельная задача).

Не реализованы в M3: `GET /appointments` (6.2), `GET /appointments/{id}` (6.3), `GET /doctor/appointments` (6.5).

### Транзакция бронирования (ADR-012, порядок фиксирован)
1. Читаем `Slot`; `status != free` → `409 SLOT_CONFLICT`.
2. Читаем `Schedule` (практик-роль, услуга); `serviceId` из запроса должен совпасть с расписанием.
3. Одним `transaction`-Bundle: `PUT Slot` (`status=busy`, **`If-Match: W/"<versionId>"`**), `POST Appointment`
   (`urn:uuid`, участники Patient / PractitionerRole / HealthcareService), `POST AuditEvent` (ADR-014).
4. HAPI откатывает весь Bundle при несовпадении версии (412) → `409 SLOT_CONFLICT` (единственный сценарий гонки).
5. После коммита — `appointment.booked.v1`.

Отмена и no-show идут тем же путём: `PUT Appointment` и `PUT Slot` (отмена → `free`) с `If-Match`. Повторная
отмена → `409 APPOINTMENT_NOT_CANCELLABLE`; чужой пациент → `403 COMPARTMENT_VIOLATION`.

### Идемпотентность
`Idempotency-Key` (UUID) → Redis `idempotency:{sub}:{key}`, TTL 24 ч, кэшируется только успешный ответ.
Вместе с ответом хранится SHA-256 отпечаток тела запроса (ключи отсортированы). Повтор ключа с другим телом →
`409 CONFLICT`, а не тихий replay чужого ответа.

## 3. `apps/notification-service` (порт 3006, FR-008)

- Потребитель: 4 очереди `notification.{appointment-booked|appointment-cancelled|encounter-completed|patient-registered}`,
  каждая с DLQ. `ack` после записи `Communication(status=in-progress)`; при сбое `nack` без requeue → DLQ.
- Дедупликация по `eventId`: Redis `notification:event:{eventId}`, TTL 7 дней; при сбое записи claim снимается.
- Дубликат, пришедший пока первая копия ещё пишется, переотправляется в `<queue>.retry` (TTL 5 с, dead-letter обратно
  в `<queue>`), исходное сообщение подтверждается. Немедленного requeue нет: он крутился бы в цикле до конца lease.
- **Детерминированная запись:** `Communication.id` = UUID-shaped SHA-256 от `eventId`; запись — `PUT` по этому id,
  и только если ресурс ещё не существует (`GET` → 404). Повторная доставка не перезаписывает прочитанное уведомление,
  даже если Redis-ключ дедупликации утрачен.
- **Переподключение:** цикл — при `error`/`close` соединения ожидание 5 с и повторное подключение с повторной
  привязкой очередей. Ошибка канала закрывает соединение (инициирует переподключение).
- **Без необработанных rejection:** все фоновые promise имеют обработчик; `ack`/`nack` на закрытом канале
  логируются, а не превращаются в unhandled rejection (нерешённое сообщение брокер переотправит).
  Отменённый брокером consumer закрывает соединение, чтобы цикл переподключился.
- `patient.registered.v1` содержит email — в `Communication` он не попадает (тест).
- Пациентские endpoints: `GET /api/v1/notifications` (8.1), `GET /api/v1/notifications/unread-count` (8.2),
  `POST /api/v1/notifications/{id}/read` (8.3). `unread` ⇔ `status=in-progress`, прочитано ⇔ `completed`.
- `CONSUMER_ENABLED=false` отключает потребителя (используется e2e).

## 4. Отклонения от плана

1. **Pessimistic lock → optimistic CAS.** HAPI REST не даёт row-lock и `transaction()`-метода в `FhirClient`.
   Эквивалент: `If-Match` на версии `Slot` внутри атомарного `transaction`-Bundle (`fhir.batch`). Гонка даёт
   ровно один 201 и один 409 `SLOT_CONFLICT`. ADR-012 формулировку «пессимистичная блокировка» стоит уточнить.
2. **Порядок «lock → verify → create → busy → publish → audit»** сохранён по смыслу, но атомарность обеспечивает
   Bundle, а не последовательность вызовов: при сбое Appointment не остаётся «висящего» занятого слота.
3. **Публикация через outbox (ADR-021).** Событие записывается `Basic`-ом в той же транзакции Bundle, что и бронь/отмена,
   а публикует его `outbox-relay`; прежняя публикация после коммита (и потеря события при сбое брокера) удалена.
   Потребитель (notification-service) при этом не теряет и не дублирует записи — см. §3.
4. **Идемпотентность и гонка.** Параллельный повтор с тем же ключом, пока первый запрос ещё не закэширован,
   получит `409 SLOT_CONFLICT`, а не исходный ответ (кэш пишется после успеха).
5. **Врач (no-show):** закрыто в §2a (участник-практик, fail-closed). Остаётся зависимость от выдачи `fhirUser` в auth-service.
6. **Не сделано:** `booking-concurrency.e2e-spec.ts` (требует живой HAPI — в CI с docker-стеком); эндпоинты 6.2/6.3/6.5;
   email-адаптер уведомлений (A-3); `patient.registered`-очередь — только потребитель, без источника события.
7. `Appointment.created` — дата (R4 `date`), не `dateTime`.
8. Новая зависимость: `amqplib` (+ `@types/amqplib`), версии `^0.10.8`.

## 5. Проверки (на момент закрытия M3)

- `npx nx run-many -t test --all` — 12 проектов зелёные; `lint --all` — 12 зелёные; `build --all` — 12 зелёные.
- Новые: appointment-service 18 unit-тестов (в т.ч. 3 на доступ к no-show), notification-service 9 (в т.ч. переподключение,
  ошибка канала, nack с исключением), libs/messaging 5 (+ e2e perimeter ×2 зелёные,
  запуск с `--forceExit` из-за открытых Redis-соединений — как и в catalog-service).
