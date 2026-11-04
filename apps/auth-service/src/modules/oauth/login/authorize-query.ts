import { DEFAULT_LOGIN_LOCALE, type LoginLocale } from './login-messages';

/**
 * Parameters of an authorization request (RFC 6749 §4.1.1, RFC 7636, SMART
 * App Launch) that the login form carries back to `GET /oauth/authorize`.
 * Nothing else survives the round trip.
 */
const AUTHORIZE_PARAMS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
  'launch',
  'aud',
] as const;

/** OIDC Core §3.1.2.1 `ui_locales`: only the two languages of the login page survive, as the bare tag. */
const UI_LOCALES_PARAM = 'ui_locales';
const SUPPORTED_UI_LOCALES: ReadonlyArray<LoginLocale> = ['ru', 'en'];

/** A single parameter longer than this is not a legitimate authorization request. */
const MAX_PARAM_LENGTH = 2048;

export const AUTHORIZE_PATH = '/oauth/authorize';

function firstValue(source: URLSearchParams | Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = source instanceof URLSearchParams ? source.get(key) : source[key];
  return typeof value === 'string' && value.length <= MAX_PARAM_LENGTH ? value : undefined;
}

/**
 * Re-serialises the authorization request from either the parsed query of
 * `GET /oauth/authorize` or the raw hidden field of the login form, keeping
 * only the known parameters (first value, bounded length).
 */
export function sanitizeAuthorizeQuery(source: string | Readonly<Record<string, unknown>>): string {
  const input = typeof source === 'string' ? new URLSearchParams(source) : source;
  const output = new URLSearchParams();
  for (const key of AUTHORIZE_PARAMS) {
    const value = firstValue(input, key);
    if (value !== undefined) {
      output.set(key, value);
    }
  }
  const locale = uiLocaleOf(firstValue(input, UI_LOCALES_PARAM));
  if (locale !== undefined) {
    output.set(UI_LOCALES_PARAM, locale);
  }
  return output.toString();
}

/** The first tag of a space-separated `ui_locales` list that names a supported language (`en-US` -> `en`). */
function uiLocaleOf(value: string | undefined): LoginLocale | undefined {
  for (const tag of (value ?? '').split(/\s+/)) {
    const language = tag.toLowerCase().split(/[-_]/)[0];
    const match = SUPPORTED_UI_LOCALES.find((locale) => locale === language);
    if (match !== undefined) {
      return match;
    }
  }
  return undefined;
}

/** The language of the login page for a sanitised authorization request: its `ui_locales`, else Russian. */
export function loginLocaleOf(sanitizedQuery: string): LoginLocale {
  return uiLocaleOf(new URLSearchParams(sanitizedQuery).get(UI_LOCALES_PARAM) ?? undefined) ?? DEFAULT_LOGIN_LOCALE;
}

/**
 * The post-login redirect target. The path is fixed — the form can only send
 * the browser back to this server's authorize endpoint, which re-validates the
 * client and its registered `redirect_uri` (no open redirect).
 */
export function authorizeLocation(sanitizedQuery: string): string {
  return `${AUTHORIZE_PATH}?${sanitizedQuery}`;
}
