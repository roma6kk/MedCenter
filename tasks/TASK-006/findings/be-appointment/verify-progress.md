Status: done

Examined:
- apps/appointment-service/src: appointments.controller/service, appointment-queries.service, doctor-appointments.controller, appointment-resource, compartment, fhir-transaction (app copy), audit, events, scope-policy, fhir-reference, dto/*, idempotency module + redis store, view mapper, main.ts, app.module.ts, unit/e2e spec titles
- libs/common idempotency.service.ts + validation.pipe.ts + http-edge.ts, libs/fhir fhir-transaction.ts + client error mapping (409/412 -> 409) + search no-cache header, outbox.ts, libs/fhir-mappers appointment.mapper.ts, libs/contracts appointment events
- catalog slots (slot-search, doctor-slots.service, slot-range, schedule-removal, slot id derivation) for what is offered/retired
- frontend: booking submit/classify, doctor journal no-show menu, appointment cancel button logic, doctor-api range (clinicDayBounds), use-doctor-queries (journal, upcoming visit, patient search), schedule-week-model join by slotId (checked: cancelled visits are excluded, no defect)
- specs: api-designer-spec §0/§1/§6, ADR-012/013/014/018/019, TASK-003 PDN + consent legal answers; infra/traefik/dynamic.yml headers; tools/stack-smoke no-show/cancel usage
- existing findings in be-catalog, be-practitioner, be-auth-users, tz-matrix (avoided duplicates: tz-matrix-02 no-show notification; be-practitioner-02 public catalog shows inactive doctors; be-catalog-09 stale free slots after PATCH; TASK-005 open question line 50 patient search endpoint)

Findings written (be-appointment-NN.json), 11 in total:
01 bug medium        past/started slot can be booked (no start-time check)
02 bug medium        no-show allowed before the appointment start (+ UI menu on every booked row; smoke arms need past appointments)
03 gap medium        6.5 has no patient/status filter -> next-visit lookup truncated at 50 rows
04 robustness low    Idempotency-Key not atomic: concurrent same-key request gets false SLOT_CONFLICT
05 robustness low    booking does not re-check Schedule/PractitionerRole active
06 bug low           6.5 date-only from/to read in HAPI zone (UTC), not the clinic day
07 bug low           whitespace-only reason / cancel reason accepted
08 question low      (needsDecision) patient may cancel after the visit time has passed
09 security medium   (needsDecision) ADMIN sees reason/cancelReason in 6.3 (ADR-018 D-2); cancel reason not consent-gated
10 security low      no Cache-Control: no-store on authenticated API responses (cross-cutting, libs/common + traefik)
11 robustness low    duplicate fhir-transaction.ts (app copy vs libs/fhir vs encounter-service)

Checked and found fine (no finding): If-Match on Slot + atomic transaction with audit and outbox (booked and cancelled events); 412 -> 409 mapping; same key + different body -> 409 CONFLICT (sequential case); SLOT_CONFLICT mapping; cancel ownership-before-state, encounter race via If-Match; cancelled/fulfilled/noshow cancel -> 409; slot freed on cancel; admin cancel covered by stack smoke; patient list filters (status OR list, upcoming) and pagination envelope; HAPI search cache bypass; compartment fail-closed before FHIR.

Interplay to keep in mind when implementing: 01 + 02 together make a booked-and-already-started appointment impossible to create through the API alone, so stack-smoke no-show/race arms and e2e fixtures with fixed dates (2026-11-02) need a pinned clock or directly seeded past appointments.

Remaining: none
