export const meta = {
  name: 'medcenter-polish-handoffs',
  description: 'Close the cross-lane handoffs left by the TASK-006 implementation run, three lanes, one commit per lane',
  phases: [{ title: 'Handoffs', detail: 'Sonnet, three lanes in parallel', model: 'sonnet' }],
}

const REPO = '/mnt/BE48B9DF48B9971D/projs/MedCenter'

const LANES = {
  'backend-a': {
    files: 'apps/catalog-service, apps/analytics-service, apps/practitioner-service, tools/, infra/ (including infra/traefik), docker-compose.yml, root configs, bruno/ folders of catalog, analytics and practitioner, README.md',
    tasks: [
      'fe-admin-05 backend part: DELETE /admin/schedules/{id} answers 204 today; make it answer 200 {"deactivated": boolean} (true when the schedule was deactivated because it has booked slots, false when it was deleted). apps/catalog-service schedule-removal.ts + controller + Swagger + tests + specs/api-designer-spec.md §5.2.4 + Bruno. The frontend (13c1df4) already reads {deactivated:true}; check it also tolerates false.',
      'infra-tools-07: infra/traefik/dynamic.yml — rate limit (about 60/min per client address) and an empty Cache-Control on the fhir-metadata router; make sure `npm run stack:wait` polling (tools/) stays under the limit. Finding: tasks/TASK-006/findings/*/infra-tools-07.json, notes in tasks/TASK-006/progress/verify-B-tools-progress.md.',
      'infra-tools-03 (compose/traefik part): pin the edge network subnet in docker-compose.yml, set Traefik --entrypoints.web/websecure.forwardedHeaders.trustedIPs to the addresses that may legitimately be in front of Traefik (none in this stack except loopback — read the finding and tasks/TASK-006/progress/verify-X-client-ip-progress.md), and set TRUST_PROXY so the services see the real client address behind exactly Traefik. Backend-b changes the /oauth/token rate-limit key at the same time; do not touch libs/common.',
      'docker-compose.yml x-bff-healthcheck comment (around lines 120-122) still says some services answer 404 on /health; all 9 now serve it. Fix the comment only; do NOT switch HEALTH_PATH to /ready.',
      'apps/catalog-service/src/config/rate-limit.ts, redis-options.ts and the practitioner-service copies: if they still duplicate enableRateLimit / FAIL_FAST_REDIS_OPTIONS now exported from @medcenter/common (272bed1), replace them with the shared ones; keep behaviour identical.',
    ],
  },
  'backend-b': {
    files: 'apps/auth-service, apps/appointment-service, apps/encounter-service, apps/patient-service, apps/notification-service, apps/outbox-relay, libs/*, bruno/ folders of those services, specs/architect-architecture.md',
    tasks: [
      'i18n-03 backend part: appointment-service ignores Accept-Language, so doctorName and serviceName in 6.x reads (patient «Мои записи», appointment card, doctor journal) are Russian in the English UI. Follow how catalog-service / analytics-service (be-analytics-03, resolveContentLanguage, HealthcareService/Practitioner English names) already do it. Additive; update specs/api-designer-spec.md §6 sections only.',
      'infra-tools-03 (rate-limit part): libs/common rate-limit.guard.ts / apps/auth-service — key the POST /oauth/token bucket by client_id + grant_type + sha256(code or refresh_token) plus a generous per-address limit, so that clients behind one NAT do not share one bucket. Add/adjust apps/auth-service/test/rate-limit-proxy.e2e-spec.ts if it runs without docker. Backend-a pins Traefik trustedIPs and TRUST_PROXY at the same time.',
      'fe-doctor-04 server rule: check that appointment-service markNoShow already refuses a visit whose start is in the future (commit 978d046 «no-show only after start»). If yes, only make sure specs/api-designer-spec.md §6.6 states it; if not, implement 409 with the existing error code used for that case.',
      'fe-doctor-05 server part (cheap): apps/encounter-service complete-encounter DTO rejects duplicate diagnosis codes with VALIDATION_ERROR and a diagnoses.N.code detail, if be-encounter-04 (UniqueBy, ea1da3c) did not already do exactly that — then nothing to do.',
      'apps/auth-service/README.md still calls the login form «script-free» with Russian-only labels (be-auth-oauth-06); after 2481bd9 the page follows ui_locales. Fix the text.',
      'B-auth-tokens side effect: REDIS_URL is set in the nx jest environment, and JwtAuthGuard in libs/common now creates a lazy Redis revocation client when no TOKEN_REVOCATION is bound. Run the unit test targets of catalog-service, practitioner-service, analytics-service, appointment-service, notification-service, outbox-relay (`npx nx run-many -t test -p <list> --parallel=1`) and fix any open-handle / hanging / connection-error problems at their root (e.g. the guard must not connect in tests, or must be closed on module destroy) — not by editing the other lanes\' specs unless unavoidable.',
    ],
  },
  'frontend': {
    files: 'frontend/ and specs/frontend-design-spec.md',
    tasks: [
      'be-auth-oauth-03 / tz-matrix-03 frontend part: frontend/src/app/api/auth/authorize/route.ts must add ui_locales=<ru|en> from the mc-locale cookie (default ru) to the authorize URL. Test it.',
      'B-analytics handoffs: queryKeys.analytics in frontend/src/lib/api/query-keys.ts must include the locale so the 9.3 ranking refetches on language switch; frontend/e2e/admin-reports.spec.ts (about lines 231-235) computes «today» as the UTC date — use the Minsk day key; 9.2 groups with no display (be-analytics-02) must get a localized label in the analytics panel — add the label if it is missing, plus a spec case in analytics-panel.spec.tsx.',
      'infra-tools-10: add the same engines field to frontend/package.json as the root package.json (b125a1c).',
      'fe-admin-06 remainder: the shared DatePicker should enforce min/max for typed text too (it is also used by the public registration form — keep that form working). Add spec cases.',
      'B-clinical handoffs: a consent whose signedBy is a raw reference matching /^PractitionerRole\\// should show a neutral localized label instead of the raw string; be-encounter-05: add .trim() to the clinical text fields in frontend/src/lib/contracts.ts if F-doctor (b40af95) did not; be-encounter-03 / T1-04: the visit card and patient-history-timeline must query prescriptions with encounterId — check and do it if missing.',
      'At the end run the FULL frontend suite once: `cd frontend && npx jest --maxWorkers=2 && npx tsc --noEmit && npx next lint`. Fix every failure (other packages committed without the full run: b40af95, 9924269, 13c1df4 and others). Report the totals.',
    ],
  },
}

const RESULT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    done: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'string' }, description: 'task: why it was not done' },
    questions: { type: 'array', items: { type: 'string' }, description: 'in Russian, with options and a recommendation' },
    commits: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['status', 'done', 'skipped', 'questions', 'commits', 'checks', 'notes'],
}

const prompt = (lane, attempt) => {
  const l = LANES[lane]
  const others = Object.keys(LANES).filter(k => k !== lane).map(k => `- ${k}: ${LANES[k].files}`).join('\n')
  return `You close cross-lane handoffs of the TASK-006 product polish pass. Lane: ${lane}. Attempt ${attempt}.
Repository: ${REPO}. Branch must be fix/product-polish (\`git branch --show-current\`), else change nothing and return "blocked".
READ FIRST: tasks/TASK-006/findings/verify-polish-context.md (owner decisions, rules). Finding files: \`ls tasks/TASK-006/findings/*/<id>.json\`. Package notes: tasks/TASK-006/progress/verify-*-progress.md.

YOUR FILES: ${l.files}. specs/api-designer-spec.md is shared by the backend lanes: edit only your endpoints' sections and re-read it right before each edit; never stage it whole if it holds another lane's uncommitted hunks — use \`git add -p\` style partial staging via \`git apply --cached\` of your own hunks, or wait until the other hunks are committed.
Other lanes run at the same time — never edit, stage, stash, reset or check out their files:
${others}
If a task really needs another lane's file, skip it and say so.

TASKS:
${l.tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}
For each task: confirm it is still needed in the current code (it may already be done — then say so), implement with a unit test where practical, follow surrounding patterns. API changes additive only; anything needing an owner decision → a question, not code.

PROGRESS (the token limit can kill you): keep tasks/TASK-006/progress/verify-handoffs-${lane}-progress.md — one line per task: done / skipped / question / in-progress. Read it first on a retry; uncommitted changes in your files are the previous attempt's work.
CHECKS once before committing: backend — \`npx nx run-many -t test,lint -p <touched projects> --parallel=1\` and \`npm run typecheck\`; tools — \`npx jest tools/\` and \`npm run lint:tools\`; frontend — as in its last task.
COMMIT: ONE commit for this lane's run with an explicit pathspec: \`git add <paths> && git commit -m "<type>(<scope>): <summary>" -m "TASK-006: handoffs ${lane}" -m "<one line per task>" -- <paths>\`. Retry on index.lock after 5 s. Never --no-verify, never git stash/reset/checkout --/clean/add -A/add ./commit -a. No Co-Authored-By, no "Generated with". Never commit tasks/TASK-006/**. Never push. Docker stack is NOT running. Leave untracked frontend/pw-tmp.config.ts alone.
Temp files: /tmp/claude-1000/-mnt-BE48B9DF48B9971D-projs-MedCenter/159ba540-ba70-443c-ae30-e87f8af7ecfb/scratchpad/ prefixed with ${lane}.
Budget about 200 tool calls; if you run out, commit what is finished and return "partial".`
}

let deaths = 0
const runLane = async (lane) => {
  let last = null
  for (let attempt = 1; attempt <= 3 && deaths < 2; attempt++) {
    const r = await agent(prompt(lane, attempt), { label: `handoffs:${lane}#${attempt}`, phase: 'Handoffs', schema: RESULT, model: 'sonnet' })
    if (!r) { deaths++; continue }
    deaths = 0
    last = r
    if (r.status !== 'partial') break
  }
  return { lane, ...(last || { status: 'died' }) }
}

phase('Handoffs')
return await Promise.all(Object.keys(LANES).map(runLane))
