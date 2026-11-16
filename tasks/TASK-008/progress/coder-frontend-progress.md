# coder-frontend progress (TASK-008)

## Item 1 (Q44) — 05d42360
ProblemBanner no longer falls back to `problem.detail` (the `detail` prop from screens stays). Removed the 500/field-error special cases, `RouteErrorPage` no longer takes `error` (its `error.message` was raw English); `CompletionFailure` no longer passes `problem.detail`. `problem.detail` is still parsed: field-errors, problem-of and encounter-problem-fields use it for logic.
docs/pz likely outdated: any text saying the banner shows the server detail / 502 detail.

## Item 2 (Q45) — ad1e0add
`LOCALE_INIT_SCRIPT` (lib/i18n/locale.ts) inlined in `<head>` after the theme script: cookie `mc-locale`, else localStorage, sets `<html lang>`. CSP is `script-src 'self' 'unsafe-inline'` with no nonce, same as the existing theme script, so no CSP change.
docs/pz likely outdated: statement that lang is set only after hydration.

## Item 3 (Q33)
`useSignInHref` (components/auth): "Войти" links on /login and after registration point to `/api/auth/authorize?returnTo=/booking` if the booking draft in sessionStorage has doctorId or slotId, else as before; target is a fixed path, resolvePostLoginPath still guards roles. Read after mount (SSR-safe).
docs/pz likely outdated: post-login landing always /home.

## Item 4 (Q43) — dd6351b8, bb714b56 and the commit after it
The existing mechanism was `useSearchParams` for the initial value + `history.replaceState` for writes (admin audit, admin appointments, analytics, doctor journal). Extracted `hooks/use-url-state.ts`: `writeUrlQuery(query)` (used by those four and by Медкарта) and `useUrlState(defaults)` + `parsePage` (new screens). Now in the URL: «Мои записи» (tab, page), «Уведомления» (filter, page), admin users (role, search, page), services (search, page), rooms (page), schedules (doctorId, active, page, view). Their pages got a Suspense boundary. Audit and admin appointments still keep page only in state (filter already in URL).
docs/pz likely outdated: «list state is local» statements for these screens.
