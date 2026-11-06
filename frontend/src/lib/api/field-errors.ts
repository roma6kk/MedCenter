import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';
import { translate } from '@/lib/i18n/translate';
import type { FieldErrorDetail, ProblemDetails } from './problem';

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
  [/must be a Belarus number/, 'validation.phone'],
  [/must match .* regular expression/, 'validation.format'],
];

export function localizeFieldMessage(message: string): string {
  const match = VALIDATION_MESSAGES.find(([pattern]) => pattern.test(message));
  return match === undefined ? message : translate(match[1]);
}

export function groupFieldErrors(details: ReadonlyArray<FieldErrorDetail> | undefined): Readonly<Record<string, ReadonlyArray<string>>> {
  const grouped: Record<string, string[]> = {};
  (details ?? []).forEach(({ field, message }) => {
    const path = field.replace(/\[(\d+)\]/g, '.$1');
    (grouped[path] ??= []).push(localizeFieldMessage(message));
  });
  return grouped;
}

export function isValidationProblem(problem: ProblemDetails): boolean {
  return problem.errorCode === 'VALIDATION_ERROR' && (problem.details?.length ?? 0) > 0;
}

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

export function hasDetailCode(problem: ProblemDetails, code: string): boolean {
  return problem.detail?.startsWith(`${code}:`) === true || problem.detail === code;
}
