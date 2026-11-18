# TASK-008 — analytics + tools: progress

## Q35 — report 9.3 «Прочие услуги» (0071bce4)
- Репозиторий отдаёт все услуги периода, сервис режет топ-N, `others` = записи остальных, `total` = группы + `others`. Фронт: строка «Прочие услуги» в таблице, доли от `total` периода. Bruno и §9.3 спецификации обновлены; smoke-форму 9.3 не фиксирует.
- docs/pz, вероятно, устарело: описание отчёта 9.3 (итог и доли от показанных топ-N), скриншоты таблицы услуг.

## Q41 — второй терапевт в сиде (428b51aa)
- Врач `smirnova` (Смирнова Ольга Игоревна), новый кабинет `room-102`, расписание `smirnova-primary` на `ter-primary`, пн–пт 14:00–18:00. Фото: сгенерированная заглушка 128x128 `frontend/public/demo-photos/doctors/smirnova.jpg` (инициалы). Учётная запись врача создаётся через DOCTORS автоматически (`doctor.smirnova`).
- Тесты сида обновлены (врачей 5, кабинетов 6, расписаний 7, слотов 484, аккаунтов на 1 больше); добавлены проверки «два врача у ter-primary» и «нет пересечения по кабинету».
- e2e `frontend/e2e`: предположений о числе врачей нет (`findFreeSlot` выбирает врача динамически).
- docs/pz, вероятно, устарело: число врачей/кабинетов/расписаний в демо-данных, скриншоты каталога врачей.
- На живом стеке нужно `npm run seed:demo` (и `-- --users` для аккаунта Смирновой); не запускал.

## Q42 — флаг `--visits` (2457366f)
- `tools/demo-seed/demo-visits.ts`: для patient.kuznetsov одна будущая запись (первый свободный слот ivanova-primary, слот становится busy) и один завершённый приём 3 дня назад (Appointment fulfilled, Encounter finished, Condition J06.9, ClinicalImpression, CarePlan, MedicationRequest N02BE01). Ресурсы строятся мапперами encounter-service и appointment-service; события booked/completed кладутся в outbox, чтобы аналитика их прочитала. Идемпотентно (детерминированные id, пропуск при наличии). Порядок флагов в README: `--users --consents`, затем `--visits`.
- Не проверено на живом HAPI (запись в стек не выполнялась): транзакция с перекрёстными ссылками Encounter/Condition проверена только на фейке.
- docs/pz, вероятно, устарело: перечень флагов сида, описание наполнения демо-данных.

## Q40 — CI (коммит см. git log, `ci: lint, typecheck...`)
- `.github/workflows/ci.yml`: backend (lint, typecheck, npm test, test:tools, lint:tools) и frontend (tsc, lint, jest). Без Docker и секретов; упоминание в README.
- Локально прогнаны lint (17 проектов) и typecheck — успешно; полный `npm test` не дождался (память), по проектам analytics-service 261 тест прошёл раньше.
- docs/pz: возможно, описание проверок/CI.
