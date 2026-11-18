# coder-encounter progress (TASK-008)

## Item 1 (Q16) GET /encounters/{id} for colleagues

- `EncountersService.findOne` now uses `PatientAccessService.resolveReadablePatient` and `PatientReadAudit.audited` (the same relation check and audit as 7.4); `EncountersModule` provides both. 7.3 is unchanged (leading doctor only).
- Frontend: an in-progress visit of another doctor opens read-only with a notice (`doctor.encounter.notYours`); finished visits were already read-only.
- Specs: 7.2 row, matrix, ADR-014 list; bruno 7.2 docs.
- docs/pz likely outdated: any text saying 7.2 is only for the participant doctor.
- Not done: no stack-smoke check for a colleague read (needs a second shared appointment in the chain).

## Item 2 (Q17) cancel an encounter opened by mistake

- New `POST /encounters/{id}/cancel` (spec 7.8): participant doctor, in-progress encounter, booked appointment; one If-Match transaction sets the Encounter to `cancelled`, drops the `encounter-opened` flag from the Appointment (so a concurrent no-show or cancel loses the race) and writes two AuditEvents. No outbox event.
- A cancelled encounter counts as "no encounter": opening (search and conditional create) and appointment-service `assertNoEncounter` (one line, no-show and patient cancel) use `status:not=cancelled`. Checked that the HAPI in the running stack accepts the search parameter.
- The opening AuditEvent keys now include the Appointment version, otherwise a reopening after a cancel would be swallowed by the conditional create of the first opening.
- fake-hapi (e2e double) learned `:not`, `&` in conditional create and the audit entity-name query.
- Frontend: «Отменить приём» in the action bar of the form, confirmation dialog, discards the local draft and the remembered started encounter, goes to the journal; ru and en messages.
- Specs: 7.8 row and paragraph, 6.6 note; bruno 7.8 (skipped unless `cancelEncounterId` is set); stack-smoke access matrix.
- docs/pz likely outdated: the encounter lifecycle (no cancelled state), the endpoint list and the access matrix, any text saying an opened encounter cannot be undone.
- Not done: no stack-smoke chain check for the cancel (only the access matrix); two tools/stack-smoke specs (edge-routing, route-inventory) fail for the new `/clinic` routes of another change, not for 7.8.

## Item 3 (Q23) observation picker label

- The observation list shows «Температура тела (20006)»: name first, code after it. `CodedTermField` got an optional `optionLabel`, only the observations editor passes it; services and the other pickers are unchanged.
- Not done as asked: the code cannot be muted (grey) because the picker is a native `<select>`, whose options are plain text; the parentheses are the substitute. A custom listbox would be needed for real muting.
- docs/pz likely outdated: a screenshot or text of the observation picker with «код — название».
