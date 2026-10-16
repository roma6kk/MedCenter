/**
 * field-errors — maps `ProblemDetails.details[]` onto react-hook-form fields (frontend-design-spec §5.4:
 * `VALIDATION_ERROR` → field errors with `aria-describedby`).
 *
 * The server paths are class-validator property paths (`email`, `diagnoses.0.code`); a field can carry several
 * messages. Unknown server fields are returned so the form can show them in a banner instead of dropping them.
 */
import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';
import type { FieldErrorDetail, ProblemDetails } from './problem';

const VALIDATION_MESSAGES: ReadonlyArray<readonly [RegExp, string]> = [
  [/should not be empty|must be longer than or equal to 1 characters/, 'Поле обязательно для заполнения'],
  [/must be an email/, 'Введите корректный email'],
  [/is not strong enough/, 'Пароль недостаточно надёжный: от 10 символов, строчные и прописные латинские буквы, цифра и спецсимвол'],
  [/must be shorter than or equal to (\d+) characters/, 'Слишком длинное значение'],
  [/must be longer than or equal to (\d+) characters/, 'Слишком короткое значение'],
  [/must be a valid ISO 8601 date string|must be a date/, 'Введите корректную дату'],
  [/must be a string/, 'Введите текстовое значение'],
  [/must be a number|must be an integer/, 'Введите число'],
  [/must be a uuid|must be a UUID/, 'Некорректный идентификатор'],
];

/** Russian copy for the class-validator messages the forms meet; anything else is shown as the server wrote it. */
export function localizeFieldMessage(message: string): string {
  const match = VALIDATION_MESSAGES.find(([pattern]) => pattern.test(message));
  return match === undefined ? message : match[1];
}

/** `{ field: [messages…] }` with `[0]` / `[0].x` normalised to dotted paths. */
export function groupFieldErrors(details: ReadonlyArray<FieldErrorDetail> | undefined): Readonly<Record<string, ReadonlyArray<string>>> {
  const grouped: Record<string, string[]> = {};
  (details ?? []).forEach(({ field, message }) => {
    const path: string = field.replace(/\[(\d+)\]/g, '.$1');
    (grouped[path] ??= []).push(localizeFieldMessage(message));
  });
  return grouped;
}

export function isValidationProblem(problem: ProblemDetails): boolean {
  return problem.errorCode === 'VALIDATION_ERROR' && (problem.details?.length ?? 0) > 0;
}

/**
 * Sets one RHF error per server field. Returns the server fields that are not part of the form so the caller can
 * show them (`ProblemBanner`) rather than lose them.
 */
export function applyProblemToForm<TValues extends FieldValues>(
  problem: ProblemDetails,
  setError: UseFormSetError<TValues>,
  knownFields: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const unmatched: string[] = [];
  Object.entries(groupFieldErrors(problem.details)).forEach(([field, messages]) => {
    if (!knownFields.includes(field)) {
      unmatched.push(...messages);
      return;
    }
    setError(field as FieldPath<TValues>, { type: 'server', message: messages.join('. ') });
  });
  return unmatched;
}

/** `EMAIL_TAKEN`-style codes arrive inside `detail` of a generic 409 (`POST /auth/register`). */
export function hasDetailCode(problem: ProblemDetails, code: string): boolean {
  return problem.detail?.startsWith(`${code}:`) === true || problem.detail === code;
}
