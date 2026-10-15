# coder-auth-terminology-report.md

**Skill:** coder (backend) · **Задача плана:** Task 7 — `auth-service`: терминология (чтение + импорт снапшота НСИ) ·
**API:** `specs/api-designer-spec.md` §2.3.1–2.3.4 · **Порт:** 3001 · **Требования:** FR-018, FR-021 ·
**ADR:** 002, 014, 016, 017 · **Дата:** 2026-10-14

> Возобновлённый прогон. Чтение терминологии (2.3.1–2.3.3 и `GET /terminology/expand`) уже лежало на диске
> (работа предыдущего агента, `coder-auth-users-report.md`) и проверено: оно корректно и сохранено. Не хватало
> `POST /api/v1/admin/terminology/import` (2.3.4; «Отклонение 9» того отчёта) и предварительной проверки формы
> кода в `validate`. Оба пункта закрыты в этом прогоне. Пользователи и вход не затрагивались.

## Что реализовано

| # | Эндпоинт | Доступ | Реализация |
| --- | --- | --- | --- |
| 2.3.1 | `GET /api/v1/terminology/value-sets` | `ADMIN` + `user/*.read` | уже было, без изменений |
| 2.3.2 | `GET /api/v1/terminology/value-sets/{url}/$expand` (+ `GET /terminology/expand?system=`) | `user/*.read` | уже было; ключи кэша теперь строятся от константы `EXPANSION_CACHE_PREFIX` |
| 2.3.3 | `GET /api/v1/terminology/validate?system=&code=` | `user/*.read` | **доработано:** для МКБ-10 и АТХ форма кода проверяется `isValidIcd10Code` / `isValidAtcCode` из `libs/terminology` до обращения к HAPI; затем `ValueSet/$validate-code` |
| 2.3.4 | `POST /api/v1/admin/terminology/import` | `ADMIN` + `user/*.write` | **новое:** `202 Accepted`, фоновый импорт снапшота, `409`, `422`, `AuditEvent` |

### Импорт снапшота (2.3.4)

Поток: `AdminTerminologyController` → `TerminologyImportService.start` → (фон) `SnapshotImporter.run`.

1. Тело `{ "snapshotVersion": "1.4.463" }` валидируется `class-validator` (`ImportTerminologyDto`: строка, формат
   номера релиза, до 32 символов). Пустое тело или `latest` — `400 VALIDATION_ERROR`.
2. Версия, которой нет в сервисе, — `422 TERMINOLOGY_NOT_FOUND` (`SNAPSHOT_NOT_BUNDLED` в `detail`, с перечнем доступных).
   В образ вшит один снапшот — релиз НСИ ЦИСЗ `1.4.463` (`SNAPSHOT_VERSION`).
3. Single-flight: `ImportLock` берёт ключ `terminology:import:lock` в Redis (`SET NX EX 1800`) — общий для всех реплик.
   Занят — `409 CONFLICT` (`IMPORT_RUNNING` в `detail`). Без `REDIS_URL` работает блокировка в процессе (локальный запуск).
   Освобождение — Lua compare-and-delete по токену, поэтому истёкшая аренда не снимает чужую новую. Сбой Redis при
   захвате не глотается: импорт, не доказавший свою единственность, не стартует (`500 INTERNAL`).
4. Пишется первый `AuditEvent` (`started`), затем сразу отвечает `202` с телом
   `{ importId, snapshotVersion, status: "ACCEPTED", acceptedAt }`, а импорт идёт фоном.
5. `SnapshotImporter`: сначала CodeSystem, потом ValueSet, каждый — идемпотентный `PUT` по canonical
   (`upsertCanonical`: если canonical уже есть под серверным id — обновляется он, а не создаётся дубль; старая
   `complete`-копия CodeSystem удаляется, потому что HAPI индексирует её в терминологические таблицы). Затем
   `verifySnapshot`: каждый ValueSet отдаёт через `$expand` все коды снапшота и `$validate-code` принимает каждый из
   них (тот же вызов, что делают сервисы, BR-004/BR-009); при устаревшей пред-экспансии HAPI ValueSet пересоздаётся
   (delete + PUT), затем до 6 попыток с паузой 20 с.
6. По окончании (успех и сбой) сбрасывается кэш расширений (`TerminologyCache.deleteByPrefix`), снимается аренда и
   пишется второй `AuditEvent`: `completed` с перечнем записанных `Type/id` либо `failed` (`outcome 8`, `outcomeDesc`
   без URL HAPI и стека: для сбоя HAPI — `HAPI request failed (status N)`). Прогресс — в логе с `importId`.

Статус импорта отдельным эндпоинтом не отдаётся: спека требует «прогресс через логи/событие», событие в
`libs/contracts` не заведено (shared-файл), поэтому используются логи и `AuditEvent`.

### AuditEvent (ADR-014)

`terminology-import-audit.builder.ts`: тот же конверт, что у остальных сервисов (агент — `sub` токена,
`entity` с `XrequestId`, источник `auth-service`). `action: 'U'` + `subtype: update`, а не `E`: журнал аналитики
хранит только create/update/delete (`audit-event.mapper.ts`), событие с `E` в журнале бы не появилось. Снапшот — System
Object с идентификатором `https://api.medcenter.by/sid/terminology-snapshot`; записанные ресурсы стоят первыми
в `entity`. `$validate` на живом HAPI: HTTP 200, только предупреждения (те же, что у общего конверта `XrequestId`).

### Структура (новое и изменённое)

```
src/modules/terminology/import/
  admin-terminology.controller.ts   POST /api/v1/admin/terminology/import, 202
  terminology-import.service.ts     валидация версии, lock, аудит, фоновый запуск, сброс кэша
  snapshot-importer.ts              upsert всех CodeSystem/ValueSet + верификация, ImportSummary
  snapshot-resources.ts             чистые R4-билдеры снапшота (копия tools/terminology-seed/terminology-resources.ts)
  snapshot-verifier.ts              $expand + $validate-code каждого кода, восстановление устаревшей пред-экспансии
  canonical-upsert.ts, expansion-codes.ts
  import-lock.ts                    ImportLock: Redis (SET NX EX + Lua release) и в процессе
  import-errors.ts, dto/            409 / 422 с errorCode из каталога, ImportTerminologyDto, ImportAcceptedDto
  snapshot/*.json                   снапшот (копия tools/terminology-seed/snapshot)
src/modules/audit/terminology-import-audit.builder.ts, audit.service.ts (+recordTerminologyImport)
src/modules/terminology/seeded-value-sets.ts   единый реестр canonical URL (SEEDED_URLS) + hasValidCodeShape
src/modules/terminology/terminology-cache.ts   + deleteByPrefix (Redis SCAN MATCH + DEL, escape glob-символов)
src/modules/terminology/terminology.module.ts  + AuditModule, AdminTerminologyController, SnapshotImporter, IMPORT_LOCK
src/__tests__/infrastructure-fakes.ts          IMPORT_LOCK подменён на in-memory (e2e не ходит в чужой Redis)
README.md                                      раздел «Terminology snapshot import»
```

## Отклонения и решения

1. **Билдеры и JSON снапшота скопированы в приложение.** Образ собирается из `apps/${APP}` и `libs`
   (`infra/docker/nest-service.Dockerfile`, `.dockerignore`), а `@nx/js:tsc` не собирает файлы вне корня проекта, поэтому
   импорт из `tools/` ломает и сборку, и контейнер. Расхождение двух копий ловит `snapshot-resources.spec.ts`: он
   сравнивает `buildCodeSystems/buildValueSets/buildExpansionChecks` приложения с билдерами CLI-сидера через
   относительный импорт (единственное место с `eslint-disable @nx/enforce-module-boundaries`, спека не попадает в образ).
   Правка снапшота = правка в обоих местах, иначе тест красный. Сборка кладёт `snapshot/*.json` в `dist`.
2. **`snapshotVersion` обязан совпасть с вшитым релизом** `1.4.463` (релиз НСИ ЦИСЗ; МКБ-10/АТХ/UCUM внутри
   снапшота имеют версию `2024`). Импорт «любой версии из ЦИСЗ» невозможен: закрытый контур недоступен (R-1), поэтому
   выбирать есть из чего только в пределах вшитого. Неизвестная версия — `422 TERMINOLOGY_NOT_FOUND`.
3. **Верификация без «ключевых кодов» CLI** (`J06.9` / `J01FA10` / `Cel` через `$expand?filter=`): это демо-проверка
   самого CLI, а не условие корректности импорта. Полнота `$expand` и приём каждого кода `$validate-code` проверяются.
4. **Предпроверка формы кода (2.3.3)** применяется только к МКБ-10 и АТХ; грамматика АТХ из `libs/terminology` —
   уровни 4–5 (`J01F`, `J01FA10`), поэтому код третьего уровня (`J01`) даёт `valid:false` без обращения к HAPI, как и
   в остальных сервисах. Все коды вшитого снапшота проходят обе проверки. UCUM и номера НСИ формы не имеют.
5. **Поиск canonical в HAPI** идёт через `FhirClient.search`, который не шлёт `Cache-Control: no-cache`, в отличие
   от CLI. Повторный импорт в пределах минуты может получить закэшированный результат поиска; для идемпотентного
   `PUT` по детерминированному id это безвредно (дубль не создаётся), риск остаётся только при ручных дублях canonical.
6. **Аренда блокировки 30 минут** (худший случай верификации: 5 ValueSet × 6 попыток × 20 с = 10 мин, с запасом).
   Продления аренды нет; импорт дольше 30 минут не предусмотрен.

## Расхождения с фронтендом

- `frontend/src/components/admin/terminology-import-panel.tsx` шлёт `POST /api/v1/admin/terminology/import` с телом `{}`.
  Спека требует `{ "snapshotVersion": "1.4.463" }`, поэтому сервис отвечает `400 VALIDATION_ERROR`; обработчик панели
  понимает только `409` и при `400` ничего не покажет. Следуем спеке, `frontend/` не менялся. Исправление на стороне
  клиента: `body: JSON.stringify({ snapshotVersion: '1.4.463' })`. Ответ `202` панель не читает, `409` обрабатывает.
- Остальное совпадает: `Icd10Combobox` вызывает `GET /terminology/expand?system=<ValueSet>&filter=` и читает
  `items[{code, display}]`; `atc-code-field` и `ucum-unit-select` в API терминологии не ходят.

## Проверки

Все команды из корня репозитория, реальные результаты:

| Проверка | Команда | Результат |
| --- | --- | --- |
| Unit | `npx nx test auth-service --maxWorkers=2 --skip-nx-cache` | `Test Suites: 2 skipped, 46 passed, 46 of 48 total` · `Tests: 12 skipped, 426 passed, 438 total` (2 пропущенных набора — интеграция с PostgreSQL, без БД не запускаются) |
| E2E | `npx nx e2e auth-service --skip-nx-cache` | `Test Suites: 1 skipped, 8 passed, 8 of 9 total` · `Tests: 5 skipped, 113 passed, 118 total` (пропущен `postgres-flow`) |
| Lint | `npx nx lint auth-service` | `All files pass linting` |
| Build | `npx nx build auth-service --skip-nx-cache` | `Successfully ran target build` |
| Typecheck | `tsc --noEmit -p apps/auth-service/tsconfig.app.json` и `tsconfig.spec.json` | оба кода выхода 0, ошибок нет |

Новые тесты: `snapshot-resources` (паритет с CLI), `canonical-upsert`, `snapshot-verifier`, `snapshot-importer`,
`import-lock`, `terminology-import.service`, `terminology-import-audit`, дополнения `terminology-cache` (sweep по
префиксу) и `terminology.service` (предпроверка формы), e2e `terminology-import.e2e-spec.ts`: 401, 403
`FORBIDDEN_SCOPE`/`FORBIDDEN_ROLE`, 400 на четырёх неверных телах, 422, 202 с публикацией 9 ресурсов, чтение
импортированного ValueSet через `GET /terminology/expand`, два `AuditEvent` (`outcome 0`/`0`, и `0`/`8` при сбое HAPI),
`409` во время работающего импорта и повторный `202` после него. Тестовая подмена HAPI — stateful
`__tests__/fake-terminology-hapi.ts` (хранит записанное, считает `$expand` и `$validate-code`).

Прогон на реальном локальном HAPI (`localhost:8080`, собранный `dist`, throw-away скрипт вне репозитория):

- До записи построенные ресурсы сравнены с живыми: все 9 canonical совпали (`IDENTICAL`), включая «старые» серверные
  id `CodeSystem/1002` и `ValueSet/1004`.
- `SnapshotImporter.run()` с настоящим `HttpClient`: `created 0 / updated 9`, обновление в пределах существующих id;
  `$expand` вернул 10 / 7 / 17 / 25 / 22 кода, `missing 0`, `rejected 0` у каждого ValueSet. Версии ресурсов в HAPI не
  изменились (`versionId` прежние): повторный импорт — no-op.
- Три варианта `AuditEvent` проверены `AuditEvent/$validate`: HTTP 200, только предупреждения.

Не проверялось: реальный Redis (замок и sweep кэша проверены на fake-клиенте и на in-memory реализациях); два набора
с PostgreSQL (не затронуты изменением, импорт БД не использует).

## Shared-изменения

Нет. Правки только в `apps/auth-service/**` и этот отчёт. `libs/*`, `tools/*`, `frontend/*`, `infra/*`,
`package.json` не менялись; зависимости не добавлялись (`ioredis`, `class-validator` уже в проекте). Маршрут Traefik
`/api/v1/admin/terminology` → auth-service уже был в `infra/traefik/dynamic.yml`.

## Context Summary

Реализован `POST /api/v1/admin/terminology/import` (2.3.4): `202`, фоновый идемпотентный импорт вшитого снапшота НСИ с
верификацией через HAPI, single-flight (Redis NX/EX, `409`), `422` для невшитой версии, два `AuditEvent`, сброс кэша
расширений; в `validate` (2.3.3) добавлена предпроверка формы кода МКБ-10/АТХ. Билдеры снапшота скопированы в приложение
(образ не содержит `tools/`) и защищены тестом паритета. Unit 426 passed, e2e 113 passed, lint/build/typecheck чистые,
импорт проверен на живом HAPI.

## Next Steps

**Next by flow:** `/code-reviewer apps/auth-service (terminology import 2.3.4, snapshot importer, import lock, audit)` —
проверить качество и безопасность реализованного кода.

**Alternatives:**
- `/test-generator` — прогон набора с PostgreSQL и тест замка на реальном Redis.
- `/debugger` — если проверка на стеке (`npm run stack:up`) покажет проблемы.

## Fixes по `code-reviewer-auth-c1-report.md` (раунд 1)

Полный список исправлений и проверок — в разделе «Fixes по `code-reviewer-auth-c1-report.md`» отчёта
`coder-auth-users-report.md`. По терминологии:

- **m-8.** `RedisImportLock.onModuleDestroy` освобождает удерживаемую аренду импорта до закрытия соединения, а `main.ts`
  вызывает `enableShutdownHooks()`: после `SIGTERM` посреди импорта повторный запуск не получает `409 IMPORT_RUNNING` до
  истечения 30 минут (`import-lock.spec.ts`).
- **m-9.** `HAPI 400` из `$expand`/`$validate-code` больше не превращается в `404 NOT_FOUND` или `valid:false`: «неизвестно
  HAPI» означает только `404`/`422`, остальное пробрасывается (`terminology.service.spec.ts`,
  `terminology.service.validate.spec.ts`).
- **n-2, n-5.** Комментарий контроллера соответствует `Cache-Control: private, max-age=300`; усечение поиска по фильтру на
  10 000 понятий пишет предупреждение в лог.
- Спеки сервиса терминологии разбиты на два файла (≤ 300 строк), общие фикстуры — `terminology/__tests__/terminology-fixtures.ts`.
- Проверки после исправлений: unit `55 passed / 526 tests` и e2e `10 passed / 135 tests` на PostgreSQL, без PostgreSQL
  `54 passed + 1 skipped` и `9 passed + 1 skipped`; lint, `tsc` (app + spec) и build зелёные.
