import { clinicDayOf, formatClinicTime, formatDayShort, shiftDateKey } from '@/lib/clinic-time';
import type { Locale } from '@/lib/i18n/locale';
import type { Translate } from '@/lib/i18n/translate';

export function describeWhen(startIso: string, today: string, locale: Locale, t: Translate): string {
  const day: string = clinicDayOf(startIso);
  const time: string = formatClinicTime(startIso, locale);
  if (day === today) return t('whenToday', { time });
  if (day === shiftDateKey(today, 1)) return t('whenTomorrow', { time });
  return t('whenDate', { date: formatDayShort(day, locale), time });
}
