import { CLINIC_TIME_ZONE } from '../../common/clinic-calendar';

/** Slots are stored as UTC/offset instants; labels show them in clinic time (`CLINIC_TIME_ZONE`). */

const CLINIC_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: CLINIC_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface ClinicMoment {
  readonly date: string;
  readonly time: string;
}

/**
 * Splits an instant into `DD.MM.YYYY` / `HH:mm` clinic-time parts. Built from
 * `formatToParts` rather than `format` so ICU spacing/punctuation differences
 * between Node builds never leak into the label.
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

/** Human-readable slot line for the doctor's own schedule (API §5.2.7). */
export function slotLabel(slot: {
  readonly start: string;
  readonly end: string;
  readonly status: 'free' | 'busy';
}): string {
  return `${formatSlotPeriod(slot.start, slot.end)} · ${slot.status === 'busy' ? 'занят' : 'свободен'}`;
}
