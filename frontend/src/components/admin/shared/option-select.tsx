import type { ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { CONTROL_CLASS } from './admin-styles';
import { controlProps, Field } from './form-field';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

interface OptionSelectProps {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly options: ReadonlyArray<SelectOption>;
  readonly registration: UseFormRegisterReturn;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly required?: boolean;
}

/** A labelled native `<select>` with a «выберите…» first option, wired to react-hook-form. */
export function OptionSelect({ id, label, placeholder, options, registration, error, hint, required = false }: OptionSelectProps): ReactNode {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <select {...controlProps(id, error, hint)} className={CONTROL_CLASS} {...registration}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
