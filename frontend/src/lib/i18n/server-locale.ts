import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './locale';

/** The viewer's locale on the server (RSC): the cookie the client keeps in step with its choice, else the default. */
export async function readServerLocale(): Promise<Locale> {
  const value: string | undefined = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
