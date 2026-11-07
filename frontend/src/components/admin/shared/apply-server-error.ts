import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';
import { applyProblemToForm, groupFieldErrors } from '@/lib/api/field-errors';
import { detailCodeOf, problemOf } from './problem-of';

export interface ServerFieldRule {
  readonly field: string;
  readonly message: string;
}

export interface ServerErrorOutcome {
  readonly onFields: boolean;
  readonly leftover: ReadonlyArray<string>;
}

type FormErrorTarget<TValues extends FieldValues> = Pick<UseFormReturn<TValues>, 'setError' | 'setFocus'>;

const NOT_ON_FIELDS: ServerErrorOutcome = { onFields: false, leftover: [] };

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
