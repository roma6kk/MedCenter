/**
 * field-errors — maps `ProblemDetails.details[]` onto react-hook-form fields (frontend-design-spec §5.4:
 * `VALIDATION_ERROR` → field errors with `aria-describedby`).
 *
 * The server paths are class-validator property paths (`email`, `diagnoses.0.code`); a field can carry several
 * messages. Unknown server fields are returned so the form can show them in a banner instead of dropping them.
 */
import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';
import { translate } from '@/lib/i18n/translate';
import type { FieldErrorDetail, ProblemDetails } from './problem';

/** class-validator wording → key under `validation.*` of the messages catalogue (both languages). */
const VALIDATION_MESSAGES: ReadonlyArray<readonly [RegExp, string]> = [
  [/should not be empty|must be longer than or equal to 1 characters/, 'validation.required'],
  [/must be an email/, 'validation.email'],
  [/is not strong enough/, 'validation.passwordStrength'],
  [/must be shorter than or equal to (\d+) characters/, 'validation.tooLong'],
  [/must be longer than or equal to (\d+) characters/, 'validation.tooShort'],
  [/must be a valid ISO 8601 date string|must be a date/, 'validation.date'],
  [/must be a string/, 'validation.text'],
  [/must be a number|must be an integer/, 'validation.number'],
  [/must be a uuid|must be a UUID/, 'validation.identifier'],
  [/must be one of the following values/, 'validation.choice'],
  [/must be a boolean/, 'validation.boolean'],
  [/must match .* regular expression/, 'validation.format'],
];

/**
 * The class-validator messages the forms meet, in the language of the interface (the server always writes English);
 * anything else is shown as the server wrote it.
 */
export function localizeFieldMessage(message: string): string {
  const match = VALIDATION_MESSAGES.find(([pattern]) => pattern.test(message));
  return match === undefined ? message : translate(match[1]);
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
