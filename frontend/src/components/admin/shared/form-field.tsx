import { cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly required?: boolean;
  readonly children: ReactNode;
}

interface ControlProps {
  readonly id: string;
  readonly 'aria-invalid': true | undefined;
  readonly 'aria-describedby': string | undefined;
}

export function controlProps(id: string, error?: string, hint?: string): ControlProps {
  const describedBy: string = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy === '' ? undefined : describedBy,
  };
}

function markRequired(control: ReactNode, required: boolean): ReactNode {
  if (!required || !isValidElement(control)) return control;
  return cloneElement(control as ReactElement<{ 'aria-required'?: boolean }>, { 'aria-required': true });
}

export function Field({ id, label, error, hint, required = false, children }: FieldProps): ReactNode {
  return (
    <div className="grid content-start gap-1">
      <label htmlFor={id} className="form-label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {markRequired(children, required)}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-[var(--muted-foreground)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-[var(--destructive)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface FieldsetProps {
  readonly id: string;
  readonly legend: string;
  readonly error?: string | undefined;
  readonly children: ReactNode;
}

export function Fieldset({ id, legend, error, children }: FieldsetProps): ReactNode {
  return (
    <fieldset aria-describedby={error ? `${id}-error` : undefined} className="grid content-start gap-1">
      <legend className="form-label">{legend}</legend>
      <div className="flex flex-wrap gap-3">{children}</div>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-[var(--destructive)]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
