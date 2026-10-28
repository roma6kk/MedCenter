import { formatDayHeading, formatDayShort, INTL_LOCALE, currentLocale } from '@/lib/clinic-time';
import type { Locale } from '@/lib/i18n/locale';
import type { Bucket } from './analytics-series';

const noon = (dateKey: string): Date => new Date(`${dateKey}T12:00:00Z`);

/** `окт.` or `октябрь 2026 г.` of the month a day key falls in. */
export function monthLabel(dateKey: string, locale: Locale, style: 'short' | 'long'): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: style, ...(style === 'long' ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(noon(dateKey));
}

/** The short label under a column: a day number (with the month on the first column and on every 1st), a week's first day, a month. */
export function axisLabel(bucket: Bucket, index: number, locale: Locale = currentLocale()): string {
  if (bucket.granularity === 'month') return monthLabel(bucket.from, locale, 'short');
  if (bucket.granularity === 'week') return formatDayShort(bucket.from, locale);
  const day: number = Number(bucket.from.slice(8));
  return index === 0 || day === 1 ? formatDayShort(bucket.from, locale) : String(day);
}

/** The full name of a column, as the tooltip and the table spell it. */
export function bucketTitle(bucket: Bucket, locale: Locale = currentLocale()): string {
  if (bucket.granularity === 'month') return monthLabel(bucket.from, locale, 'long');
  if (bucket.granularity === 'week') return `${formatDayShort(bucket.from, locale)} – ${formatDayShort(bucket.to, locale)}`;
  return formatDayHeading(bucket.from, locale);
}
