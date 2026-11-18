- libs-common-01: done 272bed1 — rate-limit key uses route template (request.route.path, fallback Class.handler)
- libs-common-02: done 272bed1 — body-parser 4xx -> 400 VALIDATION_ERROR, requestId minted when missing
- libs-common-03: done 272bed1 — enableRateLimit + FAIL_FAST_REDIS_OPTIONS in libs/common, 6 main.ts use it, guard 500 ms store timeout; catalog/practitioner copies left (handoff), RedisIdempotencyStore options not changed (see notes)
- libs-common-04: done 272bed1 — blankAsUnset in libs/config, patient env, fhir client
- be-appointment-10: done 272bed1 — applyHttpEdge sets Cache-Control: no-store (BFF side only)
- infra-tools-06: done 272bed1 — /health in catalog, practitioner, notification (503 when consumer down); docker-compose comment is a handoff to backend-a
- libs-common-05: done 272bed1 — ucum.ts removed
- libs-common-06: done 272bed1 — titles by errorCode, WWW-Authenticate on 401, fromValidationError removed
Status: done
