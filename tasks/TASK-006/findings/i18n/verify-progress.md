# i18n unit progress

Status: done

Examined (attempt 1, ~85 tool calls):
- ru.json vs en.json: 1514 keys each, identical key sets, no empty / non-string values. Cyrillic in en.json only layout.languages.ru (correct own-language name). Untranslated English in ru.json only Email/SMS/URL/units/FHIR terms in admin screens (acceptable). en.json uses curly quotes correctly, no stray guillemets, no spacing defects.
- ICU: every message parses (intl-messageformat) in both locales; 5 plural messages, ru has one/few/many/other, en one/other, call sites pass the right argument (count / years). No hand-made pluralisation in code (unnamed-groups.tsx uses count===1 only to pick between two number-free messages). Validation "N символов" messages: no real limit ends in 1, so grammar is fine.
- Hardcoded Cyrillic in non-test .ts/.tsx (TS-scanner over string/template/JSX tokens): problem-parse.ts STATUS_TITLES (fallback titles, not shown when an errorCode is known), service-text.ts (stems -> i18n-02), patient-search-model.ts (ё->е), home-content.ts (owner-decided demo data). Components and hooks are clean.
- Static key cross-check by AST (t('x') per useT namespace, translate('x'), literal catalogue-like strings, dynamic key families): 1 missing key doctor.schedule.from -> i18n-01. Dynamic families (stamp, verification, consent status/state, roles, audit actions, gender, telecom) match their unions; StampBadge falls back through hasMessage.
- Dates/numbers: lib/clinic-time.ts is the single formatter (ru-BY / en-GB, Europe/Minsk); DatePicker/calendar-grid month and weekday names come from Intl; only raw number output is observation values -> i18n-04. Percentages are integers (style nit only, skipped). journal-model/visit-row/history-timeline pass raw 'ru'/'en' to Intl (works, only en vs en-GB 'Sep/Sept' nit, skipped).
- Accept-Language: apiFetch always sends the UI locale (admin service list overrides with ru; its query key does not collide with the public ones), publicApiFetch sends the cookie locale, query keys services/doctors/doctor include locale. Backend honours it only for catalog services + doctors; appointments gap -> i18n-03; others already reported by other units (be-analytics-02/03, be-encounter-06, be-practitioner-04, tz-matrix-04).
- Server-rendered auth views: only the login page and its error page exist (apps/auth-service/src/modules/oauth/login); localisation is already reported (be-auth-oauth-03, tz-matrix-03, be-auth-oauth-09) -> not duplicated. No e-mail templates anywhere.
- useDocumentTitle covers every page that declares metadata; profile/admin/doctor roots are redirects.
- Server vs client language at first paint -> i18n-05 (needs owner decision).
- Skipped on purpose (judged not defects): server `detail` text (English developer text with code prefix) shown under the localized headline by ProblemBanner (specified in frontend-design-spec §8, en is a reserve); LocaleSwitcher buttons named 'ru'/'en' (spec asserts it); toast text is translated at push time and stays in the old language after a switch (lives seconds); .ics LOCATION language (already an open question in TASK-005).

Findings written (5): i18n-01 (missing key doctor.schedule.from, low), i18n-02 (service-text English stems, low), i18n-03 (appointments names ignore Accept-Language + cache keys, medium), i18n-04 (observation decimal separator, low), i18n-05 (SSR first paint always ru, low, needs decision)

Remaining:
- nothing
