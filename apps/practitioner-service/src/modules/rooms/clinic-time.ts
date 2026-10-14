/** The clinic works in Minsk time; slots are stored as UTC/offset instants. */
export const CLINIC_TIME_ZONE = 'Europe/Minsk';

const CLINIC_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: CLINIC_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const FHIR_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

interface ClinicMoment {
  readonly date: string;
  readonly time: string;
}

/**
 * Splits an instant into `DD.MM.YYYY` / `HH:mm` clinic-time parts. Built from
 * `formatToParts` rather than `format` so ICU spacing/punctuation differences
 * between Node builds never leak into the display text.
 */
function toClinicMoment(iso: string): ClinicMoment | undefined {
  const epochMs = Date.parse(iso);
  if (!Number.isFinite(epochMs)) {
    return undefined;
  }
  const parts = new Map(CLINIC_FORMAT.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  return {
    date: `${parts.get('day')}.${parts.get('month')}.${parts.get('year')}`,
    time: `${parts.get('hour')}:${parts.get('minute')}`,
  };
}

/** `02.11.2026 12:00–12:30`; the end repeats the date only when it falls on another clinic day. */
export function formatSlotPeriod(start: string, end: string): string {
  const from = toClinicMoment(start);
  const to = toClinicMoment(end);
  if (from === undefined || to === undefined) {
    return `${start}–${end}`;
  }
  const endText = from.date === to.date ? to.time : `${to.date} ${to.time}`;
  return `${from.date} ${from.time}–${endText}`;
}

/**
 * A planning-horizon bound (FHIR `date`/`dateTime`) as `DD.MM.YYYY`. Horizon
 * bounds are calendar days of the clinic, so no zone conversion is applied.
 */
export function formatHorizonDate(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const match = FHIR_DATE_PREFIX.exec(value);
  return match === null ? undefined : `${match[3]}.${match[2]}.${match[1]}`;
}
