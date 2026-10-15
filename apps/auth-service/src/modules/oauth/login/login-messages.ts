/** One message for every credential failure — no user enumeration. */
export const INVALID_CREDENTIALS_MESSAGE = 'Неверный адрес электронной почты или пароль.';
export const STALE_FORM_MESSAGE = 'Форма входа устарела. Повторите попытку.';
export const BROKEN_REQUEST_MESSAGE =
  'Запрос входа некорректен. Вернитесь в приложение и начните вход заново.';

/** Shown for both limits (per IP and per account): the form says "wait", never which limit it was. */
export const THROTTLED_MESSAGE = 'Слишком много попыток входа. Подождите несколько минут и повторите.';

/** The attempt counter is unreachable: the attempt is refused rather than left unbounded. */
export const UNAVAILABLE_MESSAGE = 'Вход временно недоступен. Повторите попытку позже.';
