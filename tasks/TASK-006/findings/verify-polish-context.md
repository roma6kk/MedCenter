# Polish pass — shared context for every agent (read this first)

Repo: /mnt/BE48B9DF48B9971D/projs/MedCenter (Nx monorepo, 9 NestJS services in apps/, libs/ in libs/, Next.js 15 client in frontend/, tools/ = seeds + smoke, infra/ = docker + traefik, bruno/ = API collection).
Branch: docs/task005-ux-audit (latest work; TASK-005 UX + visual audit finished, 14 commits ahead of main, not merged).

## Goal of the pass (owner's words, translated)
"Polish the product: find unimplemented gaps that do NOT need my decision right now and implement them; look for problems in the implementations and fix them (if that does not contradict the ТЗ). Questions that need my decision — write them to a file."

## The ТЗ (coursework assignment, BSTU, deadline 2026-12-15)
Roles «Пациент», «Врач», «Администратор».
- Пациент: аутентификация и авторизация; просмотр доступных врачей и медицинских услуг; поиск и выбор доступного времени для записи; создание и отмена записи; просмотр расписания и истории посещений; просмотр назначений врача; получение уведомлений об изменениях статуса записи.
- Врач: просмотр расписания и списка пациентов; просмотр истории обращений пациента; оформление результатов приёма; постановка диагноза и формирование рекомендаций; назначение лечения и медицинских процедур.
- Администратор: управление пользователями; управление услугами; управление кабинетами; управление системными настройками; просмотр глобальной аналитики и отчётов.
- Микросервисы, TypeScript, Node.js, NestJS; клиент React + Next.js; контейнеризация.
Detailed requirements: tasks/TASK-001/requirements-analyst-requirements.md (FR-001…FR-021, NFR-001…011, BR-001…009).
Specs: specs/MANIFEST.md (index), specs/architect-architecture.md (ADR-001…021), specs/api-designer-spec.md (59 endpoints, error codes), specs/frontend-design-spec.md.
Policy: AGENTS.md (FHIR International R4 only, never Belgian IGs/terminology; no AI co-author lines).

## Owner decisions already taken — do NOT re-raise them as questions, do NOT undo them
- Transactional outbox: implemented (FHIR Basic in HAPI + apps/outbox-relay, stages 1–3). Payloads minimised on purpose (cancelled has no reason, encounter.completed has diagnosisCount, patient.registered has no email).
- HAPI readiness: waited for in `npm run stack:wait` via /fhir/metadata through Traefik; NO custom HAPI image, NO compose healthcheck for HAPI.
- Analytics report 9.1 has a separate `fulfilled` group («Посещено») — done.
- Landing: clinic info (licence, УНП, address, hours) stays demo data with `home.demoNote`; partner/client lists in frontend/src/components/catalog/home-content.ts stay as they are; B2B inquiry and DMS/insurance features are NOT to be built (blocks are text-only without promises).
- Consent (TASK-003): EMR consent recorded on paper + scan by ADMIN/DOCTOR; 7.1/7.3 → 409 CONSENT_REQUIRED; `emergencyReason` bypass shown in audit; CONSENT_ENFORCEMENT=block; demo patient novikov has NO consent on purpose.
- Patient profile: only the phone is editable (no e-mail change, no phone on registration form).
- Rebrand to «Лайфлайн»/Lifeline is done for user-facing text; technical identifiers are kept ON PURPOSE: npm scope @medcenter/*, OAuth client `medcenter-web`, hosts medcenter.by / medcenter.localhost, MEDCENTER_EXT extension URLs, docker names, localStorage keys `medcenter.*`, test e-mails @medcenter.test. Do not report these as bugs.
- Tailwind stays at 3.4. Dark theme switch exists (V1).
- Demo/test leftovers in HAPI (old booked appointments with finished encounters, E2E-check resources, deactivated e2e-check.doctor3): owner said leave them. `seed:demo --repair` exists.
- The git-ignored docker-compose.override.yml (OAUTH_CLIENTS_JSON override) stays.
- Belarus context: МКБ-10 (adapted МЗ РБ), АТХ/ATC, UCUM, canonical URLs https://fhir.by/... .

## Open owner questions already collected (TASK-005) — the raw list
tasks/TASK-005/verify-open-questions.md. These are still unanswered. Most need the owner (new endpoints, product scope, design taste). A few are plain bugs or robustness gaps that need no decision. Do not silently implement anything from that list that changes product scope or API contract.

## What counts as "needs owner decision" vs "just fix it"
Just fix (no decision): bugs (wrong behaviour vs ТЗ/spec/ADR/obvious intent), crashes, unhandled errors, missing error/empty/loading states, broken or missing i18n (ru/en parity, hardcoded Russian in components), a11y defects, security defects (OWASP, authz holes, missing validation at boundaries), data races, wrong time zone handling (clinic is Europe/Minsk, UTC+3), flaky seed/test tooling, dead code, inconsistent behaviour between two places that already do the same thing, a spec'd endpoint/field that is missing, a ТЗ function that is clearly expected but missing and has an obvious shape that follows existing patterns.
Needs owner: new product features beyond ТЗ, API contract changes that other clients would notice in a breaking way, legal/medical-policy choices, design taste choices, data deletion, anything contradicting an owner decision above, anything that needs real-world data (real addresses, real companies), choosing between two reasonable product behaviours.

## Practical rules for agents
- Never read or edit .env / .env.* / secrets/. Never print secrets. Demo passwords live in tools/demo-seed/output/demo-manifest.json — never copy them into reports.
- No `rm -rf`, `sudo`, `chmod 777`, `pkill -f next-server`, no `git stash`, no `git checkout -- <file>` of files you did not change, no `git reset --hard`, no force-push.
- This machine exports NODE_ENV=development; `next build` needs NODE_ENV=production; never run `next build` while a `next dev` is running (shared .next).
- Nx parallel builds race on dist/libs: use `--parallel=1` for build targets.
- Prefix every temp file you create with your agent label, and keep temp files in /tmp/claude-1000/-mnt-BE48B9DF48B9971D-projs-MedCenter/733f5aaa-b0c1-4de4-83b7-34503348dfda/scratchpad/ (never in the repo root).
- Baseline (2026-11-02, before this pass): backend lint (16 projects) and all unit tests green; tools tests 476 green; frontend tsc / next lint / jest (257 suites, 2787 tests) green. Root `npm run typecheck` is red only because of untracked docs/pz/screens/*.ts (known, will be fixed by excluding `docs`). Logs: /tmp/claude-1000/-mnt-BE48B9DF48B9971D-projs-MedCenter/733f5aaa-b0c1-4de4-83b7-34503348dfda/scratchpad/baseline/. Do not re-run whole suites; targeted single spec files are fine.
- Pre-built maps to save discovery calls: tasks/TASK-006/findings/verify-map-backend-routes.txt (every controller route with file:line) and tasks/TASK-006/findings/verify-map-frontend-api-calls.txt (every frontend API call site). i18n catalogues: frontend/src/messages/{ru,en}.json.
- Shell note: the Bash tool runs zsh-like globbing — quote glob patterns (e.g. grep --include='*.ts').
- The docker stack is NOT running during the search phase. Judge from code, specs and unit tests.
- Commits never carry Co-Authored-By or "Generated with" lines.
