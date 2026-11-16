'use client';

import type { ReactNode } from 'react';
import { Controller, useFormContext, useFormState } from 'react-hook-form';
import type { CompleteEncounterForm } from '@/lib/contracts';
import type { Term } from './doctor-types';
import { a11yOf, errorAt } from './encounter-form-helpers';
import { FieldRow } from './encounter-form-fields';
import { ValueSetSelect } from './value-set-select';

interface CodedTermFieldProps {
  readonly list: 'observations' | 'serviceRequests';
  readonly index: number;
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly valueSet: string;
  readonly optionLabel?: (term: Term) => string;
}

export function CodedTermField({ list, index, id, label, placeholder, valueSet, optionLabel }: CodedTermFieldProps): ReactNode {
  const { control, setValue } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: `${list}.${index}.code` });
  const error: string | undefined = errorAt(errors, `${list}.${index}.code`);
  return (
    <FieldRow id={id} label={label} error={error}>
      <Controller
        control={control}
        name={`${list}.${index}.code`}
        render={({ field }) => (
          <ValueSetSelect
            ref={field.ref}
            id={id}
            valueSet={valueSet}
            value={field.value}
            placeholder={placeholder}
            optionLabel={optionLabel}
            onBlur={field.onBlur}
            onChange={(term) => {
              field.onChange(term?.code ?? '');
              if (term?.system) setValue(`${list}.${index}.codeSystem`, term.system);
            }}
            {...a11yOf(id, error)}
          />
        )}
      />
    </FieldRow>
  );
}
