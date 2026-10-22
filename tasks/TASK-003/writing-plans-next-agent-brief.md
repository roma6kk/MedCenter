# Бриф агенту: TASK-003 / T1 — администратор не видит медицинских данных пациента

Модель: **Sonnet 5.5**. Репозиторий `/mnt/BE48B9DF48B9971D/projs/MedCenter`, ветка `fix/known-gaps` (уже активна, не переключать). Выполни только T1 и остановись.

## Прочитай сначала
1. `AGENTS.md` (политика; ей подчиняться).
2. `tasks/TASK-003/architect-pdn-access-decision.md` — решения D-1, D-2, D-5 и нормы N1–N7 (ст. 46 Закона «О здравоохранении», ст. 4, 8, 17 Закона № 99-З).
3. `tasks/TASK-003/writing-plans-plan.md`, раздел **T1** — пошаговый план; выполняй его шаги 1–8.

## Суть
`GET /api/v1/patients/{id}/history` (7.4) и `GET /api/v1/patients/{id}/prescriptions` (7.5) в encounter-service сейчас доступны ADMIN для любого пациента. Нужно: ADMIN → 403 `COMPARTMENT_VIOLATION` на обоих (на уровне `@RequiresRoles` **и** в проверке компартмента). PATIENT (свои) и DOCTOR (с общей записью/приёмом) — без изменений. patient-service (3.2, 3.3) не трогать. Обновить smoke-матрицу доступа, спеку API (доступ 7.4/7.5 + матрица ПДн в §0) и добавить ADR-018 в `specs/architect-architecture.md` со ссылками на статьи из решения (без дублирования ADR-013).

## Как работать
- Тест сначала: покажи, что новый тест падает без исправления, затем исправь.
- Проверки (все зелёные): `npx nx run-many -t test lint build -p encounter-service --parallel=1`; `npm run test:tools`; `cd frontend && npx tsc --noEmit && npx next lint && npx jest`.
- Живая проверка: `docker compose up -d --build encounter-service && npm run stack:wait`, затем `npm run smoke:stack`. Вспомогательные скрипты в `/tmp/claude-1000/-mnt-BE48B9DF48B9971D-projs-MedCenter/fba8df8c-3072-4fb5-90f4-1a101acba281/scratchpad/kg/` (запускать из этой папки): `node login.js <email> <state.json>` (вход, пароль не печатает), `node api.js <state.json> GET <path>`. Новые файлы там называй с префиксом `t1-`. Учётки: `admin.demo@medcenter.test`, `doctor.ivanova@medcenter.test`, `patient.kuznetsov@medcenter.test` (у Кузнецова завершённые приёмы с Ивановой; его FHIR id узнай через `node api.js <state> GET /api/v1/me` или `/api/v1/me/patient`).
- Next dev-сервер уже работает на :3000 — не запускать и не останавливать, никогда `pkill -f next-server`.
- Один коммит: `fix(encounter): keep a patient's medical record from administrators`, тело — 2–4 строки со ссылкой на ADR-018, последняя строка `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. `git add` только своих файлов (не `labs/`, PDF/DOCX в корне, `tmp/`, `frontend/pw-tmp.config.ts`, `.claude/settings.local.json`, `**For`). Без `--no-verify`, без push.

## Запреты
Не читать `.env*`, `secrets/`; не печатать демо-пароли; без `rm -rf`, `sudo`, force-push, hard-reset, `docker compose down -v`; не трогать чужие контейнеры. FHIR — только HL7 R4 International, без бельгийских IG.
Вне объёма (только упомянуть в отчёте): T2 (аудит чтения), T3/T4 (согласие), вопросы §6 решения.

## Отчёт (коротко)
Причина и изменения по файлам; доказательство «тест падал → проходит»; счётчики тестов; результат живой проверки и smoke; хэш коммита; что заметил, но не трогал.
