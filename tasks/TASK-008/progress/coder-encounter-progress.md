# coder-encounter progress (TASK-008)

## Item 1 (Q16) GET /encounters/{id} for colleagues

- `EncountersService.findOne` now uses `PatientAccessService.resolveReadablePatient` and `PatientReadAudit.audited` (the same relation check and audit as 7.4); `EncountersModule` provides both. 7.3 is unchanged (leading doctor only).
- Frontend: an in-progress visit of another doctor opens read-only with a notice (`doctor.encounter.notYours`); finished visits were already read-only.
- Specs: 7.2 row, matrix, ADR-014 list; bruno 7.2 docs.
- docs/pz likely outdated: any text saying 7.2 is only for the participant doctor.
- Not done: no stack-smoke check for a colleague read (needs a second shared appointment in the chain).
