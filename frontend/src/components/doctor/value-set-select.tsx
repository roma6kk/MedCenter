'use client';

import { forwardRef } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { FIELD_CLASS } from '@/components/ui/field-styles';
import { Select } from '@/components/ui/select';
import { useT } from '@/lib/i18n/use-t';
import type { Term } from './doctor-types';
import { useExpansion } from './use-doctor-queries';

interface ValueSetSelectProps {
  readonly id: string;
  readonly valueSet: string;
  readonly value: string;
  readonly onChange: (term: Term | null) => void;
  readonly onBlur?: () => void;
  readonly placeholder: string;
  readonly fallbackCodes?: ReadonlyArray<string>;
  readonly optionLabel?: (term: Term) => string;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby'?: string;
}

const BOX_CLASS = 'mt-1';

function defaultOptionLabel(term: Term): string {
  return term.display ? `${term.code} — ${term.display}` : term.code;
}

function termFor(items: ReadonlyArray<Term>, code: string): Term | null {
  return items.find((item) => item.code === code) ?? null;
}

type FieldRef = React.ForwardedRef<HTMLSelectElement | HTMLInputElement>;

interface FallbackInputProps {
  readonly props: ValueSetSelectProps;
  readonly inputRef: FieldRef;
}

function FallbackInput({ props, inputRef }: FallbackInputProps): ReactNode {
  const { id, value, onChange, onBlur } = props;
  const t = useT('doctor.valueSet');
  return (
    <input
      ref={inputRef as React.Ref<HTMLInputElement>}
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value === '' ? null : { system: '', code: event.target.value })}
      onBlur={onBlur}
      placeholder={t('typeCode')}
      spellCheck={false}
      autoComplete="off"
      className={`mono ${BOX_CLASS} ${FIELD_CLASS}`}
      aria-invalid={props['aria-invalid']}
      aria-describedby={props['aria-describedby']}
    />
  );
}

interface OptionsSelectProps extends FallbackInputProps {
  readonly options: ReadonlyArray<Term>;
  readonly isPending: boolean;
}

function OptionsSelect({ props, inputRef, options, isPending }: OptionsSelectProps): ReactNode {
  const { id, value, onChange, onBlur, placeholder, optionLabel = defaultOptionLabel } = props;
  const t = useT('doctor.valueSet');
  const isKnown: boolean = value === '' || options.some((option) => option.code === value);
  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => onChange(termFor(options, event.target.value));
  return (
    <Select
      ref={inputRef as React.Ref<HTMLSelectElement>}
      id={id}
      value={value}
      onChange={handleChange}
      onBlur={onBlur}
      aria-busy={isPending}
      aria-invalid={props['aria-invalid']}
      aria-describedby={props['aria-describedby']}
      wrapperClassName={BOX_CLASS}
    >
      <option value="">{isPending ? t('loading') : placeholder}</option>
      {isKnown ? null : <option value={value}>{optionLabel({ system: '', code: value })}</option>}
      {options.map((option) => (
        <option key={option.code} value={option.code}>{optionLabel(option)}</option>
      ))}
    </Select>
  );
}

export const ValueSetSelect = forwardRef<HTMLSelectElement | HTMLInputElement, ValueSetSelectProps>(function ValueSetSelect(props, ref): ReactNode {
  const { valueSet, fallbackCodes } = props;
  const expansion = useExpansion(valueSet, '');
  if (expansion.isError && fallbackCodes === undefined) return <FallbackInput props={props} inputRef={ref} />;
  const options: ReadonlyArray<Term> = expansion.isError ? (fallbackCodes ?? []).map((code) => ({ system: '', code })) : expansion.data?.items ?? [];
  return <OptionsSelect props={props} inputRef={ref} options={options} isPending={expansion.isPending} />;
});
