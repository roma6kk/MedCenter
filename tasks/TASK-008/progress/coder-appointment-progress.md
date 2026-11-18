# coder-appointment progress

## Item 1 (Q27): patient cannot cancel a started appointment - done
- `AppointmentsService.cancel`: a patient (not admin) whose appointment `start` is not later than now gets 409 `APPOINTMENT_ALREADY_STARTED` (checked after ownership and status). Admin unchanged.
- New error code in `libs/contracts` and `frontend/src/lib/api/problem.ts` (26 codes now), ru + en message, UX kind `banner-generic` (shown in the cancel dialog banner). Spec §1 table and 6.4 text, bruno 6.4 note and errors folder updated.
- Frontend: `isCancellableByPatient` hides the cancel button in the card and in the detail view once the start has passed. Specs pin `Date.now` because fixtures are in the past.
- docs/pz: any text saying a patient can cancel up to or after the start, or listing 25 error codes, is outdated.
- The e2e cancel test used a fixed 2026-11-02 start and began failing once that date passed; it now uses an upcoming appointment and has a case for the started one (separate commit).

## Item 2 (Q6): admin "Записи" page
- Backend (done): `GET /api/v1/admin/appointments` (6.7) in appointment-service, `AdminAppointmentsController`, `AppointmentQueriesService.listForAdmin`, `ListAdminAppointmentsQueryDto` (the doctor query DTO without `patient`, plus `practitionerRoleId`). Response is the existing `AppointmentViewDto` (no visit reason is stored or returned). One read `AuditEvent` (`search-type`, via `PatientReadAudit`) per patient on the page. Traefik router for `/api/v1/admin/appointments`, bruno 6.7, smoke access matrix + booking chain step, spec 6.7 + PD access matrix row.
- docs/pz: any list of appointment-service endpoints (6.1-6.6), the access matrix, or the claim that the admin has no list of appointments is outdated.
- Frontend (done): new «Записи» admin page `/admin/appointments` (`frontend/src/components/admin/appointments/`): filters (period, doctor, status) kept in the address like the audit page, `PaginatedTable`, row action «Отменить» opens the existing `CancelAppointmentDialog` (reason codes, same `POST /appointments/{id}/cancel`); cancel invalidates the admin list. Nav item, ru + en messages, panel and filter specs.
- docs/pz: the admin navigation list/screens and the use-case text "admin cancels only by API" are outdated.
- Not verified: full frontend jest run has one failing test, `schedules-panel.spec.tsx` "should open the generation dialog ..." (untouched area, looks date-dependent, not checked against a clean HEAD). No live-browser check of the new page was done.
