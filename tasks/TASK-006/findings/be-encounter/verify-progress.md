Status: done

Examined:
- apps/encounter-service/src: ALL source files read (controllers, services, mappers, DTOs, terminology validator, consent-gate, fhir-transaction, audit, history, prescriptions, patient-access, events); no dead exports
- libs/fhir: active-consent, consent-audit, outbox, patient-read-audit, client search/serialization; libs/terminology grammars; seed snapshot vs DTO grammar (all seed codes match)
- spec section 7, access matrix (§0), ADR-018/019/014; Traefik routes for encounter-service; compose env; Bruno 08-encounters
- appointment-service guards cancel/no-show when an encounter exists (assertNoEncounter): OK, but see be-encounter-09
- frontend open-encounter-button (A4 confirmation for not-today visits): OK, not a finding
- frontend doctor-types / patient-types vs backend DTOs (match); doctor history timeline + patient-summary consumers; apiFetch Accept-Language; query keys
- Checked and found correct (no finding): atomic completion transaction with If-Match on Encounter and Appointment, Appointment -> fulfilled, double/concurrent completion -> 409, conditional create of Encounter per appointment, consent gate order (409 before terminology/transaction), emergency bypass AuditEvent in the same transaction, outbox encounter.completed in the same bundle (diagnosisCount only), prescriptions pagination arithmetic (medications then services), history audit (fail-open), compartment checks, Traefik routing/priority

Findings written (9):
- be-encounter-01 security high: ADMIN reads full clinical record via 7.2 (contradicts ADR-018 / access matrix), no audit
- be-encounter-02 bug medium (needs decision): doctor sees colleagues' visits in history but 7.2 answers 403; link and "last vitals" fail
- be-encounter-03 bug medium: visit orders in doctor's card come from page 1 of 10 prescriptions; proposed encounterId filter on 7.5/7.7
- be-encounter-04 robustness low: foreign codeSystem accepted for ServiceRequest/Observation, duplicate diagnoses
- be-encounter-05 robustness low: whitespace-only free text accepted (no trim), also in frontend zod
- be-encounter-06 i18n low: history doctorName ignores Accept-Language
- be-encounter-07 docs low: swagger 404 for 7.4/7.5 vs real 403
- be-encounter-08 question low (needs decision): prescriptions reference only the primary diagnosis
- be-encounter-09 gap medium (needs decision): no way to cancel an erroneously opened encounter

Remaining:
- nothing in scope; possible follow-ups outside this unit: frontend patient-history/prescriptions pages (separate unit), appointment-service localisation of doctorName
