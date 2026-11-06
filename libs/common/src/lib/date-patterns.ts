/** A FHIR `dateTime` a client may send: a date, or a date-time with a zone. `@IsISO8601()` alone lets through forms HAPI refuses with a 500. */
export const RFC3339_DATE_OR_DATE_TIME = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/;
