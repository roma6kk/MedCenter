# Code Reviewer — M2 Major findings (повторная проверка после round 2)

Дата: 2026-10-08 · Ветка: `main` (нераскоммиченный M2-дифф) · Источник фиксов:
[coder-m2-round2-fixes-report.md](coder-m2-round2-fixes-report.md) (закрытие Major 1–5 из
[code-reviewer-m2-round2-report.md](code-reviewer-m2-round2-report.md)).

Объём: `libs/fhir/src/lib/fhir-client.provider.ts`, `apps/catalog-service/src/modules/services/services.service.ts`,
`apps/catalog-service/src/modules/schedules/schedules.service.ts`, `apps/practitioner-service/src/modules/rooms/rooms.service.ts`,
`libs/terminology/src/lib/extension-urls.ts`, `libs/common/.../problem-details.filter.ts`.

## Pre-Completion Verification

| Проверка | Результат |
|---|---|
| `npx nx run-many --target=test --projects=fhir,catalog-service,practitioner-service,terminology --skip-nx-cache` | ✅ 4 проекта, catalog 37/37 (3 suites) |
| Lint / typecheck | не запускались в этом проходе (зелёные по `coder-m2-round2-fixes-report.md`) |
| Naming convention | ✅ `code-reviewer-` префикс |

## Статус Major 1–5 из round 2

| # | Находка | Статус по коду |
|---|---|---|
| 1 | Неизвестный НСИ-код → 422 | ✅ `LOOKUP_NOT_FOUND_STATUSES` (400/404/422) → `TERMINOLOGY_NOT_FOUND`; 5xx/таймаут не маскируются |
| 2 | Ошибки FHIR-клиента в HTTP-контракте | ⚠️ 404/504 закрыты; но 4xx кроме 404/410 маппятся в 502 — см. Major 1; тело ответа без парсинга — см. Major 2 |
| 3 | 90-дневный guard на смерженном периоде | ✅ `assertHorizonSpan(start, end)` на merged-границах |
| 4 | PATCH только `typeSystem` | ✅ 400 `VALIDATION_ERROR` до чтения/записи |
| 5 | Абсолютные url extension | ✅ `MEDCENTER_EXT` в `libs/terminology`; см. Minor 2 про хост |

## Issues Found

### Critical (Must Fix)

Нет.

### Major (Should Fix)

- [ ] **1. Upstream 4xx кроме 404/410 маскируется под 502** — [fhir-client.provider.ts:233-240](../../libs/fhir/src/lib/fhir-client.provider.ts#L233-L240).
  `toApiStatus` отдаёт `502 "FHIR server is unavailable"` для любого не-404/410 ответа HAPI, включая собственные отказы HAPI
  на наш запрос. Сценарии: (a) `POST Schedule` или `PUT Location`, который строгий HAPI отклонил валидацией (`400`/`422`) —
  клиент получает 502 «сервер недоступен», причина (наш некорректный ресурс) теряется; (b) `412 Precondition Failed` /
  `409 Conflict` (конфликт версии или дубль) — тоже 502, а должен быть 409. В round 2 это было в предложенном фиксе
  (409/412 → Conflict), но в `coder-m2-round2-fixes-report.md` попало как «сознательное решение без расширения контракта» —
  решение касается только отсутствия отдельного `errorCode`, а не статуса.
  Фикс: `409/412` → `409 CONFLICT`-класс (`ConflictException`); `400/422` от HAPI на запись → `500 INTERNAL`
  с логом (это дефект нашего маппинга, не вина клиента и не недоступность); 502 оставить только для 5xx и сетевых сбоев.
  Тест: `FhirClientError` с `upstreamStatus: 412` и `400` через `ProblemDetailsFilter` → ожидаемый статус.

- [ ] **2. Таймаут во время чтения тела успешного ответа не маппится в 504** — [fhir-client.provider.ts:167](../../libs/fhir/src/lib/fhir-client.provider.ts#L167).
  `AbortSignal.timeout` действует на весь запрос, включая чтение тела. Таймаут, сработавший на `response.json()` (строка 167,
  вне `try`), бросает сырой `DOMException('TimeoutError')`. Он не `HttpException` → `ProblemDetailsFilter` отдаёт
  `500 INTERNAL`, хотя контракт этого прохода — таймаут = `504`. Сценарий: HAPI отдал заголовки и завис на большом Bundle
  (`GET Slot` при 15 c таймауте) → клиент видит 500 и пишет в баг-трекер вместо 504.
  Фикс: разбор тела перенести внутрь той же обработки ошибок (`try { return await response.json() } catch (error) → FhirClientError({timedOut})`).
  Тест: мок `fetch`, у которого `json()` reject'ится `DOMException('TimeoutError')` → `504`.

### Minor (Consider)

- [ ] **1. Статус и errorCode не согласованы** — [fhir-client.provider.ts:213](../../libs/fhir/src/lib/fhir-client.provider.ts#L213).
  `FhirClientError` шлёт `502`/`504` с `errorCode: 'INTERNAL'`, а `ERROR_CODE_HTTP_STATUS.INTERNAL` = `500`. Фронтенд-карта
  (16/16) и клиенты, которые сверяют статус с кодом, получат пару, которой нет в контракте. Решение (отдельный код
  `UPSTREAM_UNAVAILABLE`) уже вынесено в `/api-designer` — здесь достаточно зафиксировать в комментарии.
- [ ] **2. Хост extension-namespace не подтверждён** — [extension-urls.ts:8](../../libs/terminology/src/lib/extension-urls.ts#L8).
  `https://api.medcenter.by/fhir/StructureDefinition/...` — выбранный хост. Проверить, что это домен проекта, которым владеем;
  иначе канонические url указывают на чужой ресурс. Проверка по HL7 R4 (`get_fhir_page`) не выполнялась — MCP `fhir-docs`
  в этом проходе не использовался.
- [ ] **3. Перенесённые из прошлых ревью Minor** (без изменений): статус-маппинг `slot.mapper.ts:31`, `mm/Hg` в `ucum.ts:14`,
  пагинация контроллеров, инвалидация `SCHEDULE_SLOTS` после генерации, DELETE-body `cascade`.

### Positive Notes

- `assertTerminology` различает «код не найден» (4xx HAPI → 422) и «сервис недоступен» (5xx/сеть/таймаут → 502/504) — это
  правильная граница, и тест использует реалистичные `FhirClientError`, а не `{ parameter: [] }`.
- `rooms.service.remove` сначала `read` (неизвестный id → 404 от клиента), затем `_count: 1` для поиска расписаний; мёртвая ветка удалена.
- `schedules.service.update` мержит периоды по границам и upsert'ит extension по url — частичный PATCH не теряет соседние extension.
- `ProblemDetailsFilter` не отдаёт клиенту ни URL HAPI, ни OperationOutcome — утечки внутренних адресов нет.

## Context Summary

Major-проход по M2 после round 2: тесты 37/37 зелёные в `fhir`, `catalog-service`, `practitioner-service`, `terminology`.
Major 1–5 round 2 закрыты по коду, но маппинг ошибок HAPI неполный: 4xx кроме 404/410 уходят как 502 (включая 409/412 и
валидационные 400/422), а таймаут при чтении тела успешного ответа — как 500. Новых Critical нет. Два Major — в
`libs/fhir/src/lib/fhir-client.provider.ts`.

## Next Steps

**Next by flow:** `/coder` — закрыть Major 1–2 (маппинг 4xx/409/412 и таймаут при чтении тела), с тестами на реалистичные ответы HAPI.

**Alternatives:**
- `/test-generator` — после фиксов добавить тесты маппинга в `libs/fhir` (если `/coder` не покрывает их сам).
- `/api-designer` — решить, нужен ли отдельный `errorCode` для недоступности HAPI (Minor 1).
