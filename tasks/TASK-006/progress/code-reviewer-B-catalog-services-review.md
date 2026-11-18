- be-catalog-12: ok e1c9adb — doctors of a service come from active Schedule actors, role ids chunked, spec documented
- be-catalog-13: ok fdaf484 — blank description removes comment/_comment on PATCH and create
- be-catalog-05: ok 3e5344a — additive isActive + GET /admin/services; note: GET /services/:id now 404 for inactive, admin edit must use the admin list (frontend lane); doctors list/booking do not check service active (not in finding scope)
- be-catalog-03: ok 1f99244 — If-Match only when meta.versionId present; 412 maps to 409 CONFLICT
- be-catalog-14: ok bb6b1c4 — SERVICE_IN_USE for role link and HAPI referential 409
- be-catalog-15: ok ba7e6df — display from $lookup in type coding
- task005-triage-a-T3-06: ok 8497c81 — empty pages not cached
Checks: nx test,lint for catalog-service, practitioner-service, fhir, auth-service green; npm run typecheck green. No AI attribution in messages.
