# coder: settings (FR-018) — progress

Branch `feat/close-open-questions`. Done.

## What changed
- auth-service: migration `1700000000005-ClinicSettings` (one-row table `auth.clinic_settings`, seeded with the former landing constants), module `modules/clinic` (store, service, public `GET /api/v1/clinic`, ADMIN `PATCH /api/v1/admin/clinic`), `recordClinicChange` audit (AuditEvent with the list of changed fields).
- Traefik `auth-api` rule, Bruno folder `13-clinic`, stack-smoke (`checks-clinic.ts`, access matrix, public-route list), e2e endpoint catalog, swagger spec.
- Frontend: `/admin/settings` (nav item, one form), `useClinic()` (server details, demo constants as fallback) used by header, landing contacts, footer, privacy policy and the personal-data export; ru + en messages.
- specs: `api-designer-spec.md` (section 2.4, FR-018 row), `frontend-design-spec.md` (route table, FR map).

## Commits
- backend: f510993e
- frontend: 207f67e3

## Decisions
- Address and hours are stored as one language (Russian). The English interface shows the stored Russian text once the server answers; the English constants remain only as the fallback.
- Phone is stored as typed (`+375 17 000-00-00`); the `tel:` link is derived by dropping spaces and dashes.
- Licence number, UNP, `home.demoNote` untouched.

## docs/pz likely outdated (not edited)
- Description of FR-018 as terminology only; list of auth-service modules and endpoints (new section 2.4); the admin page list; the landing/footer/privacy contacts described as constants; migration list (now 6).

## Not done / notes
- `perimeter-routes.e2e-spec.ts` was already failing before this work (`GET /oauth/assets/fonts/:file` and `POST /api/v1/me/password` are missing from `test/endpoint-catalog.ts`); my two clinic routes are correctly listed. Left alone.
- `nx e2e auth-service` fails in a parallel run (timeouts); each spec I ran alone passed.
- Not run: `npm run smoke:stack` (needs the Docker stack), browser check.
