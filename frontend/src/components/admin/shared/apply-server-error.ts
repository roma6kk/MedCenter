import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';
import { applyProblemToForm, groupFieldErrors } from '@/lib/api/field-errors';
import { detailCodeOf, problemOf } from './problem-of';

/** A server reason (a `detail` code or an `errorCode`) that belongs to one field, with the text to show there. */
export interface ServerFieldRule {
  readonly field: string;
  readonly message: string;
}

/** Where a failed submit ended up. */
export interface ServerErrorOutcome {
  /** A field took the message and nothing is left over: a banner above the buttons would only repeat it. */
  readonly onFields: boolean;
  /** Server messages of fields the form has no place for; the banner must show them or they are lost. */
  readonly leftover: ReadonlyArray<string>;
}

type FormErrorTarget<TValues extends FieldValues> = Pick<UseFormReturn<TValues>, 'setError' | 'setFocus'>;

const NOT_ON_FIELDS: ServerErrorOutcome = { onFields: false, leftover: [] };

/**
 * Puts the failure of a submit onto the form: every `details[]` entry on its field, and the single-field reasons
 * (`EMAIL_TAKEN` → email, `TERMINOLOGY_NOT_FOUND` → typeCode) from `rules`. The first field that got a message takes the
 * focus, so a keyboard or screen-reader user lands on what to fix. The outcome says whether the banner is still needed.
 */
export function applyServerError<TValues extends FieldValues>(
  error: unknown,
  form: FormErrorTarget<TValues>,
  fields: ReadonlyArray<string>,
  rules: Readonly<Record<string, ServerFieldRule>> = {},
): ServerErrorOutcome {
  const problem = problemOf(error);
  if (problem === null) return NOT_ON_FIELDS;
  const leftover: ReadonlyArray<string> = applyProblemToForm(problem, form.setError, fields);
  const rule: ServerFieldRule | undefined = rules[detailCodeOf(problem) ?? problem.errorCode];
  if (rule !== undefined) form.setError(rule.field as FieldPath<TValues>, { type: 'server', message: rule.message });
  const first: string | undefined = rule?.field ?? Object.keys(groupFieldErrors(problem.details)).find((field) => fields.includes(field));
  if (first !== undefined) form.setFocus(first as FieldPath<TValues>);
  return { onFields: first !== undefined && leftover.length === 0, leftover };
}
