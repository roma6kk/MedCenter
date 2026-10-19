'use client';

import type { ReactNode } from 'react';
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

export const INPUT_CLASS = 'mt-1 w-full min-h-[44px] rounded-[6px] border border-[var(--input)] bg-[var(--card)] p-2';

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
    <div className="mt-3 first:mt-0">
      <label htmlFor={id} className="form-label block">{label}</label>
      {children({ id, 'aria-describedby': describedBy(hint !== undefined && hintId, message !== undefined && errorId), 'aria-invalid': message !== undefined })}
      {hint !== undefined ? <p id={hintId} className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</p> : null}
      {message !== undefined ? <p id={errorId} role="alert" className="mt-1 text-sm text-[var(--destructive)]">{message}</p> : null}
    </div>
  );
}
