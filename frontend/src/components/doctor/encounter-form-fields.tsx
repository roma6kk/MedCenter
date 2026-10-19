'use client';

import type { ReactNode } from 'react';

interface FieldRowProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  readonly children: ReactNode;
}

/** A labelled field with its error underneath (announced; the input points at it through `aria-describedby`). */
export function FieldRow({ id, label, error, children }: FieldRowProps): ReactNode {
  return (
    <div>
      <label htmlFor={id} className="form-label block">{label}</label>
      {children}
      {error ? <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-[var(--destructive)]">{error}</p> : null}
    </div>
  );
}

export function RemoveRowButton({ onClick, label, ariaLabel }: { readonly onClick: () => void; readonly label: string; readonly ariaLabel: string }): ReactNode {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className="mt-2 min-h-[44px] min-w-[44px] text-sm underline">
      {label}
    </button>
  );
}
