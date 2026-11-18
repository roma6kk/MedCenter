# fe-doctor progress

Status: done

Examined (code read, attempt 1):
- app/(doctor) routes (layout, journal, schedule, encounter, patient pages)
- doctor-api.ts, use-doctor-queries.ts, use-doctor-mutations.ts
- journal: doctor-journal.tsx, journal-model.ts, journal-day-view.tsx, journal-week-view.tsx, journal-controls.tsx, journal-empty-day.tsx, noshow-menu.tsx, open-encounter-button.tsx, use-minsk-today, use-now
- patient card: patient-card-view, patient-header, patient-summary(+model), history timeline, prescriptions, related persons, contact list, consent banner/management-section/required-notice/record-form hook+schema
- patient search: doctor-patient-search.tsx, patient-search-model.ts
- encounter form: encounter-complete-form, use-encounter-form, use-encounter-draft, lib/encounter-draft, encounter-view, encounter-problem-fields, encounter-error-focus, diagnoses/observations/medications/service-requests editors, terminology-combobox, value-set-select, ucum/unit-label, conclusion-section, section-nav, action-bar, readonly view, sections, defaults, icd10 helpers
- contracts zod schema vs backend DTOs (parity OK); apiFetch / error effects / field-errors
- schedule: doctor-schedule-view, schedule-week-model/grid/day-list/slot-block/controls/windows; backend slot range is clinic-calendar aware (OK)
- i18n: ru/en parity of all 1514 keys OK; no hardcoded Russian/English UI strings in components/doctor
- backend facts checked: noshow has NO time rule; journal supports sortOrder asc|desc, pageSize<=100; history lists colleagues' encounters, GET /encounters/{id} is participant-only; completion sets appointment fulfilled

Findings written (8): fe-doctor-01 search/upcoming read only first asc page (high); 02 completion errors off-screen (medium); 03 search «Последний приём» shows future date (medium); 04 noshow before visit time (medium, needsDecision); 05 duplicate diagnoses / key={code} (low); 06 colleague's history visits link to «not found» (medium); 07 focus lost after row removal (low, a11y); 08 draft lingers after 409 replay (low)

Candidates considered and DROPPED as speculative or by design: week view shows 5 working days from the chosen day (heading says «Ближайшие рабочие дни», by design); no journal polling (spec only polls notifications); ValueSet select cap 100 (seeds have <=22 concepts); weekend visits hidden in week view (demo has no weekend windows); back link without ?date; Legend portal slot after breakpoint change; label-in-name of week header buttons; missing component specs for DoctorPatientSearch / PatientHistoryTimeline / PatientPrescriptions (folded into the proposedFix of 01 and 06).

Remaining: nothing required. Not read (shared with admin, likely another unit): components/consent/staff-consent-panel, consent-revoke-action, scan-download-button.
