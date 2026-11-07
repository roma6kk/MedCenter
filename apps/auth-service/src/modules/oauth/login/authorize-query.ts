import { DEFAULT_LOGIN_LOCALE, type LoginLocale } from './login-messages';

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

const UI_LOCALES_PARAM = 'ui_locales';
const SUPPORTED_UI_LOCALES: ReadonlyArray<LoginLocale> = ['ru', 'en'];

const MAX_PARAM_LENGTH = 2048;

export const AUTHORIZE_PATH = '/oauth/authorize';

function firstValue(source: URLSearchParams | Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = source instanceof URLSearchParams ? source.get(key) : source[key];
  return typeof value === 'string' && value.length <= MAX_PARAM_LENGTH ? value : undefined;
}

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

export function loginLocaleOf(sanitizedQuery: string): LoginLocale {
  return uiLocaleOf(new URLSearchParams(sanitizedQuery).get(UI_LOCALES_PARAM) ?? undefined) ?? DEFAULT_LOGIN_LOCALE;
}

export function authorizeLocation(sanitizedQuery: string): string {
  return `${AUTHORIZE_PATH}?${sanitizedQuery}`;
}
