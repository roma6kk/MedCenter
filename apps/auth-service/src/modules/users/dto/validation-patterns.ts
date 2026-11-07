import { registerDecorator, type ValidationOptions } from 'class-validator';

export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const EMAIL_MAX_LENGTH = 255;
export const NAME_MAX_LENGTH = 100;

export const PASSWORD_MAX_LENGTH = 128;

export const ACCOUNT_CONSENT_VERSION_MAX_LENGTH = 64;

export const GENDERS = ['male', 'female'] as const;

/**
 * `@ValidateIf` predicate of an optional field that may be absent but never `null`.
 * `@IsOptional()` also skips JSON `null`, which then reached the service as if it were a
 * value: a 500 for `email`/`roles`, a `null` in a NOT NULL column for `isActive`/the names.
 */
export function isPresent(_object: unknown, value: unknown): boolean {
  return value !== undefined;
}

export function trimmed({ value }: { readonly value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** No C0/C1-free control characters: PostgreSQL refuses NUL (22021) and a name or a search has no use for the rest. */
// eslint-disable-next-line no-control-regex -- the control range is the point of the pattern
export const NO_CONTROL_CHARS = /^[^\u0000-\u001F\u007F]*$/;
export const NO_CONTROL_CHARS_MESSAGE = '$property must not contain control characters';

export const MIN_BIRTH_DATE = '1900-01-01';

export function todayInClinicZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Minsk' }).format(now);
}

/**
 * A `birthDate` (already a strict `YYYY-MM-DD`) from 1900-01-01 up to today in Europe/Minsk. Plain string comparison
 * is enough for a date-only value; other shapes are left to `@IsDateString`.
 */
export function IsPlausibleBirthDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isPlausibleBirthDate',
      target: target.constructor,
      propertyName: propertyName as string,
      ...(options !== undefined ? { options } : {}),
      validator: {
        validate: (value: unknown): boolean =>
          typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value) || (value >= MIN_BIRTH_DATE && value <= todayInClinicZone()),
        defaultMessage: (): string => `$property must be a date between ${MIN_BIRTH_DATE} and today`,
      },
    });
  };
}
