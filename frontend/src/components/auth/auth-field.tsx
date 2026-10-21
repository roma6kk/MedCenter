'use client';

import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { describedBy, type FieldControlProps } from '@/components/patient/form-field';
import { useT } from '@/lib/i18n/use-t';

/** Look of a text field, select or date input of the auth screens: 10 px radius, `--input` border (>= 3:1), 46 px tall. */
export const AUTH_INPUT_CLASS = 'mt-1.5 block min-h-[46px] w-full rounded-control border border-input bg-card px-3.5 text-base text-foreground aria-[invalid=true]:border-2 aria-[invalid=true]:border-destructive';

interface AuthFieldProps {
  readonly id: string;
  readonly label: string;
  /** Validation message: a `validation.*` message key (client schemas) or ready text (server messages). */
  readonly error?: string;
  readonly hint?: string;
  readonly children: (control: FieldControlProps) => ReactNode;
}

const VALIDATION_KEY_PREFIX = 'validation.';

/** A labelled control with a hint and an error (icon + text, never colour alone) linked through `aria-describedby`. */
export function AuthField({ id, label, error, hint, children }: AuthFieldProps): ReactNode {
  const t = useT();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const message: string | undefined = error?.startsWith(VALIDATION_KEY_PREFIX) === true ? t(error) : error;
  return (
    <div className="mt-4 first:mt-0">
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      {children({ id, 'aria-describedby': describedBy(hint !== undefined && hintId, message !== undefined && errorId), 'aria-invalid': message !== undefined })}
      {hint !== undefined ? <p id={hintId} className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      {message !== undefined ? (
        <p id={errorId} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}
