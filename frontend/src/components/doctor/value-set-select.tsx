'use client';

import { forwardRef } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import type { Term } from './doctor-types';
import { useExpansion } from './use-doctor-queries';

export interface ValueSetSelectProps {
  readonly id: string;
  /** ValueSet canonical whose concepts are the options. */
  readonly valueSet: string;
  /** The chosen code (`''` while nothing is chosen). */
  readonly value: string;
  readonly onChange: (term: Term | null) => void;
  readonly onBlur?: () => void;
  readonly placeholder: string;
  /** Codes offered when the terminology service cannot be reached; without them the field degrades to typing a code. */
  readonly fallbackCodes?: ReadonlyArray<string>;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby'?: string;
}

const FIELD_CLASS = 'mt-1 w-full min-h-[44px] rounded-[6px] border border-[var(--input)] bg-[var(--card)] p-2';

function termFor(items: ReadonlyArray<Term>, code: string): Term | null {
  return items.find((item) => item.code === code) ?? null;
}

type FieldRef = React.ForwardedRef<HTMLSelectElement | HTMLInputElement>;

interface FallbackInputProps {
  readonly props: ValueSetSelectProps;
  readonly inputRef: FieldRef;
}

/** The terminology service is down and no short list exists: the code is typed, and the service validates it on submit. */
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
      className={`mono ${FIELD_CLASS}`}
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
  const { id, value, onChange, onBlur, placeholder } = props;
  const t = useT('doctor.valueSet');
  // A value the list does not contain (a code kept from before, a fallback code) stays selectable instead of silently vanishing.
  const isKnown: boolean = value === '' || options.some((option) => option.code === value);
  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => onChange(termFor(options, event.target.value));
  return (
    <select
      ref={inputRef as React.Ref<HTMLSelectElement>}
      id={id}
      value={value}
      onChange={handleChange}
      onBlur={onBlur}
      aria-busy={isPending}
      aria-invalid={props['aria-invalid']}
      aria-describedby={props['aria-describedby']}
      className={FIELD_CLASS}
    >
      <option value="">{isPending ? t('loading') : placeholder}</option>
      {isKnown ? null : <option value={value}>{value}</option>}
      {options.map((option) => (
        <option key={option.code} value={option.code}>{option.display ? `${option.code} — ${option.display}` : option.code}</option>
      ))}
    </select>
  );
}

/**
 * A closed list of concepts of a ValueSet (select-only: free text is refused, BR-009). A native `<select>` keeps keyboard
 * and screen-reader behaviour free. When the service is down it offers `fallbackCodes`, or a plain code input.
 */
export const ValueSetSelect = forwardRef<HTMLSelectElement | HTMLInputElement, ValueSetSelectProps>(function ValueSetSelect(props, ref): ReactNode {
  const { valueSet, fallbackCodes } = props;
  const expansion = useExpansion(valueSet, '');
  if (expansion.isError && fallbackCodes === undefined) return <FallbackInput props={props} inputRef={ref} />;
  const options: ReadonlyArray<Term> = expansion.isError ? (fallbackCodes ?? []).map((code) => ({ system: '', code })) : expansion.data?.items ?? [];
  return <OptionsSelect props={props} inputRef={ref} options={options} isPending={expansion.isPending} />;
});
