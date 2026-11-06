export type Locale = 'ru' | 'en';
export const LOCALES: ReadonlyArray<Locale> = ['ru', 'en'];
export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALE_STORAGE_KEY = 'mc-locale';

export function isLocale(value: unknown): value is Locale {
  return value === 'ru' || value === 'en';
}

export function readStoredLocale(): Locale | null {
  try {
    const stored: string | null = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
  }
}

// Also a cookie: server components cannot read localStorage and need it for the API Accept-Language.
export const LOCALE_COOKIE = 'mc-locale';
const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function readLocaleCookie(): Locale | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  const value = match?.slice(LOCALE_COOKIE.length + 1);
  return isLocale(value) ? value : null;
}

export function writeLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}
