/** A date-time without an offset is refused: HAPI would read it in the server zone, not the clinic one. */
export const DATE_OR_ZONED_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;

export const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
