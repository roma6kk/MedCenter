/**
 * A calendar date (`2026-11-02`) or a date-time with an explicit offset
 * (`2026-11-02T09:00:00Z`, `…+03:00`). A date-time without an offset is refused:
 * HAPI would read it in the server's zone, not the clinic's.
 */
export const DATE_OR_ZONED_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;
