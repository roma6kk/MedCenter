'use client';

import type { ReactNode } from 'react';
import { FIELD_CLASS } from '@/components/ui/field-styles';
import { useT } from '@/lib/i18n/use-t';

/** What an input needs to be announced with its hint and error (WCAG 1.3.1, 3.3.1, 3.3.3). */
export interface FieldControlProps {
  readonly id: string;
  readonly 'aria-describedby': string | undefined;
  readonly 'aria-invalid': boolean;
}

interface FormFieldProps {
  readonly id: string;
  readonly label: string;
  /** Validation message: a `validation.*` message key (client schemas) or ready text (server messages). */
  readonly error?: string;
  readonly hint?: string;
  readonly children: (control: FieldControlProps) => ReactNode;
}

const VALIDATION_KEY_PREFIX = 'validation.';

/** The one shared field look (`ui/field-styles.ts`); `FormField` spaces the control from its label, so no margin here. */
export const INPUT_CLASS = FIELD_CLASS;

/** Space-separated ids of the elements that describe the control, or `undefined` when there are none. */
export function describedBy(...ids: ReadonlyArray<string | false | undefined>): string | undefined {
  const present: ReadonlyArray<string> = ids.filter((id): id is string => typeof id === 'string' && id !== '');
  return present.length === 0 ? undefined : present.join(' ');
}

/** A labelled control with an optional hint and an error message linked through `aria-describedby`. */
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
