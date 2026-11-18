export type LoginLocale = 'ru' | 'en';

export const DEFAULT_LOGIN_LOCALE: LoginLocale = 'ru';

const MESSAGES = {
  invalidCredentials: {
    ru: 'Неверный адрес электронной почты или пароль.',
    en: 'The e-mail address or the password is incorrect.',
  },
  staleForm: { ru: 'Форма входа устарела. Повторите попытку.', en: 'The sign-in form has expired. Please try again.' },
  brokenRequest: {
    ru: 'Запрос входа некорректен. Вернитесь в приложение и начните вход заново.',
    en: 'The sign-in request is invalid. Go back to the app and start signing in again.',
  },
  throttled: {
    ru: 'Слишком много попыток входа. Подождите несколько минут и повторите.',
    en: 'Too many sign-in attempts. Wait a few minutes and try again.',
  },
  unavailable: {
    ru: 'Вход временно недоступен. Повторите попытку позже.',
    en: 'Sign-in is temporarily unavailable. Please try again later.',
  },
} as const satisfies Record<string, Readonly<Record<LoginLocale, string>>>;

export type LoginMessageKey = keyof typeof MESSAGES;

export function loginMessage(key: LoginMessageKey, locale: LoginLocale = DEFAULT_LOGIN_LOCALE): string {
  return MESSAGES[key][locale];
}

export const INVALID_CREDENTIALS_MESSAGE = MESSAGES.invalidCredentials.ru;
export const STALE_FORM_MESSAGE = MESSAGES.staleForm.ru;
export const BROKEN_REQUEST_MESSAGE = MESSAGES.brokenRequest.ru;
export const THROTTLED_MESSAGE = MESSAGES.throttled.ru;
export const UNAVAILABLE_MESSAGE = MESSAGES.unavailable.ru;
