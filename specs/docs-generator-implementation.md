# Implementation — Build, Test & Tooling

> Living specification, maintained by `/docs-generator`. Covers **how** the system is built, tested and run.
> UI/routes/state live in `frontend-design-spec.md`; API contracts in `api-designer-spec.md`; system design in
> `architect-architecture.md`. This file **references** them instead of duplicating.

## Overview

The target architecture (`specs/architect-architecture.md`) is an Nx monorepo (`apps/*`, `libs/*`) with eight
NestJS BFF services behind Traefik, HAPI FHIR JPA (R4) and PostgreSQL. **Implemented today: the frontend only.**
Per the `coder-frontend` skill mandate it is a standalone Next.js app in `frontend/` (no root `package.json`);
the Nx `apps/web` relocation is deferred. The backend services are not yet built.

### [TASK-001] Frontend — build, test & tooling (2026-10-05)

**Location:** `frontend/` — standalone Next.js 15 App Router (React 18, TypeScript strict). No root
`package.json`; all commands run inside `frontend/`.

**Stack:** Next.js 15.0.3 (App Router, RSC), TanStack Query v5, Zustand v5, react-hook-form + zod,
Tailwind CSS. Tests: Jest 29 + Testing Library (jsdom) via the `next/jest` SWC transform; E2E: Playwright.

**Commands** (run in `frontend/`):

| Action | Command | Notes |
| --- | --- | --- |
| Install | `npm install` | no root install |
| Dev | `npm run dev` | `next dev`, default :3000 |
| Types | `npx tsc --noEmit` | strict; no emit |
| Tests | `npm test` | `jest --passWithNoTests` |
| Lint | `npm run lint` | `next lint` (deprecated; flat-config migration deferred) |
| Build | `npm run build` | `next build` |
| E2E | `npm run e2e` | `playwright test` — smoke stubs (`test.fixme`) |

**Environment variables (frontend):**

| Var | Default | Purpose |
| --- | --- | --- |
| `AUTH_BACKEND_URL` | `http://auth-service:3000` | `auth-service` base URL used by the token broker |
| `OAUTH_CLIENT_ID` | `medcenter-web` | SMART/OAuth2 client id |

**Auth flow (reference: `frontend-design-spec.md` §4, `api-designer-spec.md` SMART section):** PKCE (S256) is
handled by route handlers under `src/app/api/auth/{authorize,callback,refresh,session,logout}`. The refresh token
lives only in the httpOnly `mc_rt` cookie; the short-lived access token is held in JS memory and attached as
`Authorization: Bearer` by `apiFetch`. `src/middleware.ts` gates protected route prefixes on the `mc_session`
cookie. Hardening: `sanitizeReturnTo` (open-redirect denylist) and `parsePkceCookie` (fail-closed JSON) live in
`src/lib/auth/`.

**Encounter completion (reference: `api-designer-spec.md` §7.3):** `EncounterCompleteForm` submits the single
atomic `CompleteEncounterDto` body (МКБ-10 diagnoses ≥ 1, `ServiceRequest`/`MedicationRequest`, UCUM
select-only unit) to `POST /api/v1/encounters/{id}/complete`.

**Verification status (2026-10-05):** `tsc --noEmit` = 0 · `jest` = **19 suites / 212 tests** · `next lint` = 0 ·
`next build` = 27 routes + middleware (32.1 kB). Runtime probes: `/booking` → `/login?returnTo=…`;
`/api/auth/session` → 200 anonymous; `/api/auth/callback` malformed cookie → 307 (not 500).

**Known gaps / follow-ups:** the reviewer's Major items (session-cookie lifetime vs refresh token; forgeable
`mc_session` gate; combobox keyboard navigation; free-text observations) are open. See
`tasks/TASK-001/code-reviewer-frontend-criticals-report.md`; implementation detail in
`frontend/coder-frontend-implementation-notes.md`; test inventory in
`tasks/TASK-001/test-generator-coverage-report.md`.
