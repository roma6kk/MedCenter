# Code Reviewer — M2 diff (libs/fhir, libs/fhir-mappers, libs/terminology + catalog-service, practitioner-service)

Дата: 2026-10-07. Ревью нераскоммиченного M2-диффа (Task 8–10 из `tasks/TASK-002/implementation-plan.md`).
Категории: архитектура, качество, TypeScript, безопасность, производительность, тесты.

## Проверки (Pre-Completion Verification)

| Проверка | Результат |
|---|---|
| `nx run-many --target=lint` (5 проектов) | ✅ exit 0, все прошли |
| `nx run-many --target=test` (unit, 5 проектов) | ✅ 13 passed / 0 failed |
| `nx run-many --target=build` (5 проектов) | ✅ exit 0 |
| `npm run typecheck` (root) | ✅ exit 0 |
| Naming convention (`code-reviewer-` для артефактов) | ✅ этот отчёт |

## Summary

Структура диффа соответствует плану: три узкие библиотеки, два сервиса с одинаковым
скелетом (глобальный guard-стек через `APP_GUARD`, `RequestIdMiddleware`, глобальный
`ValidationPipe`, `ProblemDetailsFilter`), FHIR-клиент за токеном `FHIR_CLIENT`,
детерминированные DTO с class-validator. Линт, юнит-тесты и сборка зелёные.

Однако **три находки блокируют M2-гейт** («doctors/services/slots queryable via Redis
cache · slot generation idempotent & non-duplicating»): Redis никогда не подключается,
детерминированный id слота невалиден для FHIR, а инвалидация кэша удаляет несуществующие
ключи. Плюс два «молчаливых» фильтра, которые принимаются, но игнорируются.

## Issues Found

### Critical (Must Fix)

- [ ] **Redis-кэш фактически не подключён** — [redis-cache.service.ts:41](apps/catalog-service/src/modules/cache/redis-cache.service.ts#L41). `CacheModule` инжектит `@Optional() store?: CacheStore` без токена; интерфейс не имеет DI-метаданных, а реализация `CacheStore` на ioredis в репозитории отсутствует вовсе (`grep ioredis|CACHE_STORE` — только комментарии). Сервис навсегда в режиме «always miss»: NFR-005 (slot search < 500 ms через Redis) и M2-гейт «queryable via Redis cache» не выполняются. Нужен провайдер `{ provide: 'CACHE_STORE', useFactory }` на ioredis + привязка в `CacheModule`.

- [ ] **Детерминированный id слота невалиден для FHIR R4** — [slot-generator.service.ts:154-156](apps/catalog-service/src/modules/schedules/slot-generator.service.ts#L154-L156). `` `${scheduleId}-${start}` `` даёт id вида `sched-9-2026-11-02T09:00:00.000Z`: символ `:` запрещён паттерном FHIR id `[A-Za-z0-9\-\.]{1,64}` — реальный HAPI отклонит каждый `create` с валидационной ошибкой, генерация не работает end-to-end. Хэшировать (например, SHA-256 от `scheduleId+start`, обрезать до 64) вместо конкатенации.

- [ ] **Инвалидация кэша удаляет префикс, а контракт — точные ключи** — [schedules.service.ts:71](apps/catalog-service/src/modules/schedules/schedules.service.ts#L71) передаёт `SCHEDULE_SLOTS(id)` = `slots:<id>:` в `store.del(keys: string[])`, который удаляет точные ключи. Ни один реальный ключ вида `slots:<id>:<from>:<to>` не будет удалён. То же в [services.service.ts:79](apps/catalog-service/src/modules/services/services.service.ts#L79): инвалидируется `catalog:services`, тогда как ключи списка — `catalog:services:<search>:<page>:<pageSize>`. После любой админ-записи кэш отдаёт протухшие данные до истечения TTL. Нужен либо `delByPrefix` в `CacheStore`, либо SCAN-удаление по префиксу.

### Major (Should Fix)

- [ ] **Идемпотентность генератора — «всё или ничего», частичная догенерация невозможна** — [slot-generator.service.ts:66-69](apps/catalog-service/src/modules/schedules/slot-generator.service.ts#L66-L69). При любом существующем слоте в диапазоне цикл целиком `continue` — слоты новых дней (расширили окно, добавили день) никогда не догенерируются, а `skipped` рапортует `existingEntries.length`, что противоречит собственному комментарию про «skip per day». Юнит-тест покрывает только случай «всё уже есть». Пер-дневная проверка или per-slot `get` по детерминированному id.

- [ ] **Генерация слотов — последовательные `await` в цикле** — [slot-generator.service.ts:70](apps/catalog-service/src/modules/schedules/slot-generator.service.ts#L70). Для 90 дней × окно 8 ч × 15 мин это ~3 600 последовательных HTTP-вызовов HAPI. Гейт NFR-005 будет провален с запасом. FHIR `transaction` Bundle (batch create) решает одним запросом.

- [ ] **`GET /doctors?serviceId=...` молча игнорирует фильтр** — [doctors.service.ts:12-24](apps/practitioner-service/src/modules/doctors/doctors.service.ts#L12-L24). `serviceId` деструктурируется, но в FHIR-поиск не попадает. Публичный API-контракт (§4.1) отдаёт неверный результат без ошибки. Либо добавить фильтр (через `HealthcareService`/`PractitionerRole` search), либо убрать параметр из контроллера.

- [ ] **`PATCH /admin/services/:id` ломает `type` при частичном обновлении** — [services.service.ts:52-61](apps/catalog-service/src/modules/services/services.service.ts#L52-L61). Если в `UpdateServiceDto` пришёл только `typeCode` (без `typeSystem`), `toHealthcareService` собирает coding с `system: undefined`, и spread-merge затирает валидный существующий `type`. Аналогично в `rooms.service.update`: ключи с `undefined` из `Partial`-маппера перезаписывают существующие поля (description станет undefined при отсутствии в DTO). Мержить только определённые поля.

- [ ] **`UpdateScheduleDto.horizonFrom/horizonTo` принимаются, но теряются** — [schedules.service.ts:193-205](apps/catalog-service/src/modules/schedules/schedules.service.ts#L193-L205): `toPatch` их не читает. Клиент думает, что горизонт обновлён.

- [ ] **Ключ кэша слотов не включает `status`** — [schedules.service.ts:81](apps/catalog-service/src/modules/schedules/schedules.service.ts#L81). Первый запрос `?status=free` закэширует free-only выборку под общим ключом, и последующий запрос без фильтра получит урезанный ответ. Включать `status ?? 'all'` в ключ.

- [ ] **`floor` комнаты принимается DTO, но не сохраняется и не возвращается** — [create-room.dto.ts:16-19](apps/practitioner-service/src/modules/rooms/dto/create-room.dto.ts#L16-L19) валидирует `floor`, но `toLocation` его не маппит, а `toResponseDto` не читает — данные молча теряются. Маппить в `Location.extension`/`physicalType`-агрегат или убрать из DTO.

- [ ] **`assertTerminology` ищет по `CodeSystem?code=...`** — [services.service.ts:93-96](apps/catalog-service/src/modules/services/services.service.ts#L93-L96). `code` не является search-параметром `CodeSystem` в HAPI — запрос вернёт пусто (или 400), и **все** создания услуг упадут с `422 TERMINOLOGY_NOT_FOUND`. Корректный путь — `ValueSet/$expand` или `CodeSystem/$lookup` (BR-004), либо seed-кэш. Нужен e2e-тест с реалистичным HAPI-моком, который это ловит.

- [ ] **`HttpClient` без таймаута и без тела ошибки** — [fhir-client.provider.ts:102-114](libs/fhir/src/lib/fhir-client.provider.ts#L102-L114). `fetch` без `AbortSignal.timeout(...)`: зависший HAPI держит воркер бесконечно; `FhirClientError` теряет `OperationOutcome`-тело ответа, что усложняет диагностику. Также `FHIR_BASE_URL ?? ''` молча создаёт клиент с пустым baseUrl — валидировать конфиг на старте (это же открытый пункт M3 из ревью auth-service).

- [ ] **`slotDurationMin` пишется как верхнеуровневое поле `Schedule`** — [schedules.service.ts:31](apps/catalog-service/src/modules/schedules/schedules.service.ts#L31). Не валидный элемент FHIR R4 `Schedule`; HAPI с строгой валидацией отклонит, без строгой — поле молча исчезнет из read-модели, и генератор уйдёт в дефолтные 30 минут ([slot-generator.service.ts:170-173](apps/catalog-service/src/modules/schedules/slot-generator.service.ts#L170-L173)). Перенести в extension (как `planningHorizon`).

### Minor (Consider)

- [ ] `appointment.mapper.ts:40-43` — `patientId/doctorId/practitionerRoleId/serviceId` жёстко возвращают `''`: участники `participant[].actor.reference` не разбираются. Для M2 не критично (маппер не используется), но это мина для M3.
- [ ] `slot.mapper.ts:31` — любой неизвестный `status` (в т.ч. `busy-unavailable`, `entered-in-error`) маппится в `'free'`. Пациент увидит занятый слот как свободный. Стоит сузить явно.
- [ ] `rooms.service.ts:28-31` — `findById` не имеет маршрута (`GET rooms/:id` отсутствует в контроллере) — мёртвый код.
- [ ] `ucum.ts:14` — в закрытом множестве `mm/Hg`; каноничный UCUM — `mm[Hg]`. Опечатка в справочнике единиц.
- [ ] `redis-cache.service.ts:78,90` — `logger.warn({ err, key }, 'msg')`: у NestJS `Logger.warn(message, context?)` второй аргумент — это контекст, а не сообщение; в логах роли перепутаны.
- [ ] Контроллеры пагинации (`doctors`, `rooms`, `services`) делают `Number(page)`/`Number(pageSize)` без валидации: `?pageSize=100000` уходит в `_count`, `?page=abc` даёт `NaN` → `_offset: NaN`. Стоит `@Type`+DTO или хотя бы клампы.
- [ ] `rooms.service.remove` — поиск расписаний до проверки существования комнаты: для несуществующей комнаты лишний поиск; и поиск без `_count` может обрезать по странице HAPI по умолчанию (false-negative при 100+ расписаниях).
- [ ] `DELETE /admin/schedules/:id` читает тело запроса — нестандартно для DELETE; `cascade` обычно делают query-параметром (или POST /:id/cascade). Сработает, но `fetch`/прокси могут отбрасывать DELETE-body.
- [ ] `schedules.service.ts:33-34` — два extension с одинаковым `url: 'planningHorizon'` (valueString + valuePeriod): читается по find() с проверкой `valueString` — работает, но хрупко; лучше отдельные url или один valueString с JSON {windows, from, to}.
- [ ] Генерация слотов не инвалидирует `SCHEDULE_SLOTS(id)` после создания слотов — до 15 с `listSlots` отдаёт пустой результат по свежесгенерированному расписанию.

### Positive Notes

- Единый скелет обоих сервисов (guard-стек `APP_GUARD` по ADR-009, `RequestIdMiddleware`, глобальный `ValidationPipe`, `ProblemDetailsFilter`) — копируется консистентно, JWT-периметр прикрыт e2e-пробой в обоих сервисах.
- `libs/fhir` — удачно узкий контракт `FhirClient` + фабрика провайдера, читающая креды только из env; тесты через подмену `global.fetch`.
- `libs/terminology` — честные комментарии про расхождение regex из спека и реального ATC-грамматики; тесты на отрицательные кейсы (русский free-text, lowercase, чужие коды).
- Ошибки домена везде с машиночитаемыми `errorCode` (`SCHEDULE_OVERLAP`, `ROOM_IN_USE`, `SERVICE_IN_USE`, `TERMINOLOGY_NOT_FOUND`) — контракты API соблюдены.
- Unit-тесты не требуют БД/Redis — вся M2-пачка прогоняется локально (13 тестов зелёные).

## Next Steps

**Next by flow:** `/test-generator` — покрыть критичные кейсы: частичная догенерация слотов, инвалидация по префиксу, фильтр `serviceId`, PATCH с частичным `typeCode`.

**Alternatives:**
- `/coder` — закрыть Critical-блок M2-гейта (Redis-стор, валидный slot id, префиксная инвалидация).
- Вернуться к `/verify` после фиксов — прогнать e2e против поднятого HAPI.
