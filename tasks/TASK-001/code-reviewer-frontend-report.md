# Code Review — Frontend TASK-001 (`frontend/`)

**Scope:** `frontend/src` — Next.js 15 App Router (route groups `(public)/(auth)/(patient)/(doctor)/(admin)`), `components/*`, `lib/api/*`, `lib/contracts.ts`, `store/*`, `app/api/auth/*` token broker, e2e stubs.
**Specs:** `tasks/TASK-001/requirements-analyst-requirements.md` (21 FR), `tasks/TASK-001/brainstorming-design.md` (D1–D9), `specs/frontend-design-spec.md` (routes/state/errorCode→UX map, §5).
**Branch:** `main` @ `4f52658` + untracked/modified `frontend/node_modules`, `package-lock.json` (added `ts-node` during verification — revert before commit).

## Summary

Broad coverage scaffold for 21/21 FR with clean conventions (kebab-case files, no `any`, no `!`, explicit return types, `readonly`, skip-link, `:focus-visible`, `prefers-reduced-motion`, `aria-live` conflict toasts, `Idempotency-Key` helpers, 16-code `ERROR_CODES` map, compartment-safe API paths with no `patient=` param). **Do NOT merge as-is:** verification FAILS — `tsc --noEmit` broken by JSX in a `.ts` file, `jest` runs 0 tests (10/10 suites fail, no transform configured), and the auth data-path is disconnected (`apiFetch` never sends `Authorization`, `/session` returns nulls, `useSessionStore` never hydrated). Plus `middleware` is misplaced so it never executes. Fix Criticals below, then re-run `test/lint/build/tsc`.

## Verification Evidence (all in `frontend/`)

- `npm install --no-audit --no-fund` — PASS (487 packages; warnings: `next@15.0.3` CVE-2025-66478 advisory, deprecated `inflight/glob/abab/whatwg-encoding`, `sharp` install-scripts notice).
- `./node_modules/.bin/tsc --noEmit` — **FAIL**: `src/lib/utils.ts(23,14): error TS1005: '>' expected` + 2 follow-ons (JSX `<h2>` in `.ts` file).
- `./node_modules/.bin/jest --passWithNoTests` — **FAIL**: `10 failed, 10 total / Tests: 0 total`. First `ts-node is required` (fixed by installing `ts-node` — dirty change to revert), then every suite `SyntaxError: Cannot use import statement outside a module` at `jest.setup.ts:1` — `jest.config.ts` defines `testMatch` but no `transform` (`@swc/jest`/`ts-jest`/babel all absent).
- `grep TODO|FIXME|HACK src` — clean (0 hits). `grep ": any"` — clean. `grep "!."` — clean. `grep -rni nihdi|inami|mycarenet|belg` — clean (only `https://fhir.by/...`, `http://www.whocc.no/atc`, UCUM select).
- `npm run lint` / `npm run build` — NOT green (blocked on the above; `next lint` is deprecated/removed in Next 15 — needs `eslint` flat config migration; rerun after Critical fixes).

## Issues Found

### Critical (Must Fix)

- [ ] `middleware` never runs — file is at `src/app/middleware.ts`, Next requires `src/middleware.ts` (or root). All route-group guards are dead code — `src/app/middleware.ts:1`
- [ ] `tsc` broken — JSX component `SectionTitle` lives in `src/lib/utils.ts` (a `.ts` file). Fix: rename to `utils.tsx` or move component to `components/` — `src/lib/utils.ts:22-24`
- [ ] `jest` broken — `jest.config.ts` has no `transform`; 10/10 suites fail, 0 tests execute. Fix: add `@swc/jest` (or `ts-jest`) transform, remove ad-hoc `ts-node` dep — `frontend/jest.config.ts:1`
- [ ] Auth data-path disconnected — `apiFetch` never attaches `Authorization: Bearer`, `/api/auth/session` returns `{accessToken: null,...}`, `useSessionStore` is never hydrated from the broker, refresh `accessToken` returned to JS but never persisted. Every `/api/v1/*` call goes out unauthenticated → 401/refresh loop. Fix: broker-owned httpOnly access cookie (or BFF proxy injecting Bearer server-side) + hydrate store from `/session` — `src/lib/api/api-fetch.ts:36`, `src/app/api/auth/session/route.ts:4`, `src/store/use-session-store.ts:27`
- [ ] `callback/route.ts` crashes on malformed `mc_pkce` cookie (`JSON.parse` without try/catch) → 500 on login callback; `secure: true` cookie never sets on `http://localhost` dev; `returnTo` from `state` not allow-list validated (open-redirect surface). Fix: try/catch → `?error=access_denied`, `secure: NODE_ENV === 'production'`, validate `returnTo` starts with `/` not `//` — `src/app/api/auth/callback/route.ts:10,28`
- [ ] Encounter form can never submit — `completeEncounterSchema` requires `diagnoses.min(1)` but UI renders no diagnosis inputs (`Icd10Combobox` never wired in); only `medicationRequests.0.ucumUnit` rendered, no `serviceRequests`/`medicationRequests` editors. Fix: wire diagnoses array + requests editors — `src/components/doctor/encounter-complete-form.tsx:27-44`

### Major (Should Fix)

- [ ] Booking wizard is a single slot-step, not the specified 4-step (doctor → service → time → confirm); `scheduleId={draft.doctorId ?? 'default'}` hardcodes `'default'`. Fix: implement steps 1–2 or narrow the claim — `src/components/booking/booking-wizard.tsx:33-41`
- [ ] `errorCodeToUx()` is dead code — only referenced by its own spec, no component calls it; each call-site hand-rolls its own `errorCode ===` check so the map will drift. Fix: route all `ApiError` handling through it — `src/lib/api/problem.ts:68`
- [ ] `QueryClient` has no defaults — no `staleTime/gcTime/retry` policy, no shared `QueryCache.onError`. Fix per frontend spec §5 — `src/components/providers.tsx:8`
- [ ] Register form drops field errors — `firstName/lastName/password/birthDate` have no `aria-describedby` + error `<p>` (only email does); weak-password zod message is raw English. Fix: per-field alerts + ru-BY messages — `src/app/(auth)/register/page.tsx:32-39`
- [ ] Query-key drift — admin users/rooms/services pages use ad-hoc keys while `queryKeys` defines `adminUsers/adminSchedules/adminRooms/...`; invalidations can miss. Fix: use `queryKeys.*` everywhere — `src/app/(admin)/admin/users/page.tsx:18`
- [ ] Dialogs lack focus management — `SlotGenerationDialog` / `CancelAppointmentDialog` have `role=dialog aria-modal` but no focus trap, `Escape` close, initial-focus, or return-focus. Fix or adopt Radix `Dialog` — `src/components/admin/slot-generation-dialog.tsx:18`
- [ ] `next lint` path dead — Next 15 removes `next lint`; repo has no `eslint.config.*`, so `npm run lint` cannot pass. Fix: add flat-config eslint + `lint` script — `frontend/package.json:8`
- [ ] E2E specs are stubs — 6 files assert headings/static text only; no login/booking/conflict/cancel/encounter/schedule flow is exercised (`fixtures/` empty). Fix or mark placeholders — `frontend/e2e/*.spec.ts`
- [ ] `Icd10Combobox` fires unbounded query per keystroke (no debounce, no abort, results `<ul>` without `listbox/option` roles). Fix: debounce ~250ms + listbox semantics — `src/components/doctor/icd10-combobox.tsx:11-24`
- [ ] `sessionStorage` accessed at store creation — `createJSONStorage(() => sessionStorage)` throws during SSR/prerender. Fix: lazy/guard storage — `src/store/use-booking-draft-store.ts:34`
- [ ] Notifications list never polls — only `NotificationBell` sets `refetchInterval`, the page query does not — `src/app/(patient)/notifications/page.tsx:11`

### Minor (Consider)

- [ ] `cn()` / `submitHandler()` unused — delete or use; `STATUS_COLOR: Record<string,string>` should be `Record<StampStatus,string>`; `ProblemBanner errorCode?: string` should be `ErrorCode` — `src/lib/utils.ts:3`, `src/components/feedback/stamp-badge.tsx:13`
- [ ] Admin tables show only `name` column (users/rooms/services) — likely placeholder vs spec server-pagination + filters — `src/app/(admin)/admin/services/page.tsx:37`
- [ ] Analytics date inputs lack `htmlFor`; pagination arrows icon-only without `aria-label`; locale buttons may miss 44x44 target — `src/components/admin/analytics-dashboard.tsx:17`, `src/components/data-display/paginated-table.tsx:34`
- [ ] `slot-picker` uses inline `toLocaleString('ru-BY')` instead of shared `formatMinskDateTime`; doctor journal hardcodes UTC date not Minsk — `src/components/booking/slot-picker.tsx:34`, `src/app/(doctor)/doctor/appointments/page.tsx:13`
- [ ] Public `getDoctors()` swallows all fetch errors to `[]`; `DoctorProfilePage` renders raw `doctorId` with no detail fetch — `src/app/(public)/doctors/page.tsx:5-13`
- [ ] `PaginatedTable` renders table + mobile cards simultaneously (hidden via CSS) — duplicated DOM/AT announcements — `src/components/data-display/paginated-table.tsx:12-32`
- [ ] `print` button calls `window.print()` with only `.no-print` support — no print stylesheet for prescription card — `src/app/(patient)/prescriptions/page.tsx:26`

### Positive Notes

- Route-group layout, kebab-case files, `no any / no !`, explicit return types, `readonly` props/state, AAA `should…when…` specs, `aria-pressed/current`, `role=alert/status`, `aria-invalid/describedby` on email + ICD-10, `fieldset/legend`, semantic `table th scope`, `skip-link` + `:focus-visible` + `reduced-motion` + `.no-print` in `globals.css`.
- Token hygiene intent is right: PKCE S256, `mc_rt` httpOnly `SameSite=lax`, single-flight refresh, `Idempotency-Key` on booking + slot generation, `TOKEN_REVOKED → logout`, `COMPARTMENT_VIOLATION → 404`, `SLOT_CONFLICT → refetch + assertive toast`, UCUM select-only, read-only finished encounter, `requestId` copy affordance in audit.
- No Belgian-IG leakage; terminology canonicals are `https://fhir.by/...` + `http://www.whocc.no/atc` only.

## Next Steps

**Next by flow:** `/test-generator` `frontend/ for TASK-001` — after Criticals are fixed, add coverage for `apiFetch` refresh/revoke, wizard idempotency, encounter validation, admin pagination.
**Alternatives:**
- `/coder` `frontend/ TASK-001 review fixes` — fix Critical + Major items above.
- `/finishing-branch` — only after `npm test && npm run lint && npx tsc --noEmit && npm run build` are all green and the `ts-node`/`node_modules` dirt is reverted.

