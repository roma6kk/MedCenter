Status: done

Examined (about 87 tool calls):
- middleware.ts, lib/auth/* (all files), app/api/auth/{authorize,callback,logout,refresh,session}/route.ts (+ logout spec), app/(auth)/{layout,login,register}, components/auth/*
- app/layout.tsx, app/error.tsx, app/not-found.tsx, app/403, app/(public)/* (layout, listing, doctors, doctors/[doctorId], not-found, loading), role layouts (patient/doctor/admin all wrap RoleGuard with the right role), list of every page/route vs PROTECTED_PREFIXES (all covered)
- components/catalog/* (all non-spec files), components/layout/* (all), components/providers.tsx, components/brand, components/feedback/{route-pages,problem-banner,catalog-unavailable}
- lib/api/* (all), lib/server-fetch.ts, lib/i18n/{locale,server-locale,page-metadata,translate,use-t}, lib/clinic-time.ts + slot-when (time zone handling is centralised and correct), store/use-session-store.ts, store/use-ui-store.ts, next.config.mjs (CSP / security headers fine)
- Cross-checks: ru/en catalogue parity 1514/1514 keys, placeholders ok; static scan of t('key') usage across src found no missing key in this unit; no tokens in web storage; the only dangerouslySetInnerHTML is the static theme init script; open redirect (sanitizeReturnTo / authorize / callback / middleware) reviewed, no bypass found; auth-service revoke endpoint guard checked (JwtAuthGuard APP_GUARD, jose jwtVerify)
- Scratchpad jest repro for finding 05 (files fpa-filter.spec.tsx and fpa-jest.config.js live in the scratchpad, nothing was added to the repo)

Findings written (9): 
- 01 medium robustness: /login crashes with repeated returnTo (array -> raw.trim)
- 02 medium security: logout does not revoke the refresh token when the in-memory access token has expired
- 03 medium ux: DOCTOR/ADMIN see «Записаться» CTAs on the landing that lead to 403 (hero, CTA band, audience link, hero windows)
- 04 medium robustness: 503/429/network errors of session probe or refresh are treated as sign-out (bounce to /login)
- 05 medium bug: doctor search field loses a character typed while the previous search is still being applied (reproduced)
- 06 low bug: RoleGuard login redirect drops the query string of returnTo
- 07 low ux: callback always sends error=access_denied (unavailable message unreachable) and drops returnTo on failure
- 08 low bug: dead isPublicPath / PUBLIC_PREFIXES in route-guard.ts (loose startsWith)
- 09 low bug: next/link to /api/auth/authorize in register-form (email taken), contradicts the rule in public-header.tsx

Deliberately NOT reported (already known or a design trade-off):
- returnTo lost after register -> «Войти» (already in tasks/TASK-005/verify-open-questions.md, T6)
- SSR first paint and <html lang="ru"> are Russian for an English visitor until hydration (documented trade-off of the client-side locale store; a real fix is a refactor to per-request locale context)
- N+1 requests for «services of a doctor» (already an open question, T7+V5)
- ROLE_LANDING.PATIENT = /home instead of /booking from the spec (redesign decision)

Remaining: nothing in this unit's scope.
