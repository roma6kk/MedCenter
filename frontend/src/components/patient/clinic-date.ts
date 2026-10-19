/**
 * clinic-date — how the patient cabinet shows instants and calendar days (frontend-design-spec §7).
 *
 * The API speaks RFC 3339 UTC; the clinic works in Europe/Minsk, so every instant is read in that zone and never in the
 * browser's own one. The language follows the UI locale. A value that is not a date is returned as it came, because a
 * formatter that throws would blank the whole page over one bad field.
 */
import type { Locale } from '@/lib/i18n/locale';

export const CLINIC_TIME_ZONE = 'Europe/Minsk';

const INTL_LOCALE: Readonly<Record<Locale, string>> = { ru: 'ru-BY', en: 'en-GB' };
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** An RFC 3339 instant embedded in server prose, e.g. `Начало: 2026-10-19T11:40:00.000Z`. */
const EMBEDDED_INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})/g;

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/** `19 окт. 2026 г., 10:00` — the instant in the clinic zone. */
export function formatClinicDateTime(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (!isValidDate(date)) return iso;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: CLINIC_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(date);
}

/** `10:00` — the clock time of an instant in the clinic zone (the end of a visit that starts the same day). */
export function formatClinicTime(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (!isValidDate(date)) return iso;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

/** A calendar day without a time (`YYYY-MM-DD`, e.g. a FHIR `birthDate`) is not an instant: it must not move with a zone. */
export function formatDateOnly(dateKey: string, locale: Locale): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (!DATE_ONLY.test(dateKey) || !isValidDate(date)) return dateKey;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: 'UTC', dateStyle: 'long' }).format(date);
}

/** The day of an instant in the clinic zone; a bare `YYYY-MM-DD` is shown as that day. */
export function formatClinicDate(iso: string, locale: Locale): string {
  if (DATE_ONLY.test(iso)) return formatDateOnly(iso, locale);
  const date = new Date(iso);
  if (!isValidDate(date)) return iso;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: CLINIC_TIME_ZONE, dateStyle: 'medium' }).format(date);
}

/** Replaces every instant inside a server sentence with the clinic-zone date and time, leaving the rest of the text alone. */
export function localizeInstants(text: string, locale: Locale): string {
  return text.replace(EMBEDDED_INSTANT, (instant) => formatClinicDateTime(instant, locale));
}
