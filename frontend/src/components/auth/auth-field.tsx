'use client';

import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { describedBy, type FieldControlProps } from '@/components/patient/form-field';
import { FIELD_CLASS } from '@/components/ui/field-styles';
import { useT } from '@/lib/i18n/use-t';

/** The auth screens use the one shared field look (`ui/field-styles.ts`); `AuthField` spaces the control from its label. */
export const AUTH_INPUT_CLASS = FIELD_CLASS;

interface AuthFieldProps {
  readonly id: string;
  readonly label: string;
  /** Validation message: a `validation.*` message key (client schemas) or ready text (server messages). */
  readonly error?: string;
  readonly hint?: string;
  /** The control draws its own label (a checkbox with the text beside it): only the hint and the error come from here. */
  readonly labelHidden?: boolean;
  readonly children: (control: FieldControlProps) => ReactNode;
}

const VALIDATION_KEY_PREFIX = 'validation.';

/** A labelled control with a hint and an error (icon + text, never colour alone) linked through `aria-describedby`. */
export function AuthField({ id, label, error, hint, labelHidden = false, children }: AuthFieldProps): ReactNode {
  const t = useT();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const message: string | undefined = error?.startsWith(VALIDATION_KEY_PREFIX) === true ? t(error) : error;
  return (
    <div className="mt-4 grid gap-1.5 first:mt-0">
      {labelHidden ? null : <label htmlFor={id} className="form-label">{label}</label>}
      {children({ id, 'aria-describedby': describedBy(hint !== undefined && hintId, message !== undefined && errorId), 'aria-invalid': message !== undefined })}
      {hint !== undefined ? <p id={hintId} className="text-xs text-muted-foreground">{hint}</p> : null}
      {message !== undefined ? (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}
