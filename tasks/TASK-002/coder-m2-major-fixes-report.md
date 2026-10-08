# Coder — закрытие 4 Major-находок M2 (round 2)

Дата: 2026-10-08 · Ветка: `main` (нераскоммиченный M2-дифф) · Источник: [code-reviewer-m2-fixes-report.md](code-reviewer-m2-fixes-report.md)

## Scope

Закрыты все 4 Major-находки повторного ревью. Minor не входили в запрос.

## Fixes

### 1. Floor round-trip (rooms)

**Проблема:** `CreateRoomDto`/`UpdateRoomDto` валидируют `floor`, `RoomResponseDto` его
декларирует, но сервис не мапил его ни при записи, ни при чтении — данные молча терялись.

**Решение** — [rooms.service.ts](../../apps/practitioner-service/src/modules/rooms/rooms.service.ts):
- `floor` хранится в `Location.extension` (`{url: 'floor', valueInteger: N}`), т.к. FHIR R4 `Location`
  не имеет нативного floor-элемента;
- `create`: extension добавляется в `toLocation`;
- `update`: `extension` исключён из общего merge-цикла (иначе массив патча затирает посторонние
  extension хранимого ресурса — тест это поймал), floor мержится per-entry: существующий entry по
  url заменяется, чужие сохраняются, отсутствие в DTO не трогает хранимое значение;
- `readFloor()` читает extension в `toResponseDto`.

**Тесты** (rooms.service.spec.ts, +4): запись ext при create, чтение в DTO, замена floor-патча
без потери чужих ext, сохранение floor при PATCH без поля. Побочный выигрыш: тест на замену
патча поймал и починил затирание посторонних extension общим merge-циклом.

### 2. Terminology-lookup (services)

**Проблема:** `assertTerminology` искал `CodeSystem?code=...` — `code` не является
search-параметром `CodeSystem` в HAPI: реальный сервер вернул бы пусто, и все
create/update услуг падали бы с `422 TERMINOLOGY_NOT_FOUND`.

**Решение** — валидация через `CodeSystem/$lookup`, который HAPI резолвит для
`content: complete` CodeSystem'ов (именно такие грузит `tools/terminology-seed`):
- [fhir-client.provider.ts](../../libs/fhir/src/lib/fhir-client.provider.ts) — новый контрактный
  метод `FhirClient.operation(resourceType, operation, params)` → GET `<type>/<op>?<query>`
  (общий для `$lookup`, будущего `$expand`);
- [services.service.ts](../../apps/catalog-service/src/modules/services/services.service.ts) —
  `assertTerminology` вызывает `operation('CodeSystem', '$lookup', {system, code})` и проверяет
  наличие параметра `name` (display) в ответе `Parameters`; его отсутствие → `422`.

**Тесты** (services.service.spec.ts): `$lookup` вызывается с каноническим system и кодом
(новое ожидание в typeCode-тесте), неизвестный код → 422, name-only PATCH без вызова валидации.

### 3. Timeout + тело ошибки HttpClient (libs/fhir)

**Проблема:** `fetch` без таймаута — зависший HAPI держал воркер бесконечно
(NFR-005 slot search < 500 ms не защищён); `FhirClientError` терял тело ответа
(`OperationOutcome` недоступен для диагностики); пустой `FHIR_BASE_URL` тихо создавал
бесхозный клиент.

**Решение** — [fhir-client.provider.ts](../../libs/fhir/src/lib/fhir-client.provider.ts):
- `AbortSignal.timeout(config.timeoutMs ?? DEFAULT_FHIR_TIMEOUT_MS = 10_000)` в каждом запросе;
  переопределение через конфиг / env `FHIR_TIMEOUT_MS`;
- `FhirClientError.body` — текст ответа (обычно OperationOutcome), читается с
  `catch(() => undefined)` — нечитаемое тело не ломает обработку ошибки;
- `createFhirClientProvider` падает при старте без `FHIR_BASE_URL` вместо тихого `''`.

**Тесты** (fhir-client.provider.spec.ts, +6): abort-signal в каждом запросе и его непустота,
значение по умолчанию 10 с, перенос тела ошибки, устойчивость к нечитаемому телу,
GET-сериализация `operation`-вызова, fail-fast без `FHIR_BASE_URL`.

### 4. slotDurationMin → extension (schedules)

**Проблема:** `slotDurationMin` писался верхнеуровневым элементом `Schedule` — не валиден в
FHIR R4: строгий HAPI отклонил бы весь create, нестрогой — поле молча исчезает, генератор
падает в дефолтные 30 мин.

**Решение**:
- новый модуль [schedule.constants.ts](../../apps/catalog-service/src/modules/schedules/schedule.constants.ts)
  с `SLOT_DURATION_EXT` и `PLANNING_HORIZON_DAYS` — разрывает цикл импортов
  schedules ↔ slot-generator (иначе константа лежала в генераторе, а маппинг — в сервисе);
- [schedules.service.ts](../../apps/catalog-service/src/modules/schedules/schedules.service.ts) —
  `create` пишет extension `{url: 'slotDurationMin', valueInteger: N}` вместо top-level поля;
  **и update-путь**: `toPatch` больше не пишет top-level — `update()` мержит duration в
  extension ПОСЛЕ merge патча (windows-only PATCH заменяет весь массив extension, иначе
  хранимый duration терялся бы), значение берётся из dto либо из хранимого (legacy top-level
  тоже мигрируется в extension при любом update);
- [slot-generator.service.ts](../../apps/catalog-service/src/modules/schedules/slot-generator.service.ts) —
  `readSlotDuration` читает extension, со fallback'ом на legacy-поле и далее на 30 мин
  (старые расписания продолжают работать).

**Тесты** (slot-generator.service.spec.ts, +5): create кладёт extension и НЕ пишет top-level
поле; PATCH пишет extension и сносит legacy top-level; windows-only PATCH не теряет хранимый
duration; генератор читает duration из extension (окно 60 мин / 20 мин = 3 слота); fallback 30 мин.

## Verification (Pre-Completion, Standard tier)

| Проверка | Результат |
|---|---|
| `nx run-many --target=lint --all --skip-nx-cache` (9 проектов) | ✅ exit 0 |
| `nx run-many --target=build --all --skip-nx-cache` (9 проектов) | ✅ exit 0 |
| `npm run typecheck` | ✅ exit 0 |
| `nx run-many --target=test --all --skip-nx-cache` | ⚠️ exit 1 — 144 passed / 2 failed; оба провала — pre-existing `user.repository.spec.ts` (требует Postgres с ролью `medcenter`), к M2 не относятся; все DB-free тесты зелёные (catalog 31, practitioner 15, fhir 12, остальные) |
| Naming convention (`coder-` для артефактов) | ✅ этот отчёт |

## Context Summary

4 Major-находки закрыты с тестами на каждый фикс: floor теперь round-trip-ится через
`Location.extension` (и merge починен так, чтобы не терять чужие extension), терминология
валидируется корректным `CodeSystem/$lookup` через новый `FhirClient.operation`, HttpClient
обзавёлся таймаутом 10 с, телом ошибки и fail-fast на пустом `FHIR_BASE_URL`, а
`slotDurationMin` переехал в extension — не только в create, но и в update-пути
(находка была шире исходной: PATCH тоже писал top-level элемент и windows-only PATCH
терял хранимый duration). Lint/build/typecheck зелёные; единственные красные тесты —
pre-existing DB-зависимость auth-service.

## Next Steps

**Next by flow:** `/code-reviewer` — re-review закрытых находок.

**Alternatives:**
- `/test-generator` — покрыть оставшиеся Minor (инвалидация кэша после генерации, статус-маппинг slot.mapper, пагинация).
- `/finishing-branch` — закоммитить M2-дифф (без посторонних docx/pdf).
