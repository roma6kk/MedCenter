/** locale — supported UI locales and the per-viewer persistence of the choice (localStorage is a convenience only). */

export type Locale = 'ru' | 'en';
export const LOCALES: ReadonlyArray<Locale> = ['ru', 'en'];
export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALE_STORAGE_KEY = 'mc-locale';

export function isLocale(value: unknown): value is Locale {
  return value === 'ru' || value === 'en';
}

/** Stored locale, or `null` when storage is empty, blocked (private window) or holds junk. */
export function readStoredLocale(): Locale | null {
  try {
    const stored: string | null = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    // Storage can throw (blocked site data, private mode): the page then simply keeps the default locale.
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Not persisting the choice is harmless: the next visit starts in the default locale.
  }
}
