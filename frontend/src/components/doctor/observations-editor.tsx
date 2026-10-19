'use client';

import type { ReactNode } from 'react';
import { Controller, useFieldArray, useFormContext, useFormState } from 'react-hook-form';
import { OBSERVATIONS_MAX, type CompleteEncounterForm } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { CodedTermField } from './coded-term-field';
import { OBSERVATIONS_VALUE_SET } from './doctor-api';
import { a11yOf, ADD_BUTTON_CLASS, errorAt, FIELDSET_CLASS, INPUT_CLASS, ROW_CLASS } from './encounter-form-helpers';
import { FieldRow, RemoveRowButton } from './encounter-form-fields';
import { EMPTY_OBSERVATION } from './encounter-form-defaults';
import { UcumUnitSelect } from './ucum-unit-select';

function ObservationUnitField({ index }: { readonly index: number }): ReactNode {
  const t = useT('doctor.observations');
  const { control } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: `observations.${index}.unit` });
  const unitId = `observation-unit-${index}`;
  const unitError = errorAt(errors, `observations.${index}.unit`);
  return (
    <FieldRow id={unitId} label={t('unit', { n: index + 1 })} error={unitError}>
      <Controller
        control={control}
        name={`observations.${index}.unit`}
        render={({ field }) => <UcumUnitSelect ref={field.ref} id={unitId} value={field.value} onChange={field.onChange} onBlur={field.onBlur} {...a11yOf(unitId, unitError)} />}
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
          <input id={valueId} type="number" step="any" inputMode="decimal" {...register(`observations.${index}.value`, { valueAsNumber: true })} {...a11yOf(valueId, valueError)} className={`mono ${INPUT_CLASS}`} />
        </FieldRow>
        <ObservationUnitField index={index} />
      </div>
      <RemoveRowButton onClick={onRemove} label={t('remove')} ariaLabel={t('removeN', { n: index + 1 })} />
    </div>
  );
}

/** Vital signs and measurements (FR-012…): a NSI observation code, a number and a UCUM unit (BR-009). Optional. */
export function ObservationsEditor(): ReactNode {
  const t = useT('doctor.observations');
  const { control } = useFormContext<CompleteEncounterForm>();
  const { fields, append, remove } = useFieldArray({ control, name: 'observations' });
  return (
    <fieldset className={`mt-4 ${FIELDSET_CLASS}`}>
      <legend className="px-1 font-semibold">{t('legend')}</legend>
      {fields.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">{t('empty')}</p> : null}
      {fields.map((field, index) => <ObservationRow key={field.id} index={index} onRemove={() => remove(index)} />)}
      <button type="button" onClick={() => append(EMPTY_OBSERVATION, { focusName: `observations.${fields.length}.code` })} disabled={fields.length >= OBSERVATIONS_MAX} className={ADD_BUTTON_CLASS}>
        {t('add')}
      </button>
    </fieldset>
  );
}
