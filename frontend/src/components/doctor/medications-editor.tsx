'use client';

import type { ReactNode } from 'react';
import { Controller, useFieldArray, useFormContext, useFormState } from 'react-hook-form';
import { MEDICATION_REQUESTS_MAX, type CompleteEncounterForm } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { AtcCodeField } from './atc-code-field';
import { EMPTY_MEDICATION } from './encounter-form-defaults';
import { a11yOf, ADD_BUTTON_CLASS, errorAt, FIELDSET_CLASS, INPUT_CLASS, ROW_CLASS } from './encounter-form-helpers';
import { FieldRow, RemoveRowButton } from './encounter-form-fields';

/** Dosage instruction (required) and a note (optional) of a drug row. */
function MedicationTextFields({ index }: { readonly index: number }): ReactNode {
  const t = useT('doctor.medications');
  const { control, register } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: [`medicationRequests.${index}.dosageText`, `medicationRequests.${index}.note`] });
  const dosageId = `medication-dosage-${index}`;
  const noteId = `medication-note-${index}`;
  const dosageError = errorAt(errors, `medicationRequests.${index}.dosageText`);
  const noteError = errorAt(errors, `medicationRequests.${index}.note`);
  return (
    <>
      <div className="mt-2">
        <FieldRow id={dosageId} label={t('dosage', { n: index + 1 })} error={dosageError}>
          <input id={dosageId} {...register(`medicationRequests.${index}.dosageText`)} {...a11yOf(dosageId, dosageError)} className={INPUT_CLASS} placeholder={t('dosagePlaceholder')} autoComplete="off" />
        </FieldRow>
      </div>
      <div className="mt-2">
        <FieldRow id={noteId} label={t('note', { n: index + 1 })} error={noteError}>
          <input id={noteId} {...register(`medicationRequests.${index}.note`)} {...a11yOf(noteId, noteError)} className={INPUT_CLASS} autoComplete="off" />
        </FieldRow>
      </div>
    </>
  );
}

function MedicationRow({ index, onRemove }: { readonly index: number; readonly onRemove: () => void }): ReactNode {
  const t = useT('doctor.medications');
  const { control } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: `medicationRequests.${index}.atcCode` });
  return (
    <div className={ROW_CLASS}>
      <Controller
        control={control}
        name={`medicationRequests.${index}.atcCode`}
        render={({ field }) => (
          <AtcCodeField
            ref={field.ref}
            id={`medication-atc-${index}`}
            labelSuffix={t('medicationN', { n: index + 1 })}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            error={errorAt(errors, `medicationRequests.${index}.atcCode`)}
          />
        )}
      />
      <MedicationTextFields index={index} />
      <RemoveRowButton onClick={onRemove} label={t('remove')} ariaLabel={t('removeN', { n: index + 1 })} />
    </div>
  );
}

/** Drug prescriptions (MedicationRequest, ATC code, BR-009/BR-005): code, dosage text and a note. Optional. */
export function MedicationsEditor(): ReactNode {
  const t = useT('doctor.medications');
  const { control } = useFormContext<CompleteEncounterForm>();
  const { fields, append, remove } = useFieldArray({ control, name: 'medicationRequests' });
  return (
    <fieldset className={`mt-4 ${FIELDSET_CLASS}`}>
      <legend className="px-1 font-semibold">{t('legend')}</legend>
      {fields.length === 0 ? <p className="text-sm text-muted-foreground">{t('empty')}</p> : null}
      {fields.map((field, index) => <MedicationRow key={field.id} index={index} onRemove={() => remove(index)} />)}
      <button type="button" onClick={() => append(EMPTY_MEDICATION, { focusName: `medicationRequests.${fields.length}.atcCode` })} disabled={fields.length >= MEDICATION_REQUESTS_MAX} className={ADD_BUTTON_CLASS}>
        {t('add')}
      </button>
    </fieldset>
  );
}
