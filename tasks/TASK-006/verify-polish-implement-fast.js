export const meta = {
  name: 'medcenter-polish-implement-fast',
  description: 'Implement the rest of TASK-006 polish in three lanes, no review, one commit per agent run',
  phases: [
    { title: 'Implement', detail: 'Sonnet implementers: two backend lanes and one frontend lane', model: 'sonnet' },
  ],
}

const REPO = '/mnt/BE48B9DF48B9971D/projs/MedCenter'
const MAX_ATTEMPTS = 4
const SKIP = new Set((args && args.skip) || [])

// Lane areas never overlap on purpose: every lane edits only its own paths.
const LANES = {
  'backend-a': 'apps/catalog-service, apps/analytics-service, tools/, infra/ (except infra/traefik), docker-compose.yml, root configs (package.json, nx.json, eslint/jest/tsconfig), bruno/ folders of catalog and analytics, README.md',
  'backend-b': 'apps/encounter-service, apps/patient-service, apps/auth-service, libs/*, the main.ts and health modules of every apps/* (B-platform, B-observability only), bruno/ folders of encounters, patients and auth, specs/architect-architecture.md',
  'frontend': 'frontend/ and specs/frontend-design-spec.md (X-client-ip may also touch libs/common trust-proxy config and infra/traefik)',
}

const PKGS = [
  { key: 'B-catalog-schedules', lane: 'backend-a', area: 'apps/catalog-service (schedules and slots part)', deps: [], ids: ['be-catalog-04', 'be-catalog-01', 'be-catalog-08', 'be-catalog-02', 'be-catalog-06', 'be-catalog-07', 'be-catalog-11', 'tz-matrix-11', 'task005-triage-b-18'] },
  { key: 'B-analytics', lane: 'backend-a', area: 'apps/analytics-service, bruno/', deps: [], ids: ['be-analytics-01', 'task005-triage-b-24', 'be-analytics-02', 'be-analytics-03', 'be-analytics-04', 'infra-tools-04'] },
  { key: 'B-tools', lane: 'backend-a', area: 'tools/, infra/, docker-compose.yml, root configs, specs/api-designer-spec.md docs', deps: [], ids: ['infra-tools-01', 'task005-triage-a-T4-05', 'infra-tools-02', 'infra-tools-05', 'infra-tools-07', 'infra-tools-08', 'infra-tools-10', 'be-auth-oauth-06'] },

  { key: 'B-clinical', lane: 'backend-b', area: 'apps/encounter-service, apps/patient-service', deps: [], ids: ['be-encounter-01', 'tz-matrix-01', 'be-encounter-03', 'task005-triage-a-T1-04', 'be-encounter-04', 'be-encounter-05', 'be-encounter-06', 'be-encounter-07', 'be-patient-03', 'be-patient-04', 'be-patient-02', 'be-patient-05'] },
  { key: 'B-auth-tokens', lane: 'backend-b', area: 'apps/auth-service (oauth token storage), libs/common (token revocation)', deps: [], ids: ['be-auth-oauth-01', 'be-auth-oauth-04', 'be-auth-oauth-02', 'be-auth-oauth-08', 'be-auth-oauth-07', 'be-auth-oauth-12', 'be-auth-oauth-05'] },
  { key: 'B-auth-pages-users', lane: 'backend-b', area: 'apps/auth-service (login page, users, terminology import)', deps: [], ids: ['be-auth-oauth-03', 'tz-matrix-03', 'be-auth-oauth-09', 'be-auth-oauth-10', 'be-auth-users-01', 'be-auth-users-03', 'be-auth-users-04', 'be-auth-users-05', 'infra-tools-11'] },
  { key: 'B-platform', lane: 'backend-b', area: 'libs/common, libs/config, libs/terminology, every apps/*/src/main.ts, health modules', deps: [], ids: ['libs-common-01', 'libs-common-02', 'libs-common-03', 'libs-common-04', 'be-appointment-10', 'infra-tools-06', 'libs-common-05', 'libs-common-06'] },
  { key: 'B-observability', lane: 'backend-b', area: 'libs/common + apps/*: readiness, metrics, structured logs (NFR-007); metrics must not be exposed publicly through Traefik', deps: [], ids: ['tz-matrix-06', 'tz-matrix-07'] },

  // Frontend order follows when the backend parts it needs are ready.
  { key: 'F-doctor', lane: 'frontend', area: 'frontend/src: app/(doctor), components/doctor', deps: ['B-clinical'], ids: ['fe-doctor-01', 'fe-doctor-04', 'fe-doctor-06', 'fe-doctor-02', 'fe-doctor-03', 'task005-triage-a-T1-03', 'task005-triage-b-33', 'fe-doctor-05', 'fe-doctor-07', 'fe-doctor-08', 'i18n-01', 'i18n-04'] },
  { key: 'F-patient', lane: 'frontend', area: 'frontend/src: app/(patient), app/(public) doctor pages, components/{booking,appointments,patient,consent,catalog}', deps: ['B-catalog-schedules'], ids: ['fe-patient-01', 'fe-patient-03', 'i18n-03', 'tz-matrix-04', 'fe-patient-02', 'fe-patient-05', 'fe-patient-06', 'fe-patient-07', 'i18n-02', 'task005-triage-b-18', 'task005-triage-b-01'] },
  { key: 'F-admin', lane: 'frontend', area: 'frontend/src: app/(admin), components/admin', deps: ['B-analytics'], ids: ['fe-admin-02', 'fe-admin-05', 'be-catalog-05', 'fe-admin-03', 'fe-admin-01', 'task005-triage-a-V2bV3-04', 'fe-admin-04', 'fe-admin-06'] },
  { key: 'X-client-ip', lane: 'frontend', area: 'frontend server-side proxying of /api calls, libs/common trust-proxy config, infra/traefik', deps: ['B-observability'], ids: ['infra-tools-03'] },
]

const IMPL_RESULT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    done: { type: 'array', items: { type: 'string' } },
    rejected: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'string' } },
    remaining: { type: 'array', items: { type: 'string' } },
    commit: { type: 'string', description: 'sha of the commit of this run, or empty' },
    notes: { type: 'string' },
  },
  required: ['status', 'done', 'rejected', 'questions', 'remaining', 'commit', 'notes'],
}

const COMMON = (p) => `Repository: ${REPO}. Branch must be fix/product-polish — check with \`git branch --show-current\`; if it is different, change nothing and return status "blocked".
READ FIRST: tasks/TASK-006/findings/verify-polish-context.md (owner decisions, rules, what needs the owner).
Each item id has a finding file: \`ls tasks/TASK-006/findings/*/<id>.json\` (problem, evidence, proposed fix).

LANES: three agents work at the same time in this checkout.
- backend-a edits only: ${LANES['backend-a']}.
- backend-b edits only: ${LANES['backend-b']}.
- frontend edits only: ${LANES['frontend']}.
- specs/api-designer-spec.md is shared by both backend lanes: edit only the sections of your own endpoints, re-read the file right before each edit.
You are lane ${p.lane}. Never edit, stage, stash, reset or check out another lane's files. If a fix really needs a file of another lane, record it in "notes" as a handoff instead. Never run git stash, git reset, git checkout -- <path>, git clean, git commit -a, git add -A or git add .

COMMITS — ONE per run, not per item: implement all items you handle in this run, run the checks, then make a single commit of your own files with an explicit pathspec:
\`git add <paths> && git commit -m "<type>(<scope>): <summary of the package>" -m "TASK-006: <id1>, <id2>, …" -m "<one line per item: what changed>" -- <paths>\`
Also commit this way before you return "partial", so the next agent starts from a clean state. If git reports index.lock, wait 5 s and retry. Never --no-verify (if a hook fails, fix the cause). No Co-Authored-By and no "Generated with" lines. Never commit tasks/TASK-006/**. Never push.
Uncommitted changes in your lane's files at start are the work of the previous agent of this package: read the progress file, keep what is right, finish it and include it in your commit.

RULES: The docker stack is NOT running — rely on unit tests. API changes must be additive (new optional fields, new query params, new documented error codes in specs/api-designer-spec.md); a breaking change is a question for the owner. Follow the surrounding code's patterns, naming and comment density. A hook blocks the 10th Edit of the same file by one agent: plan your edits, use Write for large rewrites. Keep temp files in /tmp/claude-1000/-mnt-BE48B9DF48B9971D-projs-MedCenter/159ba540-ba70-443c-ae30-e87f8af7ecfb/scratchpad/ prefixed with your package key.
SPEED: no code review follows, so get it right the first time, but do not over-test. While working, run only the spec files you touched. Before the commit run once: backend — \`npx nx run-many -t test,lint -p <touched projects> --parallel=1\` and \`npm run typecheck\`; frontend — \`cd frontend && npx jest <related spec files> && npx tsc --noEmit && npx next lint\` (the full jest suite is run later by the orchestrator).
`

const implPrompt = (p, attempt) => `You implement package ${p.key} (lane: ${p.lane}) of the TASK-006 product polish pass. Attempt ${attempt}.
Package area: ${p.area}
Items, in priority order: ${p.ids.join(', ')}
${COMMON(p)}
PERSISTENCE — the token limit can kill you at any moment:
- Progress file: tasks/TASK-006/progress/verify-${p.key}-progress.md. Read it FIRST and also \`git log --oneline --grep "TASK-006: "\` — never redo an item already done. One line per item: "- <id>: done <sha or 'uncommitted'> — <what>" | "- <id>: rejected — <why, with file:line>" | "- <id>: question — <question in Russian with options and your recommendation>" | "- <id>: in-progress — <state>". Update it after each item (it is not committed, so this is cheap).
- Budget per run: about 10 items or 200 tool calls, whichever comes first; then commit and return status "partial" with the remaining ids — a fresh agent continues.

PER ITEM:
1. Read the finding file and confirm the defect in the current code (it may be wrong, already fixed, or a duplicate of an item you already did — then mark rejected with the reason, or done with the earlier sha).
2. If the fix needs an owner decision (product choice, breaking API change, contradicts the ТЗ or an owner decision in the context file) — do not implement; record a question.
   Orchestrator overrides: implement fe-doctor-04, fe-admin-05, be-catalog-05 and fe-admin-03 even though their files say needsDecision (fe-admin-03 only if existing admin APIs already give the patient's name, else a question). Implement be-auth-oauth-08 only if spec §2.1 / ADR-008 / ADR-011 already prescribe revoking the session on reuse; otherwise record a question. Items that appear in a backend and a frontend package: do only your lane's part. Earlier backend packages left frontend handoffs in their progress files (tasks/TASK-006/progress/verify-B-*-progress.md) — the frontend lane reads the ones for its items (e.g. tz-matrix-04 in B-notify, be-encounter-03 / T1-04 / be-encounter-05 in B-clinical, be-appointment-03 in B-appt).
3. Otherwise implement it, with a unit test that fails without the fix where practical.
4. Update the progress file.
After all items: checks, the one commit, put the sha into the progress lines, set the last line to "Status: done", return status "done".`

let consecutiveDeaths = 0
let halted = false
const resolvers = {}
const finished = {}
for (const p of PKGS) finished[p.key] = new Promise(r => { resolvers[p.key] = r })
const haltAll = () => { if (!halted) { halted = true; log('Two agents in a row died — halting; resume after the limit resets') } for (const k in resolvers) resolvers[k]({ key: k, status: 'halted' }) }
const track = (r) => { if (!r) { consecutiveDeaths++; if (consecutiveDeaths >= 2) haltAll() } else consecutiveDeaths = 0; return r }

const runPackage = async (p) => {
  if (SKIP.has(p.key)) { resolvers[p.key]({ key: p.key, status: 'skipped' }); return { key: p.key, status: 'skipped' } }
  for (const d of p.deps) await finished[d]
  if (halted) return { key: p.key, status: 'not-started' }
  let impl = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !halted; attempt++) {
    const r = track(await agent(implPrompt(p, attempt), { label: `impl:${p.key}#${attempt}`, phase: 'Implement', schema: IMPL_RESULT, model: 'sonnet' }))
    if (!r) break
    impl = r
    if (r.status !== 'partial') break
    log(`${p.key}: partial after attempt ${attempt}, ${r.remaining.length} left`)
  }
  const out = { key: p.key, status: impl && impl.status === 'done' ? 'done' : (halted ? 'halted' : 'impl-incomplete'), impl }
  resolvers[p.key](out)
  return out
}

const runLane = async (lane) => {
  const res = []
  for (const p of PKGS.filter(x => x.lane === lane)) res.push(await runPackage(p))
  return res
}

phase('Implement')
const lanes = await Promise.all(Object.keys(LANES).map(runLane))
const all = lanes.flat()
log(`${all.filter(r => r.status === 'done').length}/${all.length} packages done${halted ? ' — HALTED' : ''}`)
return { halted, packages: all.map(r => ({ key: r.key, status: r.status, done: r.impl ? r.impl.done.length : 0, commit: r.impl ? r.impl.commit : '', rejected: r.impl ? r.impl.rejected : [], questions: r.impl ? r.impl.questions : [], notes: r.impl ? r.impl.notes : '' })) }
