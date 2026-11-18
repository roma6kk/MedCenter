Status: done

Examined (attempt 1 + attempt 2):
- apps/patient-service/src ALL non-spec source: access service + identity, patients service/controllers/DTOs/mappers, me-patient (phone PATCH + If-Match), related-persons, consents (controllers, service, DTOs, scan validation/interceptor), main/app.module (global guard stack JWT -> scope -> role -> rate limit: OK)/env/health
- libs/fhir: consent.ts, active-consent.ts, patient-read-audit.ts, consent-audit.ts, fhir-transaction.ts, fhir-client.provider.ts (error mapping: HAPI 400/422 -> 500 INTERNAL)
- libs/contracts phone.ts + consent.dto.ts, libs/common patient-compartment.ts, validation.pipe (transform:true -> phone normalisation reaches handler: OK)
- encounter-service history: history.controller/service/prescriptions.service/patient-access.service + history-item mapper (doctorName via _include); prescriptions pagination slices OK
- specs §0 access matrix, §3 patient-service, §1 error catalogue; TASK-003 architect-pdn-access-decision (D-1: doctor needs booked/arrived/checked-in/fulfilled appointment or encounter; log line for 1442 = cancelled-only visits, refusal is by decision; frontend canOpenPatientCard matches backend statuses -> NOT a finding)
- Traefik routes for patient/encounter-me/patient-history: OK
- Other units' findings read to avoid overlap (be-encounter-01 admin reads 7.2, be-encounter-02 doctor 403 colleague visits, be-encounter-06 doctorName not localised (so NOT mine), be-encounter-07 swagger 404 docs for 7.4/7.5, be-appointment-10 Cache-Control no-store cross-cutting, be-appointment-04 idempotency race, be-auth-users-04 name.text stale)
- attempt 2: consents.service/DTOs/controllers, libs/fhir consent + active-consent + transaction; frontend consent form hook (double submit guarded in UI; revoke form never sends revokedAt); scan download button OK; analytics audit-event.mapper (consent read/scan/bypass events map correctly: OK); encounter consent-gate (7.1/7.3 bypass wiring: be-encounter scope); frontend profile phone edit (409 handled with refetch: OK); frontend patient-types vs encounter-service DTOs (history/prescriptions contracts match); auth-service scopes (doctor has user/*.write: OK); bruno collection covers 3.x; PDn matrix vs audit calls (3.2/3.3/3.7/7.4/7.5 audited: OK); swagger doc classes vs contracts (match); frontend error-code-map maps COMPARTMENT_VIOLATION to not-found on purpose (so be-patient-05 is docs only)

Findings written (5): 
- be-patient-01 gap/medium needsDecision: RelatedPerson cannot be created, representative consent unusable
- be-patient-02 robustness/low: signedAt/revokedAt @IsISO8601() -> 500 instead of 400 (appointment-service already has the fix pattern)
- be-patient-03 bug/medium: doctor-entered consent shows «PractitionerRole/12» as signer instead of the doctor's name
- be-patient-04 robustness/low: concurrent consent create -> two active consents, revoke closes only one
- be-patient-05 docs/low: Swagger says 404 for token without patient claim, real answer is 403 COMPARTMENT_VIOLATION

Candidates dropped (not findings): audit flood from doctor card (design D-3), UTC+14 future-date tolerance for date-only (UI blocks, lenient by design), date-only start = UTC midnight (negligible in clinic hours), admin 7.4/7.5 FORBIDDEN_ROLE not audited (guard before handler, be-encounter scope), recordedAt = meta.lastUpdated (not displayed anywhere), 3.6 revocation without application number cannot be completed later (spec accepts empty 3.6 body).

Remaining: nothing.
