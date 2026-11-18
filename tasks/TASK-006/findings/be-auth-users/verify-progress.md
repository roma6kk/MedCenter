Status: done

Examined:
- admin-users.controller.ts, account.controller.ts, users.service.ts, account-factory.service.ts, account-rules.ts, user-changes.ts
- DTOs: create-user, update-user, list-users-query, register-patient, validation-patterns; frontend zod schemas (trim is done there)
- typeorm-user.store.ts, user-store.ts, in-memory store, registration.service.ts
- patient-provisioner.ts, patient-events.ts (outbox), user-view.mapper, user-errors, credentials/identity resolvers, bootstrap-admin, password-hasher
- entities + migrations (Init, RolesAndLinks, AccountConsent) vs entities: consistent
- audit module (builder, service, terminology import builder), fhir/versioned-update
- terminology: controller, service, cache, value-set-parser, seeded-value-sets, DTOs, import service/lock/importer/verifier/upsert, snapshots (tiny demo sets, scan cap not an issue)
- app.module, main.ts, credential-route middleware, README (known limit: access token lives 15 min after deactivation is DOCUMENTED, do not report)
- endpoint-catalog / authz e2e matrix, admin-users e2e, register-validation e2e, terminology e2e (what is covered)
- frontend consumers of the admin users list (schedule pickers, audit table, users panel), i18n of 409 reason codes (mapped OK)
- api-designer-spec 2.2 / 2.3 vs code, Bruno collection parity, Traefik routes: consistent

Findings written (6): 01 (user search by full name, bug, medium), 02 (question: doctor deactivation vs booking catalogue), 03 (DTO validation: whitespace names, future birthDate, NUL -> 500, low), 04 (patronymic / stale name.text on firstName sync, low), 05 (audit noise on no-op PATCH / repeated DELETE, low), 06 (question: no password change / admin reset)

Not reported on purpose (already known / owner decisions): password reset by e-mail (TASK-005 open question; 06 is the cheaper variant of it), access token valid 15 min after deactivation (README known limit), refresh tokens in memory (be-auth-oauth-01), doctor profile CRUD (tz-matrix-10), terminology displays only in Russian (needs real data), unique-violation mislabel on concurrent role PATCH (too rare), unstable roles order in responses (negligible).

Remaining: nothing.
