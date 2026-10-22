# @medcenter/frontend

Next.js 15 (App Router) client for the Лайфлайн medical-center platform. This app is standalone: there is no
root `package.json` — run every command from `frontend/`.

Design, routes, and state conventions live in [`../specs/frontend-design-spec.md`](../specs/frontend-design-spec.md);
build/test/tooling details in [`../specs/docs-generator-implementation.md`](../specs/docs-generator-implementation.md).

## Requirements

- Node.js 18+ (developed on Node 24) and npm.

## Setup

```bash
cd frontend
npm install
```

## Commands

| Action | Command |
| --- | --- |
| Dev server | `npm run dev` (http://localhost:3000) |
| Type check | `npx tsc --noEmit` |
| Unit / component tests | `npm test` |
| Watch tests | `npm run test:watch` |
| Lint | `npm run lint` |
| Production build | `npm run build` |
| E2E (Playwright, smoke stubs) | `npm run e2e` |

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTH_BACKEND_URL` | `http://auth-service:3000` | `auth-service` base URL used by the `/api/auth/*` token broker |
| `OAUTH_CLIENT_ID` | `medcenter-web` | SMART/OAuth2 client id |

## Auth

SMART on FHIR with PKCE (S256) through route handlers under `src/app/api/auth/*`. The refresh token is kept in
the httpOnly `mc_rt` cookie and never reaches JS; the short-lived access token is held in memory and attached as
`Authorization: Bearer` by `apiFetch`. `src/middleware.ts` redirects unauthenticated users away from protected
route prefixes. A running `auth-service` is required for the sign-in and refresh round trips.

## Project layout

```
src/
├── app/            # routes (public/auth/patient/doctor/admin) + /api/auth token broker
├── components/     # feature + shared UI (kebab-case files)
├── lib/            # api client, contracts (zod), auth helpers, utils
└── store/          # zustand stores (session, ui, booking draft)
```

## Testing notes

Tests run under jsdom with the `next/jest` SWC transform; `jest.setup.ts` installs minimal `fetch`/`Response`/
`crypto` shims. `testMatch` is limited to `src/**/*.spec.ts(x)`, so the `e2e/` Playwright specs are not picked
up by Jest. Current status: 19 suites / 212 tests.
