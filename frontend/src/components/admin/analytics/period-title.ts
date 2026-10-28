import { formatDateKey, formatDayHeading } from '@/lib/clinic-time';
import type { Locale } from '@/lib/i18n/locale';
import type { Translate } from '@/lib/i18n/translate';
import { monthLabel } from './bucket-label';
import type { AnalyticsScope } from './analytics-period';

/** The page heading: «Аналитика за <период>», worded by the kind of period. */
export function periodTitle(scope: AnalyticsScope, t: Translate, locale: Locale): string {
  const { preset, range } = scope;
  if (preset === 'month') return t('heading.month', { month: monthLabel(range.from, locale, 'long') });
  if (preset === 'year') return t('heading.year', { year: range.from.slice(0, 4) });
  if (preset === 'custom') return t('heading.custom', { from: formatDateKey(range.from, 'numeric', locale), to: formatDateKey(range.to, 'numeric', locale) });
  return t(`heading.${preset}`);
}

/** The line above the heading: the exact days the numbers cover. */
export function periodDays(scope: AnalyticsScope, t: Translate, locale: Locale): string {
  const { from, to } = scope.range;
  if (scope.preset === 'today') return formatDayHeading(from, locale);
  return t('period', { from: formatDateKey(from, 'numeric', locale), to: formatDateKey(to, 'numeric', locale) });
}
