# Code Review — Frontend TASK-001 Critical-fix Verification (`frontend/`)

**Scope:** the four Criticals from `tasks/TASK-001/code-reviewer-frontend-report.md` — middleware location,
callback hardening, auth cookie/Bearer wiring, encounter form wiring — plus the changed files
`src/components/doctor/{encounter-complete-form,icd10-combobox}.tsx` and their spec, and the auth route
handlers they depend on.
**Specs:** `tasks/TASK-001/requirements-analyst-requirements.md` (FR-011…FR-014), `specs/api-designer-spec.md` §7.3,
`specs/frontend-design-spec.md` §175.
**Branch:** `main` @ `4f52658`; `frontend/` is untracked.
**Method:** read + trace, live dev-server probe (`next dev -p 3137`), and the existing suites. Also checked the
Vercel Web Interface Guidelines and WCAG 2.2 AA checklist per the skill.

## Summary

**All four Criticals are closed.** Three were already correct (verified, not assumed) and the fourth —
encounter form wiring — was genuinely broken and is now fixed. `tsc`, `jest` (18 suites / 201 tests), `next lint`,
and `next build` all pass. Runtime probes confirm the middleware redirect, the anonymous token broker, and a
fail-closed callback. No Critical or new Major *introduced* by the fix. The Major/minor findings below are
pre-existing or design-level; none block the Critical-fix goal.

## Verification Evidence

- `tsc --noEmit` = 0 · `jest --passWithNoTests` = 18/18 suites, 201/201 tests · `next lint` = 0 warnings · `next build` = 0 (`ƒ Middleware 32.1 kB`).
- Live: `GET /booking` → `307 /login?returnTo=%2Fbooking` (middleware executes). `GET /api/auth/session` (no cookie) → `200` anonymous JSON. `GET /api/auth/callback` with malformed `mc_pkce` → `307 /login?error=access_denied` (no 500). `GET /api/auth/authorize` → httpOnly `mc_pkce`, S256, 600 s.
- `encounter-complete-form.spec.tsx`: 7 pass, incl. happy-path atomic submit asserting the `diagnoses` body.
- `grep TODO|FIXME|HACK`, `: any`, `!.` — clean. No Belgian-IG leakage.

### Critical closure

| Critical | Status | Evidence |
| --- | --- | --- |
| Middleware location | ✅ already correct | live file `src/middleware.ts`; build bundle + `/booking` redirect |
| Callback hardening | ✅ already correct | `return-to.spec.ts`; live 307 on malformed cookie; conditional `secure` |
| Auth cookie/Bearer wiring | ✅ already correct | `api-fetch-auth.spec.ts`, `api-fetch-refresh.spec.ts`, `session-client.spec.ts`; live `/api/auth/session` |
| Encounter form wiring | ✅ fixed this pass | `encounter-complete-form.tsx`; new happy-path test |

## Issues Found

### Critical (Must Fix)

- none.

### Major (Should Fix)

- [ ] **`mc_session` is a forgeable gate, not an auth boundary** — `httpOnly: false` and the value is the constant `'1'`, so any script can set it and pass the middleware. Real authorization is server-side per `/api/v1` call (Bearer), which is correct, but the middleware should not be presented as a security control; consider an httpOnly signed marker (or drop the cookie and gate server-side) — `src/app/api/auth/session/route.ts:70`, `src/app/api/auth/callback/route.ts:42`, `src/app/api/auth/refresh/route.ts:18`.
- [ ] **`mc_session` outlives the wrong token** — its `maxAge` is `tokens.expires_in` (~1 h) while the refresh cookie is 14 days, so after an hour the middleware bounces a still-refreshable user to `/login` (the broker never gets to run) — forced re-login — `src/app/api/auth/callback/route.ts:42`, `src/app/api/auth/session/route.ts:74`, `src/app/api/auth/refresh/route.ts:18`.
- [ ] **ICD-10 combobox lacks arrow-key navigation / `aria-activedescendant`** — roles are correct and Enter/Space select, but a combobox must support Up/Down + Home/End and expose the active option — `src/components/doctor/icd10-combobox.tsx:63-72`.
- [ ] **Observations section is still free text** — API §7.3 defines an optional structured `ObservationDto[]` (UCUM); the form only shows a note, so vitals are stuffed into `summary` — `src/components/doctor/encounter-complete-form.tsx:143-146`.

### Minor (Consider)

- [ ] `logout` returns `307` on a `POST`; `fetch` re-issues the POST to `/login` before the client's own `location.assign`. Return `204`/`200` (the client redirects) — `src/app/api/auth/logout/route.ts:10`.
- [ ] Row controls share accessible names (`Удалить диагноз` ×N, UCUM label ×N); append the row index to `aria-label` — `src/components/doctor/encounter-complete-form.tsx:48,80,105,130,135`.
- [ ] First error is not focused on submit (WIG forms rule) — `src/components/doctor/encounter-complete-form.tsx` (submit path).
- [ ] Code inputs lack `spellCheck={false}` / `autoComplete="off"`; placeholder `J06.9` should read `J06.9…` — `src/components/doctor/icd10-combobox.tsx:59`, `src/components/doctor/encounter-complete-form.tsx:124`.
- [ ] Three editors repeat the label+input+error trio (DRY); extract a `TextField` — `src/components/doctor/encounter-complete-form.tsx:46-141`.
- [ ] `UCUM_UNITS[0] ?? 'mg'` fallback is dead (array literal) — `src/components/doctor/encounter-complete-form.tsx:15`.
- [ ] `ts-node` remains in devDeps although `jest.config.ts` uses the `next/jest` SWC transform — drop it. `frontend/package.json:39`.

### Web Interface Guidelines (terse, by file)

```
## src/components/doctor/encounter-complete-form.tsx
:124 - ATC input missing spellCheck={false} / autoComplete="off"
:48,80,105,135 - repeated row-level button names; add per-row aria-label
:130 - repeated UCUM label; add row context
:submit - focus first invalid field on submit (not implemented)
## src/components/doctor/icd10-combobox.tsx
:59 - placeholder "J06.9" → "J06.9…"
:63-72 - listbox needs ArrowUp/Down + aria-activedescendant
## src/components/doctor/encounter-complete-form.tsx (positive)
✓ inline errors with role="alert", fieldset/legend, semantic buttons
✓ form label htmlFor + unique ids per row
```

### Positive Notes

- The atomic `CompleteEncounterDto` is now reachable: diagnoses `useFieldArray` (min 1, one row by default,
  remove hidden at one), plus service/medication editors; UCUM stays select-only (BR-009).
- `Icd10Combobox` gained an `id` prop so each row has unique `label`/`listbox`/`error` ids — the accessibility fix
  the multi-row rewrite required.
- `ProblemBanner` now surfaces the real `errorCode` instead of a hard-coded `INTERNAL`.
- Hardening tests are genuinely strong: `return-to.spec.ts` covers encoded/protocol-relative/backslash/control-char
  payloads and malformed PKCE cookies; refresh/revoke paths have dedicated boundary suites.
- No `any`, no `!`, explicit return types, `readonly` props preserved.

## Next Steps

**Next by flow:** `/test-generator` `frontend/ for TASK-001` — extend coverage for the encounter editors (array
add/remove, invalid ATC/ICD codes), wizard idempotency, and admin pagination.

**Alternatives:**
- `/coder-frontend` `frontend/ TASK-001 review fixes` — close the Major items (session cookie lifetime, combobox
  keyboard navigation, structured observations).
- `/finishing-branch` — only after the `ts-node` dirt is reverted and DoD Standard tier is green.
