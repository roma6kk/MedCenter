# Код-ревью: правки живого стенда (diff 20795ce..рабочее дерево)

Дата: 2026-10-15. Ветка: `feature/clinic-platform-wip`. Скилл: `code-reviewer`. Файлы исходников не менялись.

Объём: `git diff 20795ce -- . ':!tasks'` (58 файлов, +867/-498) и неотслеживаемые файлы агента стенда:
`tools/stack-smoke/**` (37 файлов), `tools/demo-seed/demo-admin-grant*.ts`, `libs/common/src/lib/idempotency/**`,
`libs/common/src/lib/pipes/validation.pipe.spec.ts`, `apps/catalog-service/src/modules/schedules/{schedule-overlap,schedule-removal}*.ts`,
`schedules.controller.spec.ts`, `cache/idempotency-store.provider.ts`, `docs/api/capability-statement.json`,
локальный `docker-compose.override.yml`. Файл `.env` не читался; `.env.example` и `.env.services` не открывались.

## Итог

Вердикт: **request-changes** (критичных замечаний нет; 3 существенных, остальные мелкие).

Исправления интеграционных дефектов в основном настоящие, корневые: ослабленных тестов нет, тесты, наоборот, ужесточены
(`it.failing` -> `it.each`, `>= 400` -> `toBe(401)` + `errorCode`, `it.skip` -> `it`). Секреты в коде и в выводе набора не
обнаружены, авторизация и compartment не ослаблены. Существенные замечания: (1) каскадное удаление расписания,
вероятно, не работает для слотов, на которые ссылаются отменённые записи (корневая причина дефекта 9 закрыта не до конца);
(2) проверка «неверная роль -> 403» в смоуке не изолирует RoleGuard, поэтому утверждение о покрытии ролей сильнее фактического;
(3) формулировка «система работает сквозным образом» верна для API, но не для веб-клиента (вход в браузере сломан,
фронтенд ходит по несуществующим путям), смоук этого не видит.

Счётчики: critical 0, major 3, minor 12, nit 3.

## Существенные замечания (Major)

### M1. Каскадное удаление расписания падает на слотах, связанных с отменёнными записями
`apps/catalog-service/src/modules/schedules/schedule-removal.ts:23-47` (`deleteFreeSlots`).

`cancel` в appointment-service переводит запись в `cancelled`, а слот возвращает в `free`, но поле `Appointment.slot` остаётся
(проверено read-only запросом к HAPI: отменённые Appointment 1511, 1517, 1552 по-прежнему ссылаются на свои Slot).
`deleteFreeSlots` удаляет все `free`-слоты батчем. HAPI по умолчанию проверяет ссылочную целостность при удалении (сам агент
описывает это в дефекте 9 для Schedule), поэтому `DELETE Slot/{id}` для слота с отменённой записью, вероятно, вернёт 409 в
записи батча. Код это превращает в `502 INTERNAL` (стр. 38-40) уже после того, как остальные слоты батча удалены (батч не
атомарен). Повторный вызов даёт тот же 502: расписание, по которому хоть раз бронировали и отменяли, администратор удалить не
может. Смоук этого не ловит: каскадное удаление проверяется только на свежесозданном расписании без записей, а сценарий
«бронь -> отмена -> удаление расписания» отсутствует. Статус: PLAUSIBLE, вживую не воспроизводил, чтобы не менять демо-данные.

Рекомендация: для слотов, на которые есть ссылки, ставить `status: entered-in-error` (или деактивировать Schedule: `active=false`)
вместо физического удаления; добавить unit-тест (batch с 409 на слот) и шаг смоука «бронь -> отмена -> DELETE schedule cascade:true».

### M2. Проверка «неверная роль -> 403» не изолирует RoleGuard
`tools/stack-smoke/checks-access.ts:7,40-55`, `tools/stack-smoke/access-matrix.ts:84-90`.

`wrongRoleFor` всегда берёт первую из `PATIENT, DOCTOR, ADMIN`, не входящую в список (для admin-, staff- и doctor-маршрутов это
PATIENT, для patient-маршрутов DOCTOR), а `FORBIDDEN_CODES` принимает и `FORBIDDEN_ROLE`, и `FORBIDDEN_SCOPE`. Токен PATIENT не
имеет `user/*`, токен DOCTOR не имеет `patient/*`, значит на маршрутах с `@RequiresScopes` отказ даёт SCOPE, а не ROLE. RoleGuard по
умолчанию пропускает маршрут без `@RequiresRoles` (`libs/common/src/lib/guards/role.guard.ts`, `return true`), а у DOCTOR и ADMIN
одинаковые scope `user/*.read/write`. Если на admin-маршруте со `@RequiresScopes` потеряют `@RequiresRoles(Role.ADMIN)`, врач
получит админский доступ, а смоук останется зелёным. Пара «DOCTOR на admin-маршрутах» и «ADMIN на doctor-маршрутах (encounters,
noshow)» нигде не проверяется. Отчёт утверждает «403 неверной роли на 43 ролевых маршрутах»; это верно только в слабом смысле.

Рекомендация: для admin-маршрутов проверять DOCTOR и требовать ровно `FORBIDDEN_ROLE`; для doctor-маршрутов проверять ADMIN;
PATIENT оставить как дополнительную пробу со ссылкой на FORBIDDEN_SCOPE/ROLE.

### M3. «Работает сквозным образом» верно для API, не для веб-клиента
`tasks/TASK-001/verify-live-stack-report.md` §7 (сам агент это описал), `frontend/` не менялся.

Вход в браузере не работает (`redirect_uri` строится из `0.0.0.0:3000`, `auth-service` отвечает 400), фронтенд обращается к путям,
которых нет у сервисов (`/admin/rooms`, `/me/appointments`, `/me/notifications`, `/schedules/{id}/slots`), формы шлют тела не по
контракту. Набор «PKCE login» подменяет браузер скриптом с фиксированным `redirect_uri`, поэтому реальный пользовательский путь не
покрыт. Агент честно вынес это в открытые вопросы; замечание в том, что итоговая формулировка «вся система работает» не должна
использоваться как критерий закрытия WF-6 без фронтенд-прохода.

## Мелкие замечания (Minor)

1. **Семантика `cascade` отличается от текста спеки.** Спека §5.2.4: `cascade:true` -> 204. Теперь `cascade:true` при busy-слотах
   даёт 409 `SCHEDULE_IN_USE` (раньше в unit-тесте ожидалось удаление, а в реальности HAPI давал 409 CONFLICT). Решение разумное
   (busy = живая запись, BR-001), но отчёт §6.3 описывает только «любые слоты при cascade:false». Спеку и отчёт нужно привести к
   факту (DoD Full: «Specs updated»). Туда же: отказ от `@IsUUID()` в `create-schedule.dto.ts` записан только в отчёте.
   Альтернатива без отклонения от спеки: создавать комнаты и услуги через `PUT` с клиентским UUID.
2. **Сид по умолчанию создаёт постоянного ADMIN.** `tools/demo-seed/seed-demo-users.ts:74`, `demo-catalog.ts:142`. Раньше `--users`
   создавал только врачей и пациентов. Пароль случайный (CSPRNG, `demo-credentials.ts`) и лежит только в gitignored манифесте, но нет
   ни opt-in флага, ни проверки, что `SEED_AUTH_BASE_URL` локальный. Один запуск против общего стенда оставит привилегированную
   учётку с предсказуемым email. Аналогично `smoke:stack` через `SMOKE_BASE_URL` создаёт пользователей, удаляет с cascade и
   импортирует терминологию без охранной проверки хоста.
3. **Уборка тестовых учёток только на «счастливом пути».** `tools/stack-smoke/checks-auth.ts:97-103`: деактивация идёт последними
   шагами `runner.chain`, при падении раннего шага они пропускаются, учётки `smoke.doctor.*`/`smoke.patient.*` остаются активными.
   Для данных каталога есть `removeLeftovers`, для пользователей нет; фраза «run leaves no active test account» неверна при падении.
4. **Пароль тестовых учёток через `Math.random`** (`checks-auth.ts:8`, один пароль на обе учётки, вычисляется при загрузке модуля).
   Для тестовых учёток терпимо, но на любом не-локальном стенде нужен `crypto.randomBytes`.
5. **`describe()` печатает до 240 символов тела любого ответа** (`smoke-assert.ts:11-16`), в том числе 2xx с ПДн (имена, email) при
   неожиданном статусе; комментарий «error bodies carry no secrets» верен только для ошибок. Рекомендуется печатать только
   `errorCode`/`detail` для problem+json и обрезать остальное. Токены и пароли набором не печатаются: проверено по всем
   `console.*` в `tools/stack-smoke` (только строка статуса, email и причина проверки).
6. **`ApiClient.request` без таймаута** (`smoke-http.ts:50`): зависший ответ подвесит весь набор; нужен `AbortSignal.timeout`.
7. **Golden Principles в тронутом старом коде** (прогнан ad-hoc ESLint по 99 изменённым и новым ts-файлам с правилами
   `max-lines 300`, `max-lines-per-function 30`, `no-explicit-any`, `no-non-null-assertion`): новый код набора чист, но
   `libs/fhir/src/lib/fhir-client.provider.ts:123` (`HttpClient.request`) 60 строк (было 54, +6 в этом diff),
   `tools/demo-seed/fake-auth-api.ts:10` (`authService`) 35 строк (+4), `libs/fhir/src/lib/fhir-client.provider.spec.ts` 320 строк.
   Заявление отчёта «ESLint проверил Golden-правила» относится к новому коду набора: в корневом и проектных `.eslintrc.json`
   этих правил нет, `tools/` вообще не линтится nx.
8. **Имена тестов не по шаблону `should ... when ...`:** `jwt-auth.guard.verification-errors.spec.ts` («should not leak the reason of
   the rejection in the 401 body», «should let an error that is not a jose rejection surface as a server error») и
   `schedules.service.remove.spec.ts` («should keep the cache when the removal is refused») не содержат условия `when`.
   Придирка, но правило Golden Principles явное. Заодно в `schedules.service.remove.spec.ts` пропала проверка, что при отказе
   `fhirClient.delete` не вызывается (её держит только e2e), и проверка принадлежности кода к каталогу `ERROR_CODES`.
9. **`notifications.controller.ts`: CRLF -> LF.** Весь файл в diff (61/61) при реальном изменении 2/2 строк (`git diff
   --ignore-space-at-eol`). Плюс: локальные `MAX_PAGE_SIZE`/`DEFAULT_PAGE_SIZE` дублируют константы `@medcenter/contracts`;
   `page` не ограничен (`Number.MAX_SAFE_INTEGER`), тогда как catalog теперь режет `page <= 1000`, чтобы не гнать HAPI в
   гигантский `_offset`; `totalItems = result.total ?? items.length` не учитывает смещение (в catalog fallback точнее).
10. **`Cache-Control: no-cache` на каждом GET** (`libs/fhir/src/lib/fhir-client.provider.ts:132`). Диагноз верный (HAPI держит
    результаты поиска 60 с), заголовок корректный способ обхода, но широкий: отключает кэш поиска и там, где свежесть не нужна.
    Альтернатива: серверная настройка `reuse_cached_search_results_millis` у HAPI или заголовок только у проверок «существует
    ли». Остаток: два параллельных `POST /encounters` оба пройдут предварительный поиск, условное создание вернёт один Encounter,
    но `AuditEvent(create)` запишется дважды; исправление лечит устаревший кэш, а не гонку.
11. **`ProblemDetailsFilter` пропускает `details` для любого HttpException** (`problem-details.filter.ts:92,106-117`), а контракт
    `ProblemDetails.details` описан как «VALIDATION_ERROR only». Достаточно ограничить по `errorCode`.
12. **Новое, но почти мёртвое и без теста:** `MemoryIdempotencyStore` и провайдер
    (`apps/catalog-service/src/modules/cache/idempotency-store.provider.ts`): `main.ts` не стартует без `REDIS_URL`, значит запасная ветка
    достижима только в тестах; Map без вытеснения; отдельного spec нет. Также `RedisCacheStore` отдаёт ошибки Redis наверх (в
    отличие от `RedisCacheService`, который деградирует в miss): при сбое Redis `generate` с ключом даст 500 уже после выполнения.
    Сам `IdempotencyService` перенесён без изменений и по-прежнему неатомарен (get -> run -> set), что для `generate` безвредно.

## Придирки (Nit)

- `REQUEST_ID_TYPE` теперь скопирован в трёх сервисах (encounter, appointment, auth): место для общей константы в `libs`.
- `schedule-removal.ts`: каждый раунд тянет полные ресурсы Slot (до 200), нужен `_elements=id`; до 200 последовательных batch-запросов
  в синхронном HTTP-запросе.
- Устаревшие записи (созданные до исправления) остаются с `doctorId: ''`: Practitioner добавляется только при новых бронях; на
  пути брони появился ещё один FHIR-read (`PractitionerRole`). Для стенда с нуля безвредно.

## Ответы на фокусные вопросы

**Корневые исправления или обходы?** Корневые: дефекты 1 (маппинг кодов jose, JWKS-сбой остаётся 5xx), 2 (exceptionFactory), 3 (HAPI
search cache), 4, 5, 6 (`_getpagesoffset` не параметр поиска; `_offset` проверен read-only на HAPI: смещения 0/1/2 дают разные
записи, total=25), 8, 10, 11. Частично: дефект 9 (см. M1), дефект 7 (ослабление валидации под ids HAPI вместо UUID, это осознанное
отклонение от спеки). Дефект 13 (реестр OAuth в `.env`) обойдён локальным `docker-compose.override.yml`: файл без секретов
(clientId, redirect_uri, scopes), в `.gitignore`, `environment` перекрывает `env_file`; обход честно описан в шапке compose и в
отчёте. Побочный эффект: смоук проходит только на этой машине, пока владелец не исправит `.env`; помечено как действие владельца.
Подмены или ослабления тестов не найдены. Единственное «переворачивание» ожидания: busy + `cascade:true` теперь 409 (см. Minor 1),
оно подтверждено e2e и `schedule-removal.spec.ts`.

**Безопасность.** Секретов в коде, логах и выводе нет: пароли только в `tools/demo-seed/output/` (gitignored, проверено
`git check-ignore`), пароли генерируются через `randomInt`, не печатаются, текст ошибок OAuth содержит только статус и обрезанный
ответ сервера. Guard не раскрывает причину отказа (причина только в debug-логе, тест на это есть), нераспознанные ошибки не
превращаются в 401. `X-Request-Id` в AuditEvent проходит через `REQUEST_ID_PATTERN` (`[A-Za-z0-9._-]{1,128}`): инъекция невозможна.
Compartment и роли не ослаблены; добавленный participant `Practitioner/*` в Appointment потребителями (encounter-access,
patient-access) не интерпретируется по порядку. Новые поверхности: постоянный демо-ADMIN в сиде (Minor 2), смоук без охранной
проверки хоста (Minor 2), 1,9 МБ `docs/api/capability-statement.json` с `implementation.url=http://localhost:8080/fhir` (можно
коммитить, но лучше минифицировать или заменить URL).

**Корректность смоука.** Сильные места: код выхода 1 при любом FAIL и SKIP; перечень маршрутов (55) выводится из исходников
контроллеров, независимый подсчёт декораторов даёт то же число (67 всего, минус 5 health и 7 не-`/api/v1`); unit-тесты сверяют
матрицу доступа с инвентарём в обе стороны; гонка BR-001 требует ровно один 201 и один 409; повтор с `Idempotency-Key` сравнивается
побайтно; проверка «ровно один create-аудит приёма» реально ловит дефект 3; уборка тестовых комнат, услуг и расписаний работает и
при падении. Слабые места: M2; «114 проверок» включают агрегированные (401 на 49 маршрутах считается одной проверкой); 2xx в
покрытии маршрутов засчитывается от любого вызова, включая пробы; нет проверки страницы 2 для `/notifications` и
`/admin/schedules` (симптом дефекта 6 не доказан вживую, только именем параметра в unit-тесте); не покрыт сценарий M1; интервал
опроса аудита может принять первое событие раньше дубля (маловероятно, события пишутся одним батчем).

## Положительное

- Корневая диагностика и честный отчёт (включая открытые вопросы и отклонения от спеки).
- Тесты ужесточены, а не ослаблены; e2e пяти сервисов закреплены на 401 + `errorCode`; добавлены тесты на отсутствие утечки причины.
- `schedule-overlap.ts` и `schedule-removal.ts` выделены в маленькие функции с пояснениями; `horizonsIntersect` корректно трактует открытые границы.
- Идемпотентность вынесена в `libs/common` без дублирования, ключ привязан к пользователю и расписанию, отпечаток тела отвергает повтор с другим телом.
- Смоук использует только публичный edge Traefik, пароли не печатаются, роли берутся из реального PKCE-потока.

## Верификация (DoD, Standard)

| Проверка | Результат |
| --- | --- |
| `npx jest tools/stack-smoke tools/demo-seed` | 23 сьюта, 273 теста, зелёные |
| `npx nx run-many -t test -p common,fhir,contracts` | 31 тест, зелёные |
| `npx nx run-many -t test -p catalog-service,notification-service,appointment-service,encounter-service` | 142 + 242 + 96 + 75 тестов, зелёные |
| `npx tsc --noEmit -p tools/tsconfig.json` | без ошибок |
| Ad-hoc ESLint (Golden) по 99 изменённым/новым `.ts` | 2 нарушения в нетестовом коде (оба в старых функциях) и 1 в spec, см. Minor 7 |
| TODO/FIXME/HACK в новом коде | не найдено |
| Живой read-only контроль HAPI (`_offset`, ссылки отменённых Appointment на Slot) | выполнен, см. M1 и «Корневые» |
| `nx e2e`, `nx build`, `lint` всех проектов, живой `npm run smoke:stack` | не перезапускались (расходуют слоты и создают данные); взяты из отчёта стенда |

## Для orchestrator: коммит

В рабочем дереве есть файлы, не относящиеся к этой работе, их нельзя добавлять через `git add -A`:
`**For` (пустой файл), PDF и docx методички, `labs/`, `.claude/settings.local.json`, а также изменённые ранее
`.claude/skills/agent-browser/SKILL.md` и `.clinerules/skills/SKILL FLOW.md` (в последнем опечатка `# ..Skill Flow Reference`).
Добавлять по путям: `libs/**`, `apps/**`, `tools/**` (без `tools/demo-seed/output/`), `package.json`, `.gitignore`,
`docker-compose.yml`, `docs/api/capability-statement.json` (по решению), `tasks/TASK-001/*live-stack*`.
`docker-compose.override.yml` в `.gitignore`, не коммитится.

### Context Summary

Исправления живого стенда в целом корневые и покрыты тестами (ослабленных тестов нет, секреты не утекают), но каскадное удаление
расписаний вероятно ломается на слотах отменённых записей, проверка ролей в смоуке не изолирует RoleGuard, а «сквозная работа» не
распространяется на веб-клиент. Итог: 0 critical, 3 major, 12 minor, 3 nit; положительно: корневая диагностика, ужесточённые тесты,
честный отчёт.

### Next Steps

**Next by flow:** `/test-generator [context summary]` - тесты для сценария «бронь -> отмена -> каскадное удаление» и для
изолированной проверки FORBIDDEN_ROLE.

**Alternatives:**
- `/coder [context summary]` - исправить M1 (слоты со ссылками), M2 (пробы DOCTOR/ADMIN), Minor 2-6.
- `/finishing-branch [context summary]` - только после M1-M3 или явного решения владельца принять их как известные.
