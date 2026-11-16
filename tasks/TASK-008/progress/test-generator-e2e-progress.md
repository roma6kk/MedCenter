# test-generator: e2e scenarios progress

- Scenario 1 (admin settings, frontend/e2e/admin-settings.spec.ts): passing, 936d929e. Landing read in a fresh context (API sends max-age=60); phone restored in afterEach.
- Scenario 2 (admin appointments, frontend/e2e/admin-appointments.spec.ts): passing, 2c5ebeba. Filters survive reload via URL; appointment cancelled again in afterAll.
- Scenario 3 (admin users, frontend/e2e/admin-users.spec.ts): passing, a9ca1b70. Catalog is cached 5 min per URL (server-fetch revalidate 300), so each look uses a distinct ?search= in a fresh context. Created account stays deactivated (e2e.doctor.<ts>@medcenter.test; one per run).
