# Передача контекста следующему агенту (TASK-001)

Дата передачи: 2026-10-21. Предыдущий агент — оркестратор, который доводил план `tasks/TASK-001/writing-plans-plan.md` до конца через субагентов и воркфлоу. Этот файл — точка входа: прочитай его целиком, затем [verify-manual-testing-guide.md](verify-manual-testing-guide.md).

## 1. Твоя задача сейчас

Пользователь переходит к **ручному тестированию приложения и исправлению найденных недочётов**. Он будет присылать дефекты; ты находишь причину и исправляешь. Ничего сверх этого без запроса не начинай: ни E2E, ни документацию, ни ревью. Остальной план в §8 — только для понимания контекста.

На каждый дефект:
1. Воспроизведи его на живом стенде (браузер или `curl` через Traefik).
2. Найди корневую причину (skill `systematic-debugger`), догадки не исправляй.
3. Исправь с тестом, который без исправления падает.
4. Прогони проверки (§5) и пройди сценарий в браузере.
5. Закоммить `fix(<scope>): …` (правила в §3).

## 2. Источники истины

| Что | Где |
| --- | --- |
| Политика агентов | `AGENTS.md`, `.claude/DOD.md`, `.claude/GOLDEN-PRINCIPLES.md` |
| План | `tasks/TASK-001/writing-plans-plan.md` (21 задача, M0–M7) |
| API (контракт) | `specs/api-designer-spec.md` — при расхождении фронтенда и бэкенда меняется фронтенд, если бэкенд не нарушает спеку |
| Фронтенд | `specs/frontend-design-spec.md` (маршруты, карта errorCode→UX §5.4, сценарии E2E §6, доступность §7) |
| Архитектура | `specs/architect-architecture.md`, `specs/MANIFEST.md` |
| Стенд, аккаунты, чек-лист | `tasks/TASK-001/verify-manual-testing-guide.md` |
| Отчёты по областям | `coder-frontend-{booking,cabinet,doctor,admin,integration}-report.md`, `coder-backend-gaps-report.md`, `code-reviewer-*`, `browser-verify-*` |

## 3. Решения пользователя (обязательны)

- **Git.** Ветка `feature/clinic-platform-wip`. Коммит на каждую законченную единицу работы, формат `feat|fix|refactor|test|docs(<scope>): …`. В конце сообщения строка `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Push и PR — только после явного подтверждения пользователя.** Не коммитить: `labs/`, PDF/DOCX в корне, `tmp/`, `frontend/pw-tmp.config.ts`, `.claude/settings.local.json`, пользовательские правки `.claude/skills/agent-browser/SKILL.md` и `.clinerules/skills/SKILL FLOW.md`. Без `--no-verify`, force-push и hard-reset.
- **Docker.** Полный локальный стек разрешён. Чужой контейнер `corporate-redis-cache` (и другие не-`medcenter-*`) не трогать. `docker compose down -v` не запускать — удалит данные.
- **`.env`.** Не читать и не выводить. Единственное разрешённое исключение — посев демо-пользователей без вывода значений: `bash -c 'set -a; . ./.env; set +a; npm run seed:demo -- --users'`. `.env` и `.env.example` правит пользователь сам.
- **Пароли.** Демо-пароли только в git-ignored `tools/demo-seed/output/demo-manifest.json`. Никогда не печатать их в чат, отчёты, тесты или скриншоты. Вводить через подстановку, например `"$(node -p "require('./tools/demo-seed/output/demo-manifest.json').users.accounts.find(a=>a.email==='EMAIL').password")"`.
- **Пояснительная записка** (`docs/pz/medcenter-pz.docx`, Task 21) — не трогать, пока пользователь не попросит. Срок курса 2026-12-15.
- **FHIR.** Только HL7 FHIR R4 International, canonicals `https://fhir.by/...`; бельгийские IG и терминологию не использовать (блокируется хуком).
- **Хук `.claude/hooks/loop-detection.sh`.** Пользователь разрешил его править. Сейчас он считает правки по сессии и агенту, блокирует на 10-й правке файла, файлы `frontend/src/messages/*.json` не учитывает.

## 4. Состояние кода

25 коммитов поверх `7aa7866`, последний `e73cbf3`. На GitHub ничего не отправлено.

- **Бэкенд** (M0–M5 готовы): 8 NestJS BFF — auth 3001, practitioner 3002, catalog 3003, patient 3004, appointment 3005, notification 3006, encounter 3007, analytics 3008. Общие библиотеки `libs/{common,config,contracts,fhir,fhir-mappers,terminology,messaging}`.
  - Хранилище клинических данных — HAPI FHIR R4. Наружу открыт только `GET /fhir/metadata`.
  - Конкурентная запись на слот — оптимистичная транзакция с `If-Match` (отклонение от пессимистичной блокировки в ADR-012). Одновременная запись даёт ровно один 201 и один 409 `SLOT_CONFLICT`.
  - Последние правки бэкенда (`e13a59c`) прошли тесты и smoke, но **без code review**.
- **Фронтенд** `frontend/` (Next.js 15; отклонение от `apps/web` принято). Построен на реальном API:
  - ядро — `abb13ee`;
  - кабинет пациента — `570f830`, врач — `89713b4`, каталог и запись — `9112883`, админка — `d90e328`;
  - общие правки — `27d9204`.

  Состояние: TanStack Query + Zustand, собственный i18n `lib/i18n` (`messages/ru.json` и `en.json`, паритет проверяется тестом), время клиники — `lib/clinic-time`, ошибки — `lib/api/error-code-map` и `components/feedback`.
- **Проверки на момент передачи:**
  - фронтенд: `tsc` 0 ошибок, jest 172 набора / 1794 теста, `next lint` чистый;
  - бэкенд: nx test/lint/build зелёные;
  - smoke через Traefik 131/131.

## 5. Как работать со стендом

Запуск после перезагрузки, адреса и аккаунты — в [verify-manual-testing-guide.md](verify-manual-testing-guide.md) §2–3. Важное сверх этого:

- **Dev-сервер.** Запускать только `cd frontend && node node_modules/next/dist/bin/next dev --port 3000 --hostname 127.0.0.1`: хук rtk ломает `npx next dev -p`. Пока работает dev-сервер, не запускать `next build`: они делят каталог `.next`. Production-сборку проверяют через `docker compose build web`.
- **Правка сервиса.** После неё: `docker compose up -d --build <service>`, затем `npm run stack:wait`. Сервис `web` в compose намеренно не запущен.
- **Свободные слоты** кончаются, особенно после `npm run smoke:stack`: дополняет их `npm run seed:demo`, он идемпотентен.
- **Проверки:**
  - фронтенд: `cd frontend && npx tsc --noEmit && npx jest && npx next lint`;
  - бэкенд: `npx nx run-many -t test lint build -p <projects> --parallel=1` (параллельные сборки nx гоняются за `dist/libs`; при сомнении в кэше — `--skip-nx-cache`), затем `npm run smoke:stack`;
  - корень: `npm run typecheck`.
- **Браузер.** Агентский — CLI `agent-browser` (всегда со своим `--session <name>`) или встроенный браузер приложения. Ограничение входа: 10 POST `/oauth/login` в минуту на IP и 10 попыток за 15 минут на аккаунт.
- **Локальный `docker-compose.override.yml`** (git-ignored) подменяет `OAUTH_CLIENTS_JSON`, потому что в `.env` клиенту `medcenter-web` не хватает скоупов `user/*`. Не удалять, пока пользователь не поправит `.env`.

## 6. Уроки прошлой сессии

- **Лимит.** Параллельные агенты быстро выбирали лимит сессии: 4–6 агентов — около 2 млн токенов за 30–40 минут. Работа на диске переживает обрыв, контекст агента — нет. Держать не больше двух агентов одновременно и коммитить законченное между запусками.
- **Сообщения агентам внутри воркфлоу.** `SendMessage` такому агенту запускает его вторую копию, и обе правят одни файлы. Не писать агентам внутри воркфлоу.
- **Общий scratchpad.** Агенты перезаписывали вспомогательные скрипты друг друга и управляли чужими браузерными сессиями. Временные файлы именовать с префиксом своей сессии; скриншоты в корень репозитория не класть.
- **Отчёты ревьюеров.** Агенты-ревьюеры иногда возвращают замечания только в результате, не файлом. Оркестратор восстанавливал отчёты из журнала воркфлоу.
- **Перезагрузки машины.** После перезагрузки контейнеры поднимаются сами, `next dev` нужно запустить заново.

## 7. Известные недочёты, которые всплывут при тестировании

Полный список — гайд §6. Главное:

- **Клиент не использует новые поля API из `e13a59c`:**
  - «Предстоящие» показывает отменённые записи — нужен `?upcoming=true&status=booked`;
  - каталог фильтрует специальность в памяти — есть `specialtyCode` / `specialtySystem`;
  - PractitionerRole в форме админа вводится как id — есть `practitionerRoleIds`;
  - у `fulfilled`-записей в журнале врача могут остаться «Открыть приём» и «Неявка»;
  - 409 `ENCOUNTER_STATE_INVALID` на неявку может показываться общим баннером.

  Пути полей в 422 (`diagnoses.1.code`) уже совпадают с путями формы.
- **Админку после `27d9204` в браузере не проходили.** Для неё есть аккаунт `admin.demo@medcenter.test` с паролем в манифесте.
- **Демо-данные натоптаны агентами:** в журнале Ивановой остались `booked`-записи с уже завершёнными приёмами — созданы до исправления `fulfilled`, сами не исправятся.
- **Недочёты бэкенда:**
  - нет transactional outbox;
  - два параллельных `POST /encounters` пишут два `AuditEvent`;
  - у HAPI нет healthcheck;
  - каталог, кабинеты и расписания не пишут `AuditEvent`;
  - уникальность номера кабинета проверяется без защиты от гонки;
  - в уведомлениях время в UTC;
  - тестовые зависимости попадают в runtime-образы;
  - хелперы (`MAX_PAGE`, `REQUEST_ID_TYPE`, время клиники) продублированы между сервисами.

## 8. Остаток плана (не начинать без запроса)

1. Code review `e13a59c` и адаптация клиента к новым полям API (§7).
2. Playwright E2E, Task 20: сценарии A, A2, B, C, C2, D, E, F и security. В `frontend/e2e` есть только тесты входа (`auth-login.spec.ts`), остальное — `test.fixme`. Для запуска на этой машине нужен установленный Chrome (`channel: 'chrome'`); образец — локальный `frontend/pw-tmp.config.ts`.
3. Swagger (`@nestjs/swagger` не установлен) и коллекция Bruno (API §10–11).
4. Документация: README (запуск), CHANGELOG, MANIFEST, спеки (ADR-012 → оптимистичная блокировка через `If-Match`), диаграммы draw.io.
5. Пояснительная записка — только по команде пользователя.
6. Финальный DoD (`.claude/DOD.md`), skill `finishing-branch`, push и PR — после подтверждения пользователя.

Скрипты прошлых воркфлоу (можно взять за образец) лежат в `~/.claude/projects/-mnt-BE48B9DF48B9971D-projs-MedCenter/dc59563e-9984-43f8-9c25-f3dfc920d1da/workflows/scripts/`: `medcenter-frontend-areas-batch.js` (реализация → ревью ∥ браузер → исправления по областям), `medcenter-build-only.js`, `medcenter-live-stack.js`.

## 9. Мусор в рабочем дереве

Не удалять без спроса и не коммитить:
- пустой файл `**For` в корне;
- `frontend/pw-tmp.config.ts`;
- `.claude/settings.local.json`;
- изменённые пользователем `.claude/skills/agent-browser/SKILL.md` и `.clinerules/skills/SKILL FLOW.md`.
