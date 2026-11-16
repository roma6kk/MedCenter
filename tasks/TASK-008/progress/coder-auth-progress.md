# coder-auth progress (TASK-008)

## Item 1 (Q9) passwords
- `POST /api/v1/me/password` (2.2.10) and optional `password` in `PATCH /admin/users/{id}` (2.2.4). Wrong current password gives the existing 403 `INVALID_PASSWORD`. Audit events `user.password_changed` / `user.password_reset`.
- Sessions: there was no user-to-sessions index, so `TokenStore.sessionsOf(userId)` was added (in-memory scan; Redis set `oauth:user-sessions:{userId}`) and `TokenService.revokeAll(userId)` closes every session. Both password paths close all sessions. UsersModule and OAuthModule now import each other with `forwardRef`; the controllers call `revokeAll` after the service call.
- Traefik: `/api/v1/me/password` added to the auth-api router in `infra/traefik/dynamic.yml` (edge-routing spec requires it).
- Frontend: `ChangePasswordDialog` + `ChangePasswordSection` on the patient home, a "Change password" item in the doctor/admin profile menu, a "New password" field in the admin edit-user form. ru/en messages `passwordChange.*`, `admin.users.fields.newPassword`.
- Bruno 2.2.10, stack-smoke access matrix route added.
- docs/pz outdated: the API/user-management description (no password change/reset), the role-by-role feature list.

Note on commit 6a444580: the `passwordChange` messages block landed one line too low in `ru.json`/`en.json` (nested inside `accountClosure`); the next commit (item 2) moves it to the top level where the code reads it.

## Item 2 (Q7) creating a doctor
- `POST /admin/users` accepts `specialtyCode` (SNOMED code) for a DOCTOR without `practitionerRoleId`. Choice of place: auth-service writes to HAPI directly (new `DoctorProvisioner` next to `PatientProvisioner`; it already owns the Patient write, the compensation and the FHIR client). It creates Practitioner + PractitionerRole in the seed's shape (name, SNOMED `qualification`/`specialty` with English translation, `active: true`); a failed link deletes both resources and the account.
- The clinic specialty list moved from `tools/demo-seed/demo-catalog.ts` to `libs/terminology/src/lib/specialties.ts` (demo-catalog re-exports it, seed output is unchanged); the server validates the code against it (400 otherwise).
- Frontend: the create form asks for a specialty (options taken from the doctors that already exist, like the catalog filter) and no longer shows the PractitionerRole picker; the edit form keeps the link field. The API path with `practitionerRoleId` is kept.
- Not done: no cleanup of an orphan Practitioner after an outcome-unknown HAPI timeout (the Patient flow has one); the doctor has no patronymic (account has only first/last name); no Bruno request added (no new route).
- docs/pz outdated: the description of how a doctor appears (seeder only / link to an existing role).

## Item 3 (Q8) deactivating a doctor hides them in the catalog
- Deactivation (PATCH `isActive:false` and DELETE) of an account with a PractitionerRole writes `active=false` on the PractitionerRole and on its Practitioner under If-Match; activation writes `true`. A failed HAPI write reverts the account change (same revert as the Patient sync) and answers the HAPI error. Existing appointments are untouched. Audit is the existing `user.deactivated` / `user.updated` event.
- Why the Practitioner too: the public doctor list is built from Practitioner and keeps a doctor whose only role is inactive (with `practitionerRoleIds: []`), so the role flag alone would not hide them.
- Read side checked, no change needed: practitioner-service already filters `active:not=false` on Practitioner and PractitionerRole (list, card, `practitionerRoleIds`), and catalog-service's public doctor slots search only roles with `active:not=false`. Not checked/changed: the per-day slot cache in catalog-service may serve a deactivated doctor's free slots until its TTL ends.
- docs/pz outdated: the account deactivation description (does not mention the catalog).

## Item 4 (Q13/Q29) dead `roomId` on the doctor
- Removed `roomId` from the doctor DTO and Swagger doc (practitioner-service), the shared `DoctorResponseDto` in libs/fhir-mappers, the smoke response shape, the Bruno 4.2 post-response script and spec 4.1/4.2 (row text and DTO block). Frontend types had no such field. A swagger spec test guards it. Room stays set in the schedule only.
- docs/pz outdated: any description of the doctor card with a room (4.2 "карточка врача + специальность + кабинет").
