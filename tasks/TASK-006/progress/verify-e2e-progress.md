# verify-e2e progress (2026-11-05)

Start: 52 passed, 7 failed, 5 did not run. End: 64/64 passed (full run, 44.9 s). All fixes in 4bfe3b4 (test-only, no image rebuilt).

1. b | frontend/e2e/admin-schedule.spec.ts:195 | row matched as `28.12 – 30.12.2026` (compact same-year horizon, 050fb31); footer «Закрыть» vs corner cross (strict mode); follow-up :225 doctor schedule read from the week calendar (050fb31) | 4bfe3b4
2. b | frontend/e2e/auth-login.spec.ts:41 | toggle name stays «Показать пароль», aria-pressed carries state (d9bd4e8) | 4bfe3b4
3. b | frontend/e2e/auth-login.spec.ts:157 (doctor) | «Выйти» lives in the staff profile menu (050fb31) | 4bfe3b4
4. b | frontend/e2e/auth-login.spec.ts:157 (admin) | same as 3 | 4bfe3b4
5. b | frontend/e2e/booking-conflict.spec.ts:55 | doctor page shows one service and one day: revealSlotOnDoctorPage presses the slot's service chip + day chip (dca5349, C6 chips/day strip) | 4bfe3b4
6. b | frontend/e2e/booking-flow.spec.ts:21 | card name is family-given-patronymic (b7df9b2); slot revealed as in 5; wizard ends on success screen (0ac4f99) | 4bfe3b4
7. b | frontend/e2e/doctor-encounter.spec.ts:86 | «Приём не на сегодня» confirm dialog (bc90cb7) → «Начать сейчас»; record prints «36,6 °C» (b40af95 i18n-04) | 4bfe3b4

No 429 seen: specs reuse sessions saved by auth.setup.ts, so logins stay few.
