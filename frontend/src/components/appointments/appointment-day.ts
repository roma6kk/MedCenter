import { CLINIC_TIME_ZONE, clinicDayOf, formatDayHeading } from '@/lib/clinic-time';
import type { Locale } from '@/lib/i18n/locale';
import type { AppointmentView } from './appointment-types';

const INTL_LOCALE: Readonly<Record<Locale, string>> = { ru: 'ru-BY', en: 'en-GB' };

export interface DayGroup {
  readonly day: string;
  readonly items: ReadonlyArray<AppointmentView>;
}

export function groupByDay(items: ReadonlyArray<AppointmentView>): ReadonlyArray<DayGroup> {
  const groups: Array<{ day: string; items: AppointmentView[] }> = [];
  for (const item of items) {
    const day: string = clinicDayOf(item.start);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

export function dayHeading(day: string, locale: Locale): string {
  return formatDayHeading(day, locale);
}

export interface DateTile {
  readonly weekday: string;
  readonly day: string;
  readonly month: string;
}

export function dateTile(iso: string, locale: Locale): DateTile {
  const parts = new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: CLINIC_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'long' }).formatToParts(new Date(iso));
  const pick = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  return { weekday: pick('weekday'), day: pick('day'), month: pick('month') };
}

export function durationMin(start: string, end: string): number {
  const minutes: number = Math.round((Date.parse(end) - Date.parse(start)) / 60_000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}
