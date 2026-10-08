# Coder — закрытие Major 1–2 из M2 major-ревью

Дата: 2026-10-08 · Ветка: `main` (нераскоммиченный M2-дифф) ·
Источник: [code-reviewer-m2-major-report.md](code-reviewer-m2-major-report.md) (Major 1 и Major 2).

## Что сделано

### Major 1 — маппинг ошибок HAPI ([fhir-client.provider.ts](../../libs/fhir/src/lib/fhir-client.provider.ts))

| HAPI | Было | Стало | errorCode |
|---|---|---|---|
| 404 / 410 | 404 | 404 | `NOT_FOUND` |
| 409 / 412 | 502 | **409** | `CONFLICT` (новый код) |
| 400 / 422 | 502 | **500** (лог на стороне сервиса) | `INTERNAL` |
| 5xx, 401/403, прочее | 502 | 502 | `INTERNAL` |
| таймаут (заголовки или тело) | 504 / 500 | 504 | `INTERNAL` |

- `errorCode` теперь вычисляется из статуса (`toErrorCode`), поэтому пара статус/код не расходится (это также закрывает Minor 1 ревью).
- Ответ клиенту не содержит URL HAPI и OperationOutcome; для 500 текст — «Внутренняя ошибка сервера».
- Поток ошибок, который читает терминологию (`assertTerminology`), опирается на `upstreamStatus`, поэтому 400/404/422 на `$lookup` по-прежнему дают `422 TERMINOLOGY_NOT_FOUND`.

### Major 2 — таймаут при чтении тела ([fhir-client.provider.ts](../../libs/fhir/src/lib/fhir-client.provider.ts))

- `response.json()` вынесен в `try`: таймаут → `FhirClientError({ timedOut: true })` → `504`; другой сбой разбора (например, HTML вместо JSON) → `502`.
- Проверка таймаута вынесена в `isTimeoutError`, общую для обоих мест.

### Новый код `CONFLICT` (решение пользователя: «Add CONFLICT code»)

Код добавлен во все места, где перечислен каталог ошибок:
- [libs/contracts/src/lib/error-code.ts](../../libs/contracts/src/lib/error-code.ts): `ERROR_CODES` (16 → 17), `ERROR_CODE_HTTP_STATUS.CONFLICT = 409`.
- [frontend/src/lib/api/problem.ts](../../frontend/src/lib/api/problem.ts): зеркало `ERROR_CODES`.
- [frontend/src/lib/api/error-code-map.ts](../../frontend/src/lib/api/error-code-map.ts): UX `banner-generic` (`Record<ErrorCode, …>` требует запись).
- [frontend/src/messages/en.json](../../frontend/src/messages/en.json), [ru.json](../../frontend/src/messages/ru.json): сообщения.
- [specs/api-designer-spec.md](../../specs/api-designer-spec.md): строка таблицы каталога ошибок.

## Тесты

| Набор | Результат |
|---|---|
| `libs/fhir` (jest) | ✅ 24/24 (новые: 400/422 → 500; 409/412 → 409 CONFLICT; таймаут тела → 504; сбой разбора тела → 502) |
| `libs/contracts` (jest) | ✅ 31/31 (17 кодов; `CONFLICT` → 409) |
| `apps/catalog-service` (jest) | ✅ 37/37 |
| `apps/practitioner-service` (jest) | ✅ 17/17 |
| `frontend/src/lib/api` (jest) | ✅ 46/46 |
| `tsc --noEmit` (tsconfig.base.json, frontend/tsconfig.json) | ✅ exit 0 |
| eslint `libs/fhir/src`, `libs/contracts/src` | ✅ exit 0 |
| eslint `frontend/src/lib/api` | ⚠️ не выполнен: конфиг frontend игнорирует этот путь |

Тесты запущены напрямую через `node node_modules/jest/bin/jest.js` и `node node_modules/typescript/bin/tsc`: `nx run-many` на этой Windows-машине зависает (см. round-2 ревью, блокер окружения).

## Не закрыто / для следующего шага

- Minor 2 (хост extension-namespace) и остальные Minor не трогались.
- `specs/frontend-design-spec.md` §5.4 ещё описывает каталог из 16 кодов (таблица UX). Строку `CONFLICT` туда нужно добавить отдельно.
- Round-2 Major 3–5 (90-дневный guard на PATCH, `typeCode` при PATCH, относительные url extension) — вне этого прохода.

## Context Summary

Major 1 и 2 закрыты кодом и тестами. Для 409/412 потребовалось добавить код `CONFLICT` в контракт и фронтенд; это контрактное изменение, которое выбрал пользователь. Все проверенные наборы зелёные, typecheck чистый.

## Next Steps

**Next by flow:** `/code-reviewer` — перепроверить Major 1–2 и новый код `CONFLICT`.

**Alternatives:**
- `/test-generator` — добавить e2e-проверку ответа 409 `CONFLICT` через `ProblemDetailsFilter`.
- `/api-designer` — синхронизировать `frontend-design-spec.md` §5.4 с новым кодом.
