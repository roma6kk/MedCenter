# TASK-003 — Доступ к ПДн пациента по ролям: план реализации

Основание — [architect-pdn-access-decision.md](architect-pdn-access-decision.md) (решения D-1…D-5, нормы N1…N7).
Ветка: `fix/known-gaps` (от `feature/clinic-platform-wip`). Каждая задача — отдельный агент на Sonnet 5.5; после каждой — пауза и отчёт владельцу.
Правила для всех задач: `AGENTS.md`, `.claude/DOD.md`; тест сначала; коммит `feat|fix(<scope>): …` с строкой `Co-Authored-By`; без push; `.env` не читать; демо-пароли не печатать.

## Порядок и зависимости

| # | Задача | Решение | Зависит от | Объём |
|---|---|---|---|---|
| T1 | Закрыть медицинские данные пациента от ADMIN; матрица доступа и ADR-018 в спеках | D-1, D-2, D-5 | — | S |
| T2 | `AuditEvent` на чтение данных пациента | D-3 | T1 (общий код проверки доступа) | M |
| T3 | Дизайн учёта согласия на электронную медкарту (FHIR `Consent`) — только документ | D-4 | — | S (дизайн) |
| T4 | Реализация согласия по итогам T3 | D-4 | T3 + решение владельца | L |

T1 и T3 независимы; T2 начинать после T1. Вопросы из §6 решения (break the glass, роль главврача, срок связи) в эти задачи не входят.

---

## T1 — ADMIN не видит медицинских данных пациента (D-2), матрица в спеках (D-5)

**Зачем.** Ст. 46 Закона «О здравоохранении» (врачебная тайна), ст. 4 и ст. 17 п. 3 Закона № 99-З (соразмерность, минимально необходимый доступ). Администратор медицинскую помощь не оказывает, поэтому диагнозы и назначения ему не нужны.

**Сейчас.** `apps/encounter-service/src/modules/history/history.controller.ts`: `GET patients/:id/history` (7.4) и `GET patients/:id/prescriptions` (7.5) — `@RequiresRoles(PATIENT, DOCTOR, ADMIN)`; проверка компартмента для ADMIN пропускает всех (`apps/encounter-service/src/modules/history/patient-access.service.ts`, аналог в patient-service).

**Шаги.**
1. Тест сначала (encounter-service): ADMIN → 7.4 и 7.5 → **403 `COMPARTMENT_VIOLATION`**; PATIENT (свой) и DOCTOR (со связью) — по-прежнему 200; DOCTOR без связи — 403.
2. Убрать `Role.ADMIN` из `@RequiresRoles` 7.4/7.5 **и** из ветки «ADMIN — любой пациент» в проверке доступа encounter-service (defence in depth: два уровня). patient-service (3.2, 3.3) не менять: идентификация и контакты ADMIN нужны (N7).
3. `tools/stack-smoke/access-matrix.ts` (+ `checks-compartment.ts`, если там ADMIN читает историю): 7.4/7.5 — только PATIENT/DOCTOR. Прогнать `npm run test:tools`.
4. Фронтенд: проверить, что ни один экран ADMIN не вызывает 7.4/7.5 (`grep -rn "/history\|/prescriptions" frontend/src`; страница `/patients/{id}` — зона DOCTOR, `frontend/src/lib/auth/route-guard.ts`). Если ADMIN туда пускается — закрыть в route-guard с тестом.
5. Спеки:
   - `specs/api-designer-spec.md`: в таблице §7 у 7.4/7.5 доступ «владелец / DOCTOR»; в §0 (scope matrix) добавить «Матрица доступа к ПДн» из §5 решения (одна таблица, без повторов) со ссылкой на `tasks/TASK-003/architect-pdn-access-decision.md`.
   - `specs/architect-architecture.md`: **ADR-018 · Доступ к ПДн пациента по ролям (законодательство РБ) · Accepted** — 5–8 строк: контекст (FHIR не задаёт правил), решение D-1/D-2/D-3/D-5, ссылки на нормы N1–N4, N7; ADR-013 не дублировать — сослаться.
   - Строка в `specs/MANIFEST.md`, если там перечислены ADR.
6. Проверки: `npx nx run-many -t test lint build -p encounter-service --parallel=1`; `npm run test:tools`; `cd frontend && npx tsc --noEmit && npx next lint && npx jest`.
7. Живая проверка: `docker compose up -d --build encounter-service && npm run stack:wait`; под `admin.demo@medcenter.test` 7.4/7.5 → 403, под `doctor.ivanova@medcenter.test` для пациента с общей записью → 200; `npm run smoke:stack` зелёный.
8. Коммит: `fix(encounter): keep a patient's medical record from administrators`.

**Готово, когда:** ADMIN получает 403 на 7.4/7.5 на стенде, smoke и все тесты зелёные, ADR-018 и матрица в спеках.

---

## T2 — `AuditEvent` на чтение данных пациента (D-3)

**Зачем.** Ст. 8 Закона № 99-З (меры защиты специальных ПДн), ст. 17 п. 3 (контроль порядка доступа), FHIR Security §Audit.

**Шаги (кратко, детализировать перед стартом).**
1. Где писать: patient-service (3.2, 3.3) и encounter-service (7.4, 7.5) — только для DOCTOR/ADMIN (пациент о себе — не пишем, решение согласовать). `AuditEvent`: `type=rest`, `action=R`, `subtype=read|search-type`, `agent` = пользователь из JWT, `entity` = `Patient/{id}`, `outcome` 0 или 4 (отказ 403), `requestId` как у существующих событий (ADR-014, общий билдер в `libs/`).
2. Не блокировать ответ: запись аудита — после ответа или с таймаутом; сбой аудита логируется (решить с владельцем: fail-open или fail-closed).
3. Журнал аудита в админке показывает действие «Чтение» (ключи i18n ru/en).
4. Тесты, спека (ADR-014 дополнить, не дублировать), smoke.

---

## T3 — Дизайн учёта согласия на электронную медкарту (D-4), только документ

**Зачем.** Ст. 18 Закона «О здравоохранении», постановление Минздрава № 74 (2021): письменное согласие до внесения данных в электронную медкарту; постановление № 75 (2021).

**Результат:** `tasks/TASK-003/brainstorming-consent-design.md` с вариантами:
- модель FHIR R4 `Consent` (scope `patient-privacy`/`treatment`, category, `patient`, `dateTime`, `policyRule`, отзыв — `status=inactive`);
- где фиксируется (регистрация, первый визит, админ), кто вносит, как отзывается;
- что блокируется без согласия (completion 7.3? запись 6.1?) и что остаётся на «бумаге» — **вопрос владельцу**;
- влияние на демо-данные (засев согласий) и smoke.
Без кода. Отчёт и вопросы — владельцу.

---

## T4 — Реализация согласия

Планируется после утверждения T3.
