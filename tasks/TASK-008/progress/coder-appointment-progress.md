# coder-appointment progress

## Item 1 (Q27): patient cannot cancel a started appointment - done
- `AppointmentsService.cancel`: a patient (not admin) whose appointment `start` is not later than now gets 409 `APPOINTMENT_ALREADY_STARTED` (checked after ownership and status). Admin unchanged.
- New error code in `libs/contracts` and `frontend/src/lib/api/problem.ts` (26 codes now), ru + en message, UX kind `banner-generic` (shown in the cancel dialog banner). Spec §1 table and 6.4 text, bruno 6.4 note and errors folder updated.
- Frontend: `isCancellableByPatient` hides the cancel button in the card and in the detail view once the start has passed. Specs pin `Date.now` because fixtures are in the past.
- docs/pz: any text saying a patient can cancel up to or after the start, or listing 25 error codes, is outdated.
