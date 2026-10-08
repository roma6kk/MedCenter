# Code Reviewer — M2 round 2 (re-review закрытых Major)

Дата: 2026-10-08 · Ветка: `main` (нераскоммиченный M2-дифф) · Источник:
[coder-m2-major-fixes-report.md](coder-m2-major-fixes-report.md) (закрытие 4 Major из
[code-reviewer-m2-fixes-report.md](code-reviewer-m2-fixes-report.md)).

Объём ревью: `libs/fhir/src/lib/fhir-client.provider.ts`,
`apps/practitioner-service/src/modules/rooms/rooms.service.ts`,
`apps/catalog-service/src/modules/services/services.service.ts`,
`apps/catalog-service/src/modules/schedules/{schedules.service,schedule.constants}.ts`,
связанные spec-файлы, `libs/common/.../problem-details.filter.ts` (путь ошибок).

## Pre-Completion Verification

| Проверка | Результат |
|---|---|
| Typecheck — `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.base.json` | ✅ exit 0 |
| Jest `libs/fhir` | ✅ 12/12 |
| Jest `apps/catalog-service` | ✅ 31/31 (3 suites) |
| Jest `apps/practitioner-service` | ✅ 15/15 (2 suites) |
| Lint | ⛔ **не выполнен** — см. «Окружение» |
| Полный `nx run-many --target=test --all` | ⛔ **не выполнен** — см. «Окружение» |
| Naming convention | ✅ `code-reviewer-` префикс |

### Окружение (блокер верификации, не кода)

`node_modules` установлены под Linux: в `node_modules/.bin` нет Windows-шимов (`nx.cmd`, `tsc.cmd`),
а из нативных бинарников nx присутствует только `@nx/nx-linux-x64-gnu`. На Windows `nx run-many`
зависает (>10 мин без вывода), прямой `eslint` также не завершился за 400 с (тянет nx-плагин).
Typecheck и jest запущены напрямую через `node` — они от nx-native не зависят.
**Для DoD-гейта нужно либо `npm ci` на Windows, либо прогон lint/test из WSL.**

## Статус 4 Major из предыдущего ревью

| # | Находка | Статус |
|---|---|---|
| 1 | `floor` комнаты терялся | ✅ Закрыт: round-trip через `Location.extension`, per-entry merge сохраняет чужие extension, 4 теста |
| 2 | `CodeSystem?code=` вместо lookup | ⚠️ Закрыт частично — `$lookup` вызывается корректно, но путь «неизвестный код» не работает против реального HAPI (см. Major 1) |
| 3 | HttpClient без таймаута / без тела ошибки | ⚠️ Закрыт частично — таймаут и `body` есть, но ни `FhirClientError`, ни timeout нигде не маппятся в HTTP-статусы (см. Major 2) |
| 4 | `slotDurationMin` top-level в `Schedule` | ⚠️ Перенесён в extension, update-путь и legacy-миграция корректны; но url extension относительный (см. Major 5) |

## Summary

Фиксы аккуратные, покрыты тестами, регрессий в существующих тестах нет. Однако проверка
показала, что два фикса проверены только на моках, которые не повторяют реальное поведение
HAPI, а ошибочный путь `FhirClient` в целом не доведён до HTTP-контракта API. Также найдены
две новые дыры частичного PATCH того же класса, что уже закрывались в M2.

## Issues Found

### Critical (Must Fix)

Нет.

### Major (Should Fix)

- [ ] **1. Неизвестный НСИ-код даёт 500, а не 422** — [services.service.ts:113-135](../../apps/catalog-service/src/modules/services/services.service.ts#L113-L135).
  HAPI на `CodeSystem/$lookup` с неизвестным кодом отвечает **4xx + OperationOutcome**
  («Unable to find code …»), а не `200` с пустым `Parameters`. `HttpClient` бросает
  `FhirClientError`, `assertTerminology` его не ловит → `ProblemDetailsFilter` отдаёт
  `500 INTERNAL`. Тест `lookupMissing = { parameter: [] }` (spec:17, :118) моделирует ответ,
  которого HAPI не присылает, поэтому зелёный. Фикс: ловить `FhirClientError` со статусом
  400/404/422 → `422 TERMINOLOGY_NOT_FOUND`; тест с `mockRejectedValue(new FhirClientError(..., 404, ...))`.

- [ ] **2. Ошибки FHIR-клиента не маппятся в HTTP-контракт** — [fhir-client.provider.ts:160-168](../../libs/fhir/src/lib/fhir-client.provider.ts#L160-L168),
  [rooms.service.ts:87](../../apps/practitioner-service/src/modules/rooms/rooms.service.ts#L87).
  `FhirClientError` и `DOMException('TimeoutError')` от `AbortSignal.timeout` не являются
  `HttpException`, обработчика нет (`grep FhirClientError` — только место броска). Последствия:
  `GET /rooms/:unknown`, `GET /services/:unknown`, `PATCH` несуществующего ресурса → HAPI 404 →
  клиент получает `500` вместо `404 NOT_FOUND`; таймаут HAPI → `500` вместо 502/504.
  Ветка `room.id === undefined → 404` в `rooms.remove` недостижима (read либо вернёт ресурс с id,
  либо бросит). Фикс: единая трансляция в `libs/fhir` (404/410 → `NotFoundException`,
  409/412 → `ConflictException`, timeout/5xx → 502/504 c каталожным errorCode) или
  отдельный exception-фильтр; удалить мёртвую ветку.

- [ ] **3. 90-дневный guard обходится частичным PATCH** — [schedules.service.ts:52-54, 115-128](../../apps/catalog-service/src/modules/schedules/schedules.service.ts#L115-L128).
  `assertHorizonAge(dto)` проверяет span только если **обе** границы есть в DTO. `PATCH { horizonTo: '2027-12-31' }`
  при сохранённом `horizonFrom: '2026-01-01'` проходит, а merge (стр. 62-64) записывает
  период ~2 года. Тест (spec:366) покрывает только случай обеих границ. Фикс: проверять уже
  смерженные `start`/`end` (после `findHorizonPeriod`), тест на PATCH одной границей.

- [ ] **4. PATCH только `typeSystem` затирает `typeCode` и обходит валидацию терминологии** — [services.service.ts:53-66, 149-160](../../apps/catalog-service/src/modules/services/services.service.ts#L149-L160).
  `UpdateServiceDto` допускает `typeSystem` без `typeCode`. Тогда `assertTerminology` не
  вызывается (условие на `typeCode`), а `toHealthcareService` эмитит `type: [{coding: [{system, code: undefined}]}]`,
  `mergeDefined` заменяет хранимый `type` целиком → после сериализации у услуги нет кода.
  Тот же класс бага, что «name-only PATCH затирал type», закрытый в прошлом проходе.
  Фикс: при `typeSystem` без `typeCode` — либо `400 VALIDATION_ERROR` (на уровне DTO/сервиса),
  либо брать хранимый код и валидировать пару; тест.

- [ ] **5. Относительные url у extension** — `'floor'`, `'slotDurationMin'`, `'planningHorizon'`, `'defaultDurationMin'`
  ([schedule.constants.ts:8](../../apps/catalog-service/src/modules/schedules/schedule.constants.ts#L8), rooms.service.ts:10, services.service.ts, schedules.service.ts).
  В FHIR R4 `Extension.url` идентифицирует StructureDefinition расширения и должен быть
  абсолютным URL; валидатор HAPI в strict-режиме отклоняет относительные url. Значит, фикс #4
  («strict HAPI отклонит top-level `slotDurationMin`») при strict-валидации проблему не снимает,
  а лишь переносит. *Проверить по HL7 R4 Extensibility через `get_fhir_page` — MCP `fhir-docs`
  в этой сессии не подключился.* Фикс: канонические url-константы в `libs/terminology`
  (например, `https://api.medcenter.by/fhir/StructureDefinition/slot-duration`), чтение с
  fallback на legacy-относительные url.

### Minor (Consider)

- [ ] `FHIR_TIMEOUT_MS=abc` → `Number()` = `NaN`, `?? DEFAULT` не срабатывает, `AbortSignal.timeout(NaN)` бросает `TypeError` на **каждом** запросе — [fhir-client.provider.ts:209](../../libs/fhir/src/lib/fhir-client.provider.ts#L209). Добавить в zod env-схему `libs/config` (`z.coerce.number().int().positive().optional()`), как уже сделано для `FHIR_BASE_URL`.
- [ ] `$lookup`: выходной параметр `name` — это имя **CodeSystem**, а не display концепта (display — параметр `display`). Комментарий в services.service.ts:125 вводит в заблуждение; при фиксе Major 1 достаточно 2xx-ответа.
- [ ] `operation()` дублирует построение query из `search()` — [fhir-client.provider.ts:118-133](../../libs/fhir/src/lib/fhir-client.provider.ts#L118-L133). Вынести `toQuery(params)`. Попутно: `search` с массивом (`start: ['ge…','le…']`, schedules.service `listSlots`) через `query.set(key, String(value))` даёт `start=ge…,le…` — один параметр вместо двух; проверить, что HAPI это понимает (вероятно, нет → фильтр по диапазону не работает). Кандидат в Major после проверки.
- [ ] Перенесены из прошлого ревью, не закрыты: статус-маппинг `slot.mapper.ts:31`, `mm/Hg` в `ucum.ts:14`, валидация пагинации контроллеров, инвалидация `SCHEDULE_SLOTS` после генерации, DELETE-body `cascade`, два extension `planningHorizon`, мёртвое ожидание `extensionPatch` в `slot-generator.service.spec.ts:245`, `rooms.remove` без `_count`, заглушки `appointment.mapper.ts`.

### Positive Notes

- Floor-фикс сделан правильно: per-entry merge extension и тест, который поймал затирание чужих extension общим merge-циклом.
- `slotDurationMin` мигрирует legacy top-level значение при любом update, генератор читает оба варианта — обратная совместимость продумана.
- Fail-fast на пустом `FHIR_BASE_URL` и сохранение тела OperationOutcome; при этом `ProblemDetailsFilter` не отдаёт клиенту `exception.message`/URL HAPI — утечки внутренних адресов нет.
- Typecheck чистый, все тесты затронутых проектов зелёные.

## Context Summary

Re-review 4 Major-фиксов M2. Floor закрыт полностью; terminology `$lookup`, таймаут и
`slotDurationMin` закрыты частично: неизвестный код и любые ошибки/таймауты HAPI уходят
клиенту как 500 (моки в тестах не повторяют реальный HAPI), а относительные url extension
могут не пройти strict-валидацию. Новые находки: обход 90-дневного guard частичным PATCH и
затирание `typeCode` при PATCH только `typeSystem`. Critical нет, Major 5. Typecheck и jest
(58 тестов в 3 проектах) зелёные; lint и полный прогон nx не выполнены из-за Linux-сборки
`node_modules` на Windows.

## Next Steps

**Next by flow:** `/test-generator` — генерация тестов для проверенного кода.

**Alternatives:**
- `/coder` — закрыть Major 1–5 (рекомендуется до `/test-generator`, т.к. Major 1–4 сами требуют новых тестов).
- Перед любым гейтом: переустановить зависимости под Windows (`npm ci`) или гонять nx из WSL, чтобы выполнить lint и полный test.
