/** The clinic works in Minsk time; events carry UTC instants (RFC 3339). */
const CLINIC_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Minsk',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * `22.10.2026 12:30` in clinic time, or `undefined` for a value that is no instant. Built from `formatToParts`, so ICU
 * punctuation differences between Node builds never reach the text a patient reads.
 */
export function formatClinicDateTime(iso: string): string | undefined {
  const epochMs = Date.parse(iso);
  if (!Number.isFinite(epochMs)) {
    return undefined;
  }
  const parts = new Map(CLINIC_FORMAT.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  return `${parts.get('day')}.${parts.get('month')}.${parts.get('year')} ${parts.get('hour')}:${parts.get('minute')}`;
}
