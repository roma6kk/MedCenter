# test-generator: e2e scenarios progress

- Scenario 1 (admin settings, frontend/e2e/admin-settings.spec.ts): passing, 936d929e. Landing read in a fresh context (API sends max-age=60); phone restored in afterEach.
- Scenario 2 (admin appointments, frontend/e2e/admin-appointments.spec.ts): passing, 2c5ebeba. Filters survive reload via URL; appointment cancelled again in afterAll.
- Scenario 3 (admin users, frontend/e2e/admin-users.spec.ts): passing, a9ca1b70. Catalog is cached 5 min per URL (server-fetch revalidate 300), so each look uses a distinct ?search= in a fresh context. Created account stays deactivated (e2e.doctor.<ts>@medcenter.test; one per run).
- Scenario 4 (password, frontend/e2e/password-change.spec.ts): passing, 02bc3d2d. Uses its own throw-away ADMIN account created through the API (e2e.password.<ts>@medcenter.test), deactivated in afterAll; 2 sign-ins; no demo password touched.
- Scenario 5 (doctor cancel encounter, frontend/e2e/doctor-cancel-encounter.spec.ts): passing, 6e2c1412. afterAll cancels the reopened encounter and the appointment.
