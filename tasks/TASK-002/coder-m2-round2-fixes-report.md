# Coder — закрытие Major 1–5 ревью M2 round 2

Дата: 2026-10-08 · Ветка: `main` (нераскоммиченный M2-дифф) · Источник:
[code-reviewer-m2-round2-report.md](code-reviewer-m2-round2-report.md)

## Окружение

`node_modules` были собраны под Linux (только `@nx/nx-linux-x64-gnu`, без `.cmd`-шимов), из-за чего
nx/eslint на Windows зависали. Выполнен `npm ci` на Windows (exit 0, 1212 пакетов):
теперь есть `@nx/nx-win32-x64-msvc`, `nx.cmd`/`tsc.cmd`/`jest.cmd`/`eslint.cmd`.
**Побочный эффект:** из WSL этот `node_modules` больше не работает — там нужен свой `npm ci`.

## Fixes

### Major 1 — неизвестный НСИ-код → 422 (а не 500)

[services.service.ts](../../apps/catalog-service/src/modules/services/services.service.ts) `assertTerminology`:
`$lookup` с ответом HAPI **400/404/422** (OperationOutcome «Unable to find code») → `422 TERMINOLOGY_NOT_FOUND`;
5xx/таймаут не маскируются под «неизвестный код» и уходят как 502/504. Успех = 2xx `Parameters`
(убрана проверка параметра `name` — это имя CodeSystem, а не display концепта).
Тесты: мок теперь повторяет реальный HAPI (`FhirClientError` 404/400/422 → 422; 503 → 502, `update` не вызывается).

### Major 2 — ошибки FHIR-клиента в HTTP-контракте

[fhir-client.provider.ts](../../libs/fhir/src/lib/fhir-client.provider.ts):
- `FhirClientError` теперь `extends HttpException` → проходит через `ProblemDetailsFilter` с каталожным кодом:
  HAPI 404/410 → `404 NOT_FOUND`; таймаут → `504`; сеть/прочие 4xx/5xx → `502` (оба `INTERNAL`).
- `fetch` обёрнут в try/catch: `TimeoutError` и сетевые ошибки тоже становятся `FhirClientError` (`timedOut`, `cause`).
- Поле `status` (HAPI) переименовано в `upstreamStatus` — `status` занят `HttpException`.
- Клиенту уходит только общий текст; URL HAPI и OperationOutcome остаются на ошибке и в логе
  (`Logger.warn` для 5xx/таймаута/сети — `ProblemDetailsFilter` HttpException не логирует).
- [rooms.service.ts](../../apps/practitioner-service/src/modules/rooms/rooms.service.ts) `remove`: сначала `read`
  (неизвестный id → 404 от клиента), затем поиск расписаний с `_count: 1`; мёртвая ветка `room.id === undefined` удалена
  (заодно закрыт Minor «remove без `_count`»).

**Решение без расширения контракта:** отдельного errorCode для недоступности upstream в каталоге нет
(`ERROR_CODES`, 16 кодов, на них завязана frontend-карта 16/16), поэтому 502/504 идут с `INTERNAL`.
Если нужен отдельный код (например, `UPSTREAM_UNAVAILABLE`) — это решение для `/api-designer`.

### Major 3 — 90-дневный guard на смерженном периоде

[schedules.service.ts](../../apps/catalog-service/src/modules/schedules/schedules.service.ts) `update`:
`assertHorizonSpan(start, end)` проверяет **смерженные** границы (DTO + сохранённый valuePeriod), если в PATCH
есть хотя бы одна граница. Тест: сохранённый `2026-01-01..02-01` + `PATCH {horizonTo: '2027-12-31'}` → 400, `update` не вызывается.

### Major 4 — PATCH только `typeSystem`

`services.service.ts`: `typeSystem` без `typeCode` → `400 VALIDATION_ERROR` до чтения/записи;
`type` в маппинге эмитится только при наличии `typeCode`. Тест: `operation`/`update` не вызываются.

### Major 5 — абсолютные url расширений

Новый [extension-urls.ts](../../libs/terminology/src/lib/extension-urls.ts) — `MEDCENTER_EXT` с
`https://api.medcenter.by/fhir/StructureDefinition/<name>` для room-floor, service-default-duration,
schedule-slot-duration, schedule-weekly-windows, schedule-planning-horizon, slot-actors. Все чтения/записи
переведены на константы. Попутно закрыт Minor «два extension с одним url `planningHorizon`»: окна и горизонт
теперь в разных extension, `update` апсертит каждое extension по url (PATCH одного не теряет другие; пустой
массив `extension` не пишется — FHIR JSON его запрещает). Удалён ставший лишним `toPatch`.
Тест на абсолютность и уникальность всех url.

**Не сделано осознанно:** fallback чтения старых относительных url — M2 не выпущен и не закоммичен, данных
с прежними url нет (кроме dev-HAPI; при необходимости пересоздать расписания). Legacy top-level
`slotDurationMin` по-прежнему читается и мигрируется. Абсолютность `Extension.url` не сверена с HL7 через
`get_fhir_page` — MCP `fhir-docs` в сессии не подключился.

### Попутно (Minor из ревью)

- `search()` с массивом теперь шлёт повторяющиеся параметры (`start=ge…&start=le…`, AND); раньше
  `String(array)` давал `start=ge…,le…` (OR) — фильтр слотов по диапазону дат в `listSlots` был сломан.
  Общий `withQuery()` убрал дублирование между `search` и `operation`.
- `FHIR_TIMEOUT_MS` не-целое/≤0 → падение на старте вместо `TypeError` на каждом запросе.
- Удалено мёртвое ожидание `extensionPatch` в `slot-generator.service.spec.ts`.

## Verification

| Проверка | Результат |
|---|---|
| `npx nx run-many --target=lint --all --skip-nx-cache` | ✅ 9 проектов |
| `npx nx run-many --target=test --all --skip-nx-cache` | ✅ 9 проектов, 0 failed (auth-service 144 passed + 2 skipped e2e) |
| `npx nx run-many --target=build --all --skip-nx-cache` | ✅ 9 проектов |
| `npm run typecheck` | ✅ exit 0 |
| Naming (`coder-`) | ✅ этот отчёт |

Новые/изменённые тесты: fhir 12 → 18, practitioner 15 → 17, catalog 31 → 37, terminology +7 (extension urls).

## Context Summary

Закрыты все 5 Major round-2: ошибки HAPI теперь доходят до клиента как 404/502/504 вместо 500,
неизвестный НСИ-код — 422 (тесты на реалистичных 4xx-ответах HAPI), 90-дневный guard работает на
смерженном периоде, PATCH только `typeSystem` отклоняется, все extension получили абсолютные
канонические url из `libs/terminology`. Попутно починен AND-поиск по диапазону `start` и закрыты 4 Minor.
Зависимости переустановлены под Windows; lint/test/build/typecheck по всем 9 проектам зелёные.

## Next Steps

**Next by flow:** `/code-reviewer` — повторное ревью этих фиксов.

**Alternatives:**
- `/test-generator` — оставшиеся Minor (статус-маппинг `slot.mapper`, инвалидация `SCHEDULE_SLOTS` после генерации, валидация пагинации).
- `/api-designer` — решить, нужен ли отдельный errorCode для недоступности HAPI (502/504).
