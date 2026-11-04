/**
 * A calendar date (`2026-11-02`) or a date-time with an explicit offset
 * (`2026-11-02T09:00:00Z`, `…+03:00`). A date-time without an offset is refused:
 * HAPI would read it in the server's zone, not the clinic's.
 */
export const DATE_OR_ZONED_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;

/**
 * A calendar date written `YYYY-MM-DD`, the only form the schedule horizon and the
 * generation range take. `IsDateString({ strict: true })` next to it refuses a day
 * that does not exist (`2026-02-31`); this pattern refuses the week and ordinal
 * forms (`2026-W45`, `2026-306`) and a date-time that the validator accepts.
 */
export const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
