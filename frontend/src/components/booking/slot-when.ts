/**
 * slot-when — how a doctor card words a time: «сегодня, 09:00», «завтра, 09:00», «27 окт., 09:00». Relative to the clinic's
 * today (not the browser's), so a patient abroad still reads the clinic's calendar.
 */
import { clinicDayOf, formatClinicTime, formatDayShort, shiftDateKey } from '@/lib/clinic-time';
import type { Locale } from '@/lib/i18n/locale';
import type { Translate } from '@/lib/i18n/translate';

/** `t` is the translator of the `booking` namespace. */
export function describeWhen(startIso: string, today: string, locale: Locale, t: Translate): string {
  const day: string = clinicDayOf(startIso);
  const time: string = formatClinicTime(startIso, locale);
  if (day === today) return t('whenToday', { time });
  if (day === shiftDateKey(today, 1)) return t('whenTomorrow', { time });
  return t('whenDate', { date: formatDayShort(day, locale), time });
}
