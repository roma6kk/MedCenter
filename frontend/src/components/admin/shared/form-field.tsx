import { cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';

interface FieldProps {
  /** Id of the control inside; it is wired to the label, the hint and the error text. */
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

/** `id`, `aria-invalid` and `aria-describedby` of a control in a `Field` (WCAG 3.3.1: the error is tied to the input). */
export function controlProps(id: string, error?: string, hint?: string): ControlProps {
  const describedBy: string = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy === '' ? undefined : describedBy,
  };
}

/**
 * A required control tells assistive technology so (`aria-required`, WCAG 3.3.2): the asterisk in the label is hidden from
 * screen readers. The control is the single child element, so `Field` sets it and no call site has to repeat it.
 */
function markRequired(control: ReactNode, required: boolean): ReactNode {
  if (!required || !isValidElement(control)) return control;
  return cloneElement(control as ReactElement<{ 'aria-required'?: boolean }>, { 'aria-required': true });
}

/** Label + control + hint + error. The control is the child and takes `{...controlProps(id, error, hint)}`. */
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
  /** Id of the group; its error text is `${id}-error` and the `fieldset` is described by it. */
  readonly id: string;
  readonly legend: string;
  readonly error?: string | undefined;
  readonly children: ReactNode;
}

/** A group of related controls (roles, statuses) with one legend and one error. */
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
