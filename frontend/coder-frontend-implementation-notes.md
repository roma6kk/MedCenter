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
