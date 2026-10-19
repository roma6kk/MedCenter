export function formatMinskDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ru-BY', {
    timeZone: 'Europe/Minsk',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

let cachedMinskDayFormatter: Intl.DateTimeFormat | null = null;

/** Built once: constructing an `Intl.DateTimeFormat` costs ~0.1 ms, and lists call `minskDateKey` once per row. */
function minskDayFormatter(): Intl.DateTimeFormat {
  cachedMinskDayFormatter ??= new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Minsk',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return cachedMinskDayFormatter;
}

/**
 * Calendar-day key (`YYYY-MM-DD`) for the clinic timezone (Europe/Minsk).
 * The doctor journal must not drift to UTC at the day boundary.
 */
export function minskDateKey(date: Date = new Date()): string {
  const parts = minskDayFormatter().formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const month = parts.find((p) => p.type === 'month')?.value ?? '00';
  const day = parts.find((p) => p.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

