# Review B-practitioner (backend)
- be-practitioner-05: ok — blank/null description and null floor remove the element; create omits blanks; DTO + service tests meaningful.
- be-practitioner-06: ok — ValidateIf(isPresent) refuses null identifier/name, trim + IsNotEmpty for blank; no-op PATCH writes nothing.
- be-practitioner-02: ok — active:not=false on list, role scan, by-id; findById of inactive = 404 like unknown id; totals exact. Note: a past visit's doctor link to a deactivated doctor now 404s (accepted by spec).
- be-practitioner-01: ok — name matched in service, ru/en, any order; scan bounded (1000).
- be-practitioner-07: ok — readRoom 404 for non-room Location in update/delete/usage/findById.
- be-practitioner-03: ok — three referrer probes shared by delete guard and usage; 409 from delete mapped to ROOM_IN_USE.
- be-practitioner-04: ok — usage follows Accept-Language; additive.
- task005-triage-b-01: ok — middleName additive optional field, name unchanged.
Checks: practitioner-service + fhir-mappers test/lint green (270 unit), root typecheck green; no AI attribution in commits.
