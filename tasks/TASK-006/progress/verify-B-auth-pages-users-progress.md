# B-auth-pages-users progress
- be-auth-oauth-03: done d9bd4e8 — ui_locales (ru|en) in authorize_query, dictionaries for page and messages; FRONTEND HANDOFF: frontend/src/app/api/auth/authorize/route.ts must add ui_locales=<current locale>
- tz-matrix-03: done d9bd4e8 — duplicate of be-auth-oauth-03 (same handoff)
- be-auth-oauth-09: done d9bd4e8 — AuthorizeErrorFilter + LoginRateLimitFilter @Catch(): browser (Accept text/html) gets the login error page, API clients keep JSON; spec 2.1.2/2.1.6 updated (swept into b125a1c by another lane)
- be-auth-oauth-10: done d9bd4e8 — fieldError only for wrong credentials, stable toggle label
- be-auth-users-01: done a2e91ad — tokenised search
- be-auth-users-03: done b5dd938, 2481bd9 — trim/control chars/birthDate bounds
- be-auth-users-04: done 51f8588 — patronymic kept, stale text dropped
- be-auth-users-05: done c077939 — no-op PATCH/deactivate write no audit
- infra-tools-11: done 9c9a533 — retry in snapshot-verifier
Status: done
