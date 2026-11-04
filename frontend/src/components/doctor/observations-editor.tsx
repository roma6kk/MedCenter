'use client';

import type { ReactNode } from 'react';
import { Controller, useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { OBSERVATIONS_MAX, type CompleteEncounterForm } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { CodedTermField } from './coded-term-field';
import { OBSERVATIONS_VALUE_SET } from './doctor-api';
import { a11yOf, errorAt, INPUT_CLASS, ROW_CLASS } from './encounter-form-helpers';
import { AddRowButton, EmptyListLine, FieldRow, RemoveRowButton } from './encounter-form-fields';
import { FormSection } from './encounter-form-section';
import { EMPTY_OBSERVATION } from './encounter-form-defaults';
import { UcumUnitSelect } from './ucum-unit-select';
import { useRemoveRowFocus } from './use-remove-row-focus';

function ObservationUnitField({ index }: { readonly index: number }): ReactNode {
  const t = useT('doctor.observations');
  const { control } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: `observations.${index}.unit` });
  const unitId = `observation-unit-${index}`;
  const observationCode: string = useWatch({ control, name: `observations.${index}.code` });
  const unitError = errorAt(errors, `observations.${index}.unit`);
  return (
    <FieldRow id={unitId} label={t('unit', { n: index + 1 })} error={unitError}>
      <Controller
        control={control}
        name={`observations.${index}.unit`}
        render={({ field }) => <UcumUnitSelect ref={field.ref} id={unitId} observationCode={observationCode} value={field.value} onChange={field.onChange} onBlur={field.onBlur} {...a11yOf(unitId, unitError)} />}
      />
    </FieldRow>
  );
}

function ObservationRow({ index, onRemove }: { readonly index: number; readonly onRemove: () => void }): ReactNode {
  const t = useT('doctor.observations');
  const { control, register } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: `observations.${index}.value` });
  const valueId = `observation-value-${index}`;
  const valueError = errorAt(errors, `observations.${index}.value`);

  return (
    <div className={ROW_CLASS}>
      <div className="grid gap-2 md:grid-cols-3">
        <CodedTermField list="observations" index={index} id={`observation-code-${index}`} label={t('code', { n: index + 1 })} placeholder={t('codePlaceholder')} valueSet={OBSERVATIONS_VALUE_SET} />
        <FieldRow id={valueId} label={t('value', { n: index + 1 })} error={valueError}>
          <input id={valueId} type="number" step="any" inputMode="decimal" {...register(`observations.${index}.value`, { valueAsNumber: true })} {...a11yOf(valueId, valueError)} className={`${INPUT_CLASS} max-w-[12rem] tabular-nums`} />
        </FieldRow>
        <ObservationUnitField index={index} />
      </div>
      <RemoveRowButton onClick={onRemove} label={t('remove')} ariaLabel={t('removeN', { n: index + 1 })} />
    </div>
  );
}

/** Examination and vital signs (FR-012…): a NSI observation code, a number and a UCUM unit (BR-009). Optional. */
export function ObservationsEditor(): ReactNode {
  const t = useT('doctor.observations');
  const { control } = useFormContext<CompleteEncounterForm>();
  const { fields, append, remove } = useFieldArray({ control, name: 'observations' });
  const removeRow = useRemoveRowFocus('observations', 'code', 'observations', fields.length, remove);
  const add = (): void => append(EMPTY_OBSERVATION, { focusName: `observations.${fields.length}.code` });
  return (
    <FormSection id="observations" title={t('legend')}>
      {fields.length === 0 ? <EmptyListLine message={t('empty')} addLabel={t('add')} onAdd={add} /> : null}
      {fields.map((field, index) => <ObservationRow key={field.id} index={index} onRemove={() => removeRow(index)} />)}
      {fields.length > 0 ? <AddRowButton label={t('add')} onClick={add} disabled={fields.length >= OBSERVATIONS_MAX} /> : null}
    </FormSection>
  );
}
