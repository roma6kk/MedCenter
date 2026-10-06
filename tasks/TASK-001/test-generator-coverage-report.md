# Test Generator — Coverage Report (frontend/ TASK-001)

**Scope:** `frontend/` — Jest coverage for the areas requested after the frontend Criticals were fixed: the
encounter array editors, booking-wizard idempotency, and admin pagination (plus the existing `apiFetch`
refresh/revoke set).
**Specs:** `tasks/TASK-001/code-reviewer-frontend-criticals-report.md` (§Next Steps),
`tasks/TASK-001/requirements-analyst-requirements.md`, `specs/api-designer-spec.md` §7.3.
**Run:** `cd frontend && npx jest --passWithNoTests` → **19 suites, 212 tests, all passing** (was 18 / 201).

## Suites owned by this pass

| Suite (file) | Area | Cases |
| --- | --- | --- |
| `src/components/doctor/encounter-complete-form.spec.tsx` | Encounter editors + atomic submit | 13 — UCUM select exposes only whitelisted units; empty summary/diagnosis blocks submit; missing-diagnosis block; invalid ICD-10 blocks; **valid payload submits with `POST` + exact `diagnoses` body**; **`Idempotency-Key` sent as a UUID**; **add a second diagnosis row → both submitted**; **remove a row but never the last**; **service + medication requests submitted**; invalid ATC blocks; `readOnly` toggles the banner; `ENCOUNTER_STATE_INVALID` is the read-only trigger |
| `src/components/booking/booking-wizard.spec.tsx` | Wizard idempotency | 7 — one key per booking; persisted key reused on retry; **persisted key reused after remount (reload)**; **fresh key for a new booking once the draft cleared**; `SLOT_CONFLICT` → toast + draft kept; success clears draft; confirm disabled until a slot is selected |
| `src/app/(admin)/admin/users/page.spec.tsx` | Admin pagination | 3 — first page requested on mount; **next control refetches `?page=2`**; empty state rendered for an empty page |
| `src/components/data-display/paginated-table.spec.tsx` | Pagination control | 6 — headers/rows; `page / totalPages`; prev/next disabled at bounds; next/prev call `onPage` correctly |
| `src/lib/api/api-fetch-refresh.spec.ts` | `apiFetch` refresh / revoke | 4 — single-flight refresh shared across concurrent 401s; one retry only (no loop); `TOKEN_REVOKED` → logout POST + redirect, no refresh; problem payload preserved when refresh fails |

## Test-infrastructure notes

- `frontend/jest.config.ts` wraps `next/jest` (`createJestConfig`) for the SWC transform; `testMatch` is limited to
  `src/**` so the Playwright `e2e/` stubs are not picked up by Jest.
- `frontend/jest.setup.ts` installs jsdom `fetch`/`Response`/`crypto` shims so `apiFetch` specs can spy on
  `global.fetch` and `idempotencyKey()` works.
- `ATC_PATTERN` in `src/lib/contracts.ts` accepts the valid 4- and 7-char WHO ATC levels (`J01C`, `N02BE01`).
- Encounter/terminology queries are mocked to return `{ items: [] }` so component tests emit no react-query
  "data cannot be undefined" warnings.

## Verification evidence

- `npx jest --passWithNoTests` — **19 passed / 19 suites, 212 passed / 212 tests**.
- `npx tsc --noEmit` — **PASS** (0 errors).
- `next lint` — **PASS** (no warnings or errors).

## Notes / known gaps (not covered, by design)

- The `EncounterCompleteForm` observations section is still free text (the server `ObservationDto[]` is not modelled
  in the frontend contract), so no structured-observation test exists.
- `readOnly` is covered by prop and by the `ENCOUNTER_STATE_INVALID` code, but the mutation-driven flip is asserted
  at the error-code level rather than through a full 409 round trip.
- Admin pagination is covered for `users`; `services`/`rooms` share the same wiring but are not page-tested.
- `e2e/*.spec.ts` remain Playwright stubs (documented) and are intentionally excluded from Jest.

## Next Steps

**Next by flow:** `/docs-generator` `frontend/ TASK-001` — all suites pass (per the `/test-generator` command's
`flow-next`). If any suite had failed, the next step would be `/debugger`.

**Alternatives:**
- `/finishing-branch` — after the `ts-node` leftover is removed and DoD Standard is green.
- `/coder-frontend` `frontend/ TASK-001` — close the review's Major items before finalizing.
