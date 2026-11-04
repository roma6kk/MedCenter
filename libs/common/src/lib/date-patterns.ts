/**
 * A FHIR `dateTime` a client may send: a calendar date, or a date-time with the mandatory zone (RFC 3339).
 * `@IsISO8601()` alone also lets week, ordinal, basic and zone-less forms through, which HAPI refuses with a 500.
 * Use it together with `@IsISO8601({ strict: true })` (that one rejects 2026-02-31).
 */
export const RFC3339_DATE_OR_DATE_TIME = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/;
