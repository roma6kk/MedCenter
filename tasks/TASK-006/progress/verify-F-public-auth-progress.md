# F-public-auth progress (frontend lane, attempts 1-2)
- fe-public-auth-02: done aab1b8e — logout route falls back to rotate+revoke the new pair when the client Bearer is refused (expired)
- fe-public-auth-04: done 753aa8e — tri-state exchange (ok/ended/unavailable); 503/429/5xx/network keep the session; apiFetch throws a retryable 503; RoleGuard shows SessionUnavailable (retry) when nothing is known
- fe-public-auth-01: done d12e573 — /login takes the first of a repeated returnTo; sanitizeReturnTo accepts unknown
- fe-public-auth-03: done 08245c9 — useCanBook hook; HomeActions (hero/CTA), audience link, hero windows as plain text for staff; 4 old role checks switched to the hook
- fe-public-auth-05: done ffb9fff — doctor-filter-bar remembers what it pushed (ref); own navigation catching up no longer reverts typed text; spec fails on old code
- fe-public-auth-06: done 9d6f1ee — currentReturnTo() in session-client.ts used by RoleGuard, redirectToLogin and endRevokedSession; RoleGuard no longer uses usePathname
- fe-public-auth-07: done 5fc2f04 — exchangeAuthorizationCode returns ok|invalid|unavailable; callback maps unavailable to /login?error=temporarily_unavailable and carries the verified returnTo on failure; spec §2 updated
- fe-public-auth-08: done 6785579 — PUBLIC_PREFIXES and isPublicPath removed from route-guard.ts (no users); stale "10 prefixes" spec title fixed to 12
- fe-public-auth-09: done a29ec6d — register-form SignInLink (plain <a href={AUTHORIZE_PATH}>) for the e-mail-taken link and the success CTA, LOGIN_HREF dropped; spec marks next/link anchors and fails on the old Link
- contract-01: done 61cc823 — frontend part: useProblemView leaves detail undefined for errorCode INTERNAL (explicit detail prop still wins); 4 problem-banner.spec cases, 2 fail on old code; libs/common untouched (server text stays, backend lane); spec §D updated
- note: full `cd frontend && npx jest --maxWorkers=2` green after attempt 2 (259 suites, 2840 tests); tsc and next lint clean
Status: done
