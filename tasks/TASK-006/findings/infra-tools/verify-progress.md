Status: done

Findings written (11, all valid JSON):
- infra-tools-01 robustness/medium: terminology seed first run still fails: 5xx retry window 15 s < HAPI ~60 s cache, 4xx HAPI-2788 not retried, validate-code loop not wrapped (TASK-005 open question "чинить сидер?" is a plain bug)
- infra-tools-02 bug/low: seed:terminology ignores SEED_FHIR_BASE_URL from .env (seed:demo calls loadSeedEnv)
- infra-tools-03 security/medium: rate-limit bucket = web container IP (Traefik strips X-Forwarded-For from web): anonymous catalog calls and POST /oauth/token (20/min) shared by all users, DoS via garbage /api/auth/callback
- infra-tools-04 docs/low: Bruno 9.1 docs/asserts lack fulfilled
- infra-tools-05 docs/low: README says seed:demo --users rotates passwords, code keeps them; stale header comment
- infra-tools-06 gap/medium: no /health in catalog-, practitioner-, notification-service (NFR-007), docker healthcheck proves only the listener
- infra-tools-07 security/low: public /fhir/metadata router has no rate limit
- infra-tools-08 test/low: no offline test that dynamic.yml routes every controller route to the right service
- infra-tools-09 question/low (needsDecision): add CI workflow?
- infra-tools-10 robustness/low: no engines/.nvmrc; stray empty file "**For" in repo root
- infra-tools-11 robustness/medium: admin terminology importer (auth-service) has the same HAPI race without any retry (fix 8236953 only reached tools/ copy)

Examined (no defect found unless listed above):
- docker-compose.yml (full): ports all 127.0.0.1, 3 networks, caps/read_only/no-new-privileges, healthchecks, restart policy, secret scoping, depends_on, mem/pids limits
- infra/traefik/dynamic.yml vs every controller route (route map): all routes map to exactly one router, priorities correct, HAPI only GET /fhir/metadata, Swagger routers present
- infra/docker/nest-service.Dockerfile, web.Dockerfile, both dockerignore files (non-root node user, tini, digests, no secrets in context), migrate-anonymous-volumes.sh
- tools/terminology-seed (all main files + snapshot sanity), tools/shared (fhir-http, seed-env, local-target, load-seed-env), tools/demo-seed (seed-demo, cli options, repair, slots, fhir, users, credentials, consents, photos, manifest 0600), tools/stack-smoke (wait-for-stack, polling, config, http, runner, edge/race/encounter/terminology checks); `eslint -c tools/.eslintrc.golden.json tools` clean
- bruno collection: all request URLs compared with the route map (every route has a request), environment file has no secret values, get-token.mjs
- root nx.json, tsconfig.base.json, .eslintrc.json, jest.config.js, package.json scripts, project.json targets; git ls-files shows no tracked secrets
- web env vs compose (consistent), TRUST_PROXY in every service bootstrap

Remaining: nothing planned. Not examined (outside budget, low expected yield): checks-chain-booking/consent/readback, checks-admin-catalog*, checks-auth, fake-auth-*, oauth-* helpers of tools/stack-smoke and tools/demo-seed.
