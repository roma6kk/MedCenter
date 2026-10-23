# Передача контекста следующему агенту (TASK-001)

Дата передачи: 2026-10-21 (§4, §7, §8 обновлены 2026-10-23). Предыдущий агент — оркестратор, который доводил план `tasks/TASK-001/writing-plans-plan.md` до конца через субагентов и воркфлоу. Этот файл — точка входа: прочитай его целиком, затем [verify-manual-testing-guide.md](verify-manual-testing-guide.md).

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

- **Git.** Ветка `feature/clinic-platform-wip`. Коммит на каждую законченную единицу работы, формат `feat|fix|refactor|test|docs(<scope>): …`. Без строк `Co-Authored-By` и «Generated with …» — владелец запретил любую AI-атрибуцию в коммитах и PR; сообщение заканчивается телом. **Push и PR — только после явного подтверждения пользователя.** Не коммитить: `labs/`, PDF/DOCX в корне, `tmp/`, `frontend/pw-tmp.config.ts`, `.claude/settings.local.json`, пользовательские правки `.claude/skills/agent-browser/SKILL.md` и `.clinerules/skills/SKILL FLOW.md`. Без `--no-verify`, force-push и hard-reset.
- **Docker.** Полный локальный стек разрешён. Чужой контейнер `corporate-redis-cache` (и другие не-`medcenter-*`) не трогать. `docker compose down -v` не запускать — удалит данные.
- **`.env`.** Не читать и не выводить. Единственное разрешённое исключение — посев демо-пользователей без вывода значений: `bash -c 'set -a; . ./.env; set +a; npm run seed:demo -- --users'`. `.env` и `.env.example` правит пользователь сам.
- **Пароли.** Демо-пароли только в git-ignored `tools/demo-seed/output/demo-manifest.json`. Никогда не печатать их в чат, отчёты, тесты или скриншоты. Вводить через подстановку, например `"$(node -p "require('./tools/demo-seed/output/demo-manifest.json').users.accounts.find(a=>a.email==='EMAIL').password")"`.
- **Пояснительная записка** (`docs/pz/medcenter-pz.docx`, Task 21) — не трогать, пока пользователь не попросит. Срок курса 2026-12-15.
- **FHIR.** Только HL7 FHIR R4 International, canonicals `https://fhir.by/...`; бельгийские IG и терминологию не использовать (блокируется хуком).
- **Хук `.claude/hooks/loop-detection.sh`.** Пользователь разрешил его править. Сейчас он считает правки по сессии и агенту, блокирует на 10-й правке файла, файлы `frontend/src/messages/*.json` не учитывает.

## 4. Состояние кода

*Обновлено 2026-10-23.* Работа ведётся в ветке `fix/open-items` (около 25 коммитов поверх `main`, git worktree `.worktrees/open-items`). На GitHub ничего не отправлено. Историческая ветка `feature/clinic-platform-wip` уже слита в `main`.

- **Бэкенд** (M0–M5 готовы): 8 NestJS BFF — auth 3001, practitioner 3002, catalog 3003, patient 3004, appointment 3005, notification 3006, encounter 3007, analytics 3008. Общие библиотеки `libs/{common,config,contracts,fhir,fhir-mappers,terminology,messaging}`. Хранилище клинических данных — HAPI FHIR R4; наружу открыт только `GET /fhir/metadata`.
  - Конкурентные записи — оптимистичные транзакции с `If-Match` (бронирование, открытие и завершение приёма, no-show, отмена); ADR-012 в спеке обновлён.
  - Закрыто в `fix/open-items`: дубль «открывающего» `AuditEvent` (пишет только победитель открытия); `AuditEvent` для услуг, кабинетов и расписаний (логическая ссылка + UUID-id, ADR-020); атомарный идентификатор кабинета (conditional PUT); гонка открытие ∥ no-show/cancel (тег `encounter-opened` на Appointment под `If-Match`); повтор старта аналитики; тестовые зависимости вынесены из образов; повтор `$expand` при 5xx в сиде терминологии; время в уведомлениях по Минску.
- **Фронтенд** `frontend/` (Next.js 15, редизайн «Спокойная клиника», согласие на ЭМК). Клиент использует новые поля API (`specialtyCode`, `practitionerRoleIds`, `status`-фильтр).
- **Тесты и инструменты:** Playwright E2E сценарии A–F и security (`frontend/e2e`, проект `setup`, запуск `E2E_BROWSER_CHANNEL=chrome npx playwright test`); коллекция Bruno `bruno/medcenter-api/`; smoke `npm run smoke:stack` (включает гонку открытия с no-show и журнал аудита).
- **Документация:** спеки сверены с кодом (api-designer-spec: 11 расхождений из Bruno), ADR-012/020, диаграммы `docs/diagrams/*.drawio`, README, CHANGELOG.

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

## 7. Известные недочёты

*Обновлено 2026-10-23.* Полный исторический список — гайд §6.

**Закрыто:**
- ~~Клиент не использует новые поля API (`status`, `specialtyCode`, `practitionerRoleIds`), «Открыть приём»/«Неявка» у `fulfilled`, общий баннер 409~~;
- ~~два параллельных `POST /encounters` пишут два `AuditEvent`~~ (`538f7d2`);
- ~~каталог, кабинеты и расписания не пишут `AuditEvent`~~ (`370cc71`, ADR-020);
- ~~уникальность номера кабинета без защиты от гонки~~ (`ed630c5`);
- ~~время в уведомлениях в UTC~~ (по Минску, в спеке 8);
- ~~тестовые зависимости в runtime-образах~~ (`af029ea`);
- ~~гонка открытие ∥ no-show/cancel~~ (`d86f288`);
- ~~админку после `27d9204` не проходили в браузере~~ — покрыта E2E (`admin-schedule`, `admin-reports`).

**Остаётся открытым:**
- **Transactional outbox** — события теряются, если брокер упал после записи в HAPI; в архитектуре его нет, нужно решение владельца.
- **Healthcheck HAPI** — образ distroless без shell; нужен новый образ (решение владельца).
- **Статус `fulfilled` в аналитике** — read-model не учитывает его как отдельный статус; изменение требует правки спеки (9.1).
- **Демо- и тестовые остатки в HAPI** (`booked`-записи с завершёнными приёмами, ресурсы `E2E-check`, деактивированный `e2e-check.doctor3`) — убираются только expunge (удаление данных, решение владельца); `npm run seed:demo -- --repair` исправляет статусы.
- Хелперы (`MAX_PAGE`, `REQUEST_ID_TYPE`, время клиники) продублированы между сервисами.

## 8. Остаток плана (не начинать без запроса)

*Обновлено 2026-10-23.* Сделано в `fix/open-items`: code review `e13a59c` и адаптация клиента, Playwright E2E (Task 20), Swagger **закрыт** (`a03265e`…`57bb048`: `/api/docs/<service>`, `SWAGGER_ENABLED`, спека §10; итоги врачей `bbe4e5e`) и коллекция Bruno, документация (README, CHANGELOG, MANIFEST, спеки, диаграммы draw.io).

Открыто:
1. **Решения владельца** — transactional outbox, healthcheck HAPI (новый образ), статус `fulfilled` в аналитике (спека), expunge демо/тестовых остатков в HAPI (см. §7).
2. **TASK-004** — задачи T1, T2, T5 (`tasks/TASK-004/`, в git не коммитится).
3. **Bruno CLI в CI** — прогон коллекции `bruno/medcenter-api/` в конвейере (токены через `get-token.mjs`).
4. **Пояснительная записка (ПЗ)** — `docs/pz/medcenter-pz.docx`, Task 21, только по команде пользователя (срок курса 2026-12-15); диаграммы для неё готовы в `docs/diagrams/`.
5. **Финал** — DoD (`.claude/DOD.md`), skill `finishing-branch`, **push и PR — только после подтверждения пользователя**.

Скрипты прошлых воркфлоу (можно взять за образец) лежат в `~/.claude/projects/-mnt-BE48B9DF48B9971D-projs-MedCenter/dc59563e-9984-43f8-9c25-f3dfc920d1da/workflows/scripts/`: `medcenter-frontend-areas-batch.js`, `medcenter-build-only.js`, `medcenter-live-stack.js`.

## 9. Мусор в рабочем дереве

Не удалять без спроса и не коммитить:
- пустой файл `**For` в корне;
- `frontend/pw-tmp.config.ts`;
- `.claude/settings.local.json`;
- изменённые пользователем `.claude/skills/agent-browser/SKILL.md` и `.clinerules/skills/SKILL FLOW.md`.
