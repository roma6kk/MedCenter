'use client';

import type { ReactNode } from 'react';
import { FIELD_CLASS } from '@/components/ui/field-styles';
import { useT } from '@/lib/i18n/use-t';

export interface FieldControlProps {
  readonly id: string;
  readonly 'aria-describedby': string | undefined;
  readonly 'aria-invalid': boolean;
}

interface FormFieldProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  readonly hint?: string;
  readonly children: (control: FieldControlProps) => ReactNode;
}

const VALIDATION_KEY_PREFIX = 'validation.';

export const INPUT_CLASS = FIELD_CLASS;

export function describedBy(...ids: ReadonlyArray<string | false | undefined>): string | undefined {
  const present: ReadonlyArray<string> = ids.filter((id): id is string => typeof id === 'string' && id !== '');
  return present.length === 0 ? undefined : present.join(' ');
}

export function FormField({ id, label, error, hint, children }: FormFieldProps): ReactNode {
  const tValidation = useT();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const message: string | undefined = error?.startsWith(VALIDATION_KEY_PREFIX) === true ? tValidation(error) : error;
  return (
    <div className="mt-4 grid gap-1.5 first:mt-0">
      <label htmlFor={id} className="form-label">{label}</label>
      {children({ id, 'aria-describedby': describedBy(hint !== undefined && hintId, message !== undefined && errorId), 'aria-invalid': message !== undefined })}
      {hint !== undefined ? <p id={hintId} className="text-xs text-muted-foreground">{hint}</p> : null}
      {message !== undefined ? <p id={errorId} role="alert" className="text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
