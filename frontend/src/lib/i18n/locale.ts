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

/**
 * The same choice as a cookie, because the server components that render the public catalog cannot read localStorage:
 * the cookie is what tells them which language of the API data (`Accept-Language`) to ask for. Not a secret, not HttpOnly.
 */
export const LOCALE_COOKIE = 'mc-locale';
const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** The locale in the cookie, or `null` when there is none (the viewer never switched) or it holds junk. */
export function readLocaleCookie(): Locale | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  const value = match?.slice(LOCALE_COOKIE.length + 1);
  return isLocale(value) ? value : null;
}

export function writeLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}
