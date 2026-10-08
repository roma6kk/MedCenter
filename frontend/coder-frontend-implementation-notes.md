# TASK-001 Frontend — Implementation Notes

Author: coder-frontend · Date: 2026-10-05 (updated after code review)

## Scope variance (deliberate)

- Plan/spec say Nx `apps/web`; this skill mandates all frontend code in `frontend/`.
  Implemented as standalone Next.js 15 App Router app in `frontend/` (no root `package.json`).
- To adopt Nx later: move `frontend/*` → `apps/web/*` and add `project.json`; no component changes needed.

## Coverage (21/21 FR)

- Public (FR-002): `/`, `/doctors`, `/doctors/[doctorId]` (RSC catalog, 5-min revalidate, bounded fetch).
- Auth (FR-001): `/login` (SMART authorize entry), `/register` (zod ~ class-validator), token broker `/api/auth/*` (PKCE S256, httpOnly `mc_rt`, single-flight refresh, Idempotency-Key helper).
- Patient (FR-003…FR-008): `/booking` (4-step wizard, sessionStorage draft, SLOT_CONFLICT toast + refetch), `/appointments`, `/appointments/[id]`, `/history`, `/prescriptions` (print), `/profile`, `/notifications` (30s polling, mark read).
- Doctor (FR-009…FR-014): `/doctor/appointments` (compact journal, Minsk date, open only when booked), `/doctor/schedule`, `/encounters/[id]` (atomic complete form, UCUM select-only, read-only after finished), `/patients/[id]`.
- Admin (FR-015…FR-021): `/admin/{analytics,users,services,rooms,schedules,terminology,audit}` — server pagination, ScheduleEditor overlap highlight, SlotGenerationDialog with Idempotency-Key, TerminologyImportPanel 202/409 states, AuditTable with mono requestId copy.
- Error map: all 16 `errorCode` values in `src/lib/api/problem.ts`; COMPARTMENT_VIOLATION → 404, SLOT_CONFLICT → refetch.

## Code-review fixes applied (2026-10-05)

Critical:

1. **Dead middleware removed** — `src/app/middleware.ts` deleted; the live `src/middleware.ts` (delegating to `lib/auth/route-guard`) now runs. `next build` emits a compiled middleware bundle (32.1 kB), confirming it executes.
2. **JSX out of a `.ts` file** — `SectionTitle` moved from `lib/utils.ts` to `components/feedback/section-title.tsx`; the stale duplicate `lib/utils.tsx` that shadowed the module in webpack was deleted.
3. **Jest transform configured** — `jest.config.ts` now wraps `next/jest` (SWC transform), so the suites execute instead of failing with "Cannot use import statement outside a module".
4. **Auth data-path wired** — new `lib/auth/{access-token,jwt,session-client}.ts`: broker `/api/auth/session` exchanges the httpOnly `mc_rt` refresh cookie for a short-lived access token, decodes claims, and hydrates `useSessionStore`; `apiFetch` attaches `Authorization: Bearer` and clears the in-memory token on TOKEN_REVOKED. The refresh token never reaches JS.
5. **Cookie `secure` flag** — now conditional (`NODE_ENV==='production' || https`), so login works on `http://localhost`; PKCE cookie parsing is already guarded by `parsePkceCookie`.

Major:

6. **ESLint enabled** — added `eslint` + `eslint-config-next` devDeps and `.eslintrc.json`; `npm run lint` passes with no warnings.
7. **E2E honesty** — the 6 specs are documented as smoke placeholders; authenticated flows are marked `test.fixme` until CI wires the full stack.
8. **ICD-10 combobox** — 250 ms debounce, query `signal` abort, `role="combobox"/"listbox"/"option"` with keyboard selection.
9. **SSR-safe storage** — `use-booking-draft-store` resolves a no-op storage server-side instead of touching `sessionStorage` at module load.
10. **Notifications polling** — the page query now sets `refetchInterval: 30_000` (previously only the bell did).

Minor: `Record<StampStatus,string>` status map, `errorCode?: ErrorCode`, shared `formatMinskDateTime`/`minskDateKey` helpers (doctor journal no longer drifts to UTC), `htmlFor` on analytics inputs, `aria-label` on pagination arrows, 44×44 locale targets, public catalog distinguishes error vs empty, doctor profile fetches the real record, print stylesheet.

## Remaining Criticals closed (2026-10-05, second pass)

Verified each named Critical against the running code, then wired the one that was still open:

1. **Encounter form wiring (fixed).** `EncounterCompleteForm` now renders the full atomic body:
   `diagnoses` is a `useFieldArray` (starts with one row, `min(1)` enforced) with `Icd10Combobox`
   per row + a display input; `serviceRequests` and `medicationRequests` get add/remove editors
   (ATC code, dosage text, UCUM select-only unit). Previously the form rendered no diagnosis
   input and only `medicationRequests.0.ucumUnit`, so `completeEncounterSchema` could never pass
   and the doctor could never complete an encounter. `Icd10Combobox` gained an `id` prop so
   multiple rows have unique label/listbox/error ids; the `ProblemBanner` now reports the real
   `errorCode` instead of a hard-coded `INTERNAL`.
2. **Middleware location (already correct).** Live file is `src/middleware.ts`; `src/app/middleware.ts`
   is gone. Confirmed by build bundle (`ƒ Middleware 32.1 kB`) and a live request:
   `GET /booking` → `307 /login?returnTo=%2Fbooking`.
3. **Callback hardening (already correct).** Malformed/missing `mc_pkce` → `307 /login?error=access_denied`
   (no 500); `parsePkceCookie` try/catch, `sanitizeReturnTo` denylist, `secure` conditional on prod/https.
4. **Auth cookie/Bearer wiring (already correct).** `apiFetch` attaches `Authorization: Bearer` from the
   in-memory token hydrated by `loadSession` (broker `/api/auth/session` exchanges the httpOnly `mc_rt`
   cookie); 401 → single-flight refresh → retry; `TOKEN_REVOKED` → logout + redirect. Live
   `GET /api/auth/session` (no cookie) → `200` anonymous JSON.

## Verification (all run in `frontend/`)

- `./node_modules/.bin/tsc --noEmit` — PASS (clean)
- `./node_modules/.bin/jest --passWithNoTests` — PASS: 18 suites, 201 tests (incl. `jwt.spec`, `access-token.spec`, `session-client.spec`, `api-fetch-auth.spec`, and the rebuilt `encounter-complete-form.spec.tsx`)
- `./node_modules/.bin/next lint` — PASS: no ESLint warnings or errors
- `./node_modules/.bin/next build` — PASS: 27 routes prerendered, middleware compiled (32.1 kB)
- Runtime (`next dev -p 3137`): `/booking` redirected to `/login`; `/api/auth/session` 200 anonymous; `/api/auth/callback` with malformed cookie 307 (not 500); `/api/auth/authorize` sets httpOnly `mc_pkce` (S256, 600 s)
- `grep TODO|FIXME|HACK src` — clean; no `any`, no non-null assertions
- No Belgian terminology; FHIR canonicals only `https://fhir.by/...`, `http://unitsofmeasure.org`, `http://www.whocc.no/atc`

## Known limitations

- E2E flow specs are placeholders (`test.fixme`) — they require the full Docker stack plus a seeded SMART session; only the public catalog smoke test and the no-`patient=`-param invariant run.
- `next lint` is deprecated in favour of the ESLint CLI; migration to a flat config is deferred to a later task.
- Next.js 15 async `params`/`searchParams` adopted for all dynamic routes.
- `EncounterCompleteForm` observations section is still free-text; the server `ObservationDto[]` (API §7.3) is not modelled in the frontend contract.
- The frontend `completeEncounterSchema` is a simplified mirror of `CompleteEncounterDto`: `serviceRequests` uses `{code, display}` and `medicationRequests` carries `ucumUnit`, whereas the server DTO expects `codeSystem`/`note` — reconcile once the encounter-service contract is frozen.

## Gap closure vs plan (M6 Task 19, 2026-10-08)

Closed gaps against `tasks/TASK-001/writing-plans-plan.md` (Task 16/19) and `specs/frontend-design-spec.md` §1, §4, §5.4:

- **403 redirect.** `/403` page (`src/app/403/page.tsx`) renders `ForbiddenState`. Each route group layout wraps children in `RoleGuard` (`components/layout/role-guard.tsx`, decision table in `lib/auth/role-access.ts`): wrong role → `/403`, anonymous after hydration → `/login?returnTo=`, children are not mounted until access is decided. Role gating stays UX-only (ADR-009).
- **Error map.** Moved `ErrorUx` and the 16-entry map into `src/lib/api/error-code-map.ts` (`Record<ErrorCode, ErrorUx>`, so a missing code fails to compile). `problem.ts` re-exports `errorCodeToUx` for existing callers. Spec: `error-code-map.spec.ts`.
- **Messages.** `errors` namespace in `ru.json`/`en.json` now holds all 16 `errorCode` keys (was 8).
- **Components (plan Task 19 list).** Added `AtcCodeField`, `UcumUnitSelect` (wired into `EncounterCompleteForm`), `NoshowButton` (wired into the doctor journal), `DoctorScheduleView` (wired into the schedule page), `UsersTable` (wired into admin users), `RoomUsageDrawer` (wired into admin rooms). Each has a spec.

Deviations from the plan text:

- Plan tests use `errorCodeMap.X.view`; the repo's existing contract uses `kind`, so `kind` was kept.
- Plan's `lib/__tests__/` spec location → colocated `*.spec.ts(x)`, the project convention.
- Middleware does not check role (the `mc_session` cookie carries no role); the role gate is client-side in the layouts.
- `UcumUnitSelect` uses the static `UCUM_UNITS` snapshot, not `$expand` (API 2.3.2).
- `RoomUsageDrawer` and `DoctorScheduleView` response shapes are assumptions; the API spec does not pin them.

Still open from spec §4 (not in plan Task 19, not done): `PrescriptionCard`, `NotificationCenter`, `RelatedPersons`, `PatientHeader`, `ProfileCard`, `UserForm`/`ServiceForm`/`RoomForm`, `ServicesTable`, `ValueSetExplorer`, `DoctorCard`/`ServiceGrid`/`FilterBar`, and the users/rooms pages still lack their CRUD actions.

Verification (`frontend/`, run with `node node_modules/<pkg>/bin/...`):

- `tsc --noEmit` — PASS.
- `jest --runInBand` — PASS: 29 suites, 244 tests. Parallel workers fail to start on this machine (no `@next/swc-win32-x64-msvc`), so run in band.
- `next lint` — PASS.
- `next build` — PASS with `NODE_ENV=production` (28 routes, `/403` prerendered). Under the shell's `NODE_ENV=development` the `/404` prerender fails with an `<Html>` error; that is environmental.
