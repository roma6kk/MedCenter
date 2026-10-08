# Code Reviewer — M2 fix pass (повторное ревью после закрытия Major-находок)

Дата: 2026-10-08. Ревью того же нераскоммиченного M2-диффа после `/coder`-прохода,
закрывшего 3 Critical + 6 Major из [code-reviewer-m2-report.md](code-reviewer-m2-report.md).

## Проверки (Pre-Completion Verification)

| Проверка | Результат |
|---|---|
| `nx run-many --target=lint --all --skip-nx-cache` (9 проектов) | ✅ exit 0 |
| `nx run-many --target=test --all --skip-nx-cache` (146 тестов) | ⚠️ 144 passed / 2 failed — оба провала pre-existing: `user.repository.spec.ts` требует живой Postgres (`role "medcenter" does not exist`), не связаны с M2 |
| `nx run-many --target=build --all --skip-nx-cache` (9 проектов) | ✅ exit 0 (прогон из `/coder`-прохода, M2-код с тех пор не менялся в части build) |
| `npm run typecheck` (`tsc --noEmit -p tsconfig.base.json`) | ✅ exit 0 |
| Naming convention (`code-reviewer-` для артефактов) | ✅ этот отчёт |

## Статус закрытия находок первого ревью

### Critical — все закрыты, подтверждено ✅

- [x] **Redis-стор подключён** — [redis-cache.store.ts](../../apps/catalog-service/src/modules/cache/redis-cache.store.ts): ioredis-клиент, `CACHE_STORE`-токен, `delByPrefix` через SCAN (не KEYS), graceful `quit()`, degrade-to-miss без `REDIS_URL`, noise-guard на `error`. Wiring в [cache.module.ts](../../apps/catalog-service/src/modules/cache/cache.module.ts) корректный. 8 юнит-тестов на кэш зелёные.
- [x] **Валидный id слота** — SHA-256 от `scheduleId|start`, 64 hex-символа, попадает в `[A-Za-z0-9\-.]{1,64}`; тест на FHIR-паттерн + детерминированность (тот же schedule+start → тот же id) зелёные.
- [x] **Префиксная инвалидация** — `RedisCacheService.invalidate` разделяет точные ключи и префиксы (trailing `:`) → `del`/`delByPrefix`; `services.service.invalidate` теперь инвалидирует `catalog:services:` префиксом. Логика покрыта тестами.

### Major — все 6 закрыты, подтверждено ✅

- [x] **Пакетная генерация слотов** — `createBatch()`: FHIR `batch` Bundle, chunk по 200, `PUT Slot/{id}`, подсчёт только 2xx `response.status`. Тесты: структура Bundle, 2xx-подсчёт, частичная догенерация.
- [x] **Частичная догенерация** — per-slot skip по совпадению `start` (идентичность = schedule+start, id — функция от них). Тест «все 6 start существуют → generated=0, batch не вызывается» + «расширение диапазона на новый день → batch только новые».
- [x] **PATCH услуги с частичным typeCode** — `mergeDefined` + полная замена `type` coding при частичном typeCode. Ревью-проход поймал дополнительный реальный баг: name-only PATCH затирал существующий coding all-undefined-значением — исправлено (`type` эмитится только при наличии typeCode/typeSystem). 6 тестов.
- [x] **horizonFrom/To в update** — merge valuePeriod: частичный PATCH сохраняет противоположную границу из существующего периода; windows-only PATCH переносит хранимый период; guard 90 дней (`assertHorizonAge`). Удалён дублирующий merge-путь из `toPatch`. Тесты: merge частичного PATCH, 90-day rejection.
- [x] **Кэш-ключ со status** — `slots:{id}:{from}:{to}:{status ?? 'all'}`; тест проверяет фактические ключи через spy на `getOrLoad`.
- [x] **serviceId у GET /doctors** — резолв через `PractitionerRole?service=...` → practitioner-id → `Practitioner?_id=...`. 5 тестов (включая прокидывание specialty/search, пустой список, roles без practitioner).

## Issues Found (в текущем состоянии диффа)

### Critical (Must Fix)

Пусто. Блокеров M2-гейта нет.

### Major (Should Fix)

> **Статус после `/coder`-прохода «закрыть 4 Major» (2026-10-08): все 4 закрыты** — см.
> [coder-m2-major-fixes-report.md](coder-m2-major-fixes-report.md). Ниже — исходное описание.

- [x] **`floor` комнаты по-прежнему теряется** — [create-room.dto.ts:19](../../apps/practitioner-service/src/modules/rooms/dto/create-room.dto.ts#L19), [update-room.dto.ts:27](../../apps/practitioner-service/src/modules/rooms/dto/update-room.dto.ts#L27) валидируют `floor`, [room-response.dto.ts:6](../../apps/practitioner-service/src/modules/rooms/dto/room-response.dto.ts#L6) его декларирует, но `toLocation` не мапит, `toResponseDto` не читает. Молчаливая потеря данных публичного API-контракта — та же категория, что и закрытый `serviceId`-фильтр. Мапить в `Location.extension` (например, `floor` valueInteger) или убрать из всех трёх DTO.
- [x] **`assertTerminology` ищет `CodeSystem?code=`** — [services.service.ts:93-96](../../apps/catalog-service/src/modules/services/services.service.ts#L93-L96): `code` не является search-параметром `CodeSystem` в HAPI — реальный сервер вернёт пусто/400, и **все** создания/обновления услуг упадут с `422 TERMINOLOGY_NOT_FOUND`. Ранее числился Major, остаётся открытым: нужен `ValueSet/$expand`, `CodeSystem/$lookup` или seed-кэш, плюс e2e с реалистичным HAPI-моком. Обходной вариант для M2 — кэшировать результат первой успешной валидации кода.
- [x] **`HttpClient` без таймаута** — [fhir-client.provider.ts](../../libs/fhir/src/lib/fhir-client.provider.ts): `fetch` без `AbortSignal.timeout(...)` — зависший HAPI держит воркер бесконечно (NFR-005 slot search < 500 ms не защищён). Также `FhirClientError` не сохраняет тело ошибки (`OperationOutcome` теряется). Дополнительно: теперь есть `batch()` — при большом Bundle без таймаута риск растёт.
- [x] **`slotDurationMin` — невалидный элемент `Schedule` R4** — [schedules.service.ts:31](../../apps/catalog-service/src/modules/schedules/schedules.service.ts#L31). HAPI со строгой валидацией отклонит весь create; без строгой — поле молча исчезнет и генератор уйдёт в дефолтные 30 мин. Перенести в extension (как `planningHorizon`).

### Minor (Consider)

- [ ] `slot.mapper.ts:31` — неизвестный `status` (busy-unavailable, entered-in-error) маппится в `'free'`: пациент увидит занятый слот свободным. Сузить явно (перенесён из первого ревью, не закрыт).
- [ ] `ucum.ts:14` — `'mm/Hg'` вместо каноничного `'mm[Hg]'` в справочнике UCUM (перенесён, не закрыт).
- [ ] Пагинация контроллеров (`doctors`, `rooms`, `services`) — `Number(page)/Number(pageSize)` без валидации: `?pageSize=100000` уходит в `_count`, `?page=abc` даёт `NaN → _offset: NaN` (перенесён, не закрыт).
- [ ] Генерация слотов не инвалидирует `SCHEDULE_SLOTS(id)` после записи Bundle — до 15 c `listSlots` может отдать пустой результат по свежесгенерированному расписанию. Одна строка: `await this.cache.invalidate([CACHE_KEYS.SCHEDULE_SLOTS(scheduleId)])` после `createBatch` (нужен инжект кэша в генератор).
- [ ] `DELETE /admin/schedules/:id` читает тело (`DeleteScheduleDto.cascade`) — нестандартно, часть HTTP-клиентов/прокси отбрасывает DELETE-body; надёжнее query-параметр (перенесён, не закрыт).
- [ ] Два extension с одинаковым `url: 'planningHorizon'` (valueString + valuePeriod) — работает через find() с проверкой типа значения, но хрупко для потребителей (перенесён, не закрыт).
- [ ] `slot-generator.service.spec.ts:245` — в тесте horizon merge осталось «археологическое» ожидание `expect(merged['extensionPatch']).toBeUndefined()`: поле `extensionPatch` нигде не существует, проверка ничего не проверяет. Убрать строку.
- [ ] `rooms.service.remove` — поиск расписаний до проверки существования комнаты (лишний поиск) и без `_count` (false-negative при 100+ расписаниях из-за пагинации HAPI по умолчанию).
- [ ] `appointment.mapper.ts` — `patientId/doctorId/...` жёстко `''` (заглушка, мина для M3 — вне M2-периметра).

### Positive Notes

- `/coder`-проход закрыл **все** 3 Critical и **все** 6 Major первого ревью, и каждый фикс покрыт юнит-тестами (не только «фикс ради фикса»: per-slot skip, 2xx-подсчёт, ключи кэша, merge периода, полный replace coding).
- Дополнительный баг (name-only PATCH затирал type) был найден именно новыми тестами и починен — тестовый проход окупился.
- Исправления не сломали смежное: полный lint/build/typecheck по 9 проектам зелёные, DB-free тесты 144/144 зелёные.
- Кэш-инвалидация services теперь консистентна с фактными ключами (`catalog:services:` префикс, а не точный ключ без суффиксов).

## M2-гейт

«doctors/services/slots queryable via Redis cache · slot generation idempotent & non-duplicating» — **выполнен**: Redis-стор подключён и покрыт тестами, генерация идемпотентна per-slot и пакетная, кэш-ключи различают status, публичные фильтры API работают. Оставшиеся 4 Major (floor, terminology-lookup, таймаут, slotDurationMin) **закрыты проходом от 2026-10-08** — см. [coder-m2-major-fixes-report.md](coder-m2-major-fixes-report.md); до прод-эксплуатации остаются только Minor.

## Next Steps

**Next by flow:** `/test-generator` — покрыть Minor: статус-маппинг slot.mapper, инвалидация кэша после генерации, пагинация.

**Alternatives:**
- `/coder` — закрыть 4 оставшихся Major (floor, assertTerminology, таймаут+тело ошибки, slotDurationMin→extension).
- `/finishing-branch` — закоммитить M2-дифф (без посторонних docx/pdf в корне).
