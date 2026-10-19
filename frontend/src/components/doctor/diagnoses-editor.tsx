'use client';

import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useFieldArray, useFormContext, useFormState } from 'react-hook-form';
import { DIAGNOSES_MAX, ICD10_PATTERN, type CompleteEncounterForm } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { ICD10_VALUE_SET } from './doctor-api';
import { EMPTY_DIAGNOSIS } from './encounter-form-defaults';
import { Icd10Combobox } from './icd10-combobox';
import { a11yOf, ADD_BUTTON_CLASS, errorAt, FIELDSET_CLASS, INPUT_CLASS, ROW_CLASS } from './encounter-form-helpers';
import { FieldRow, RemoveRowButton } from './encounter-form-fields';
import type { Term } from './doctor-types';
import { lookupTerm } from './use-doctor-queries';

const VERIFICATION_STATUSES = ['', 'working', 'provisional', 'confirmed'] as const;

interface NameFromCode {
  /** Copies a picked concept's name into the row's name field. */
  readonly applyTerm: (term: Term) => void;
  /** A code typed out in full (not picked) still gets its name when the field is left and the name is empty. */
  readonly fillNameOf: (code: string) => void;
}

function useNameFromCode(index: number): NameFromCode {
  const { setValue, getValues } = useFormContext<CompleteEncounterForm>();
  const client = useQueryClient();
  const applyTerm = (term: Term): void => {
    if (term.display) setValue(`diagnoses.${index}.display`, term.display, { shouldValidate: true });
  };
  const isNameEmpty = (): boolean => getValues(`diagnoses.${index}.display`) === '';
  const fillNameOf = (code: string): void => {
    if (!ICD10_PATTERN.test(code) || !isNameEmpty()) return;
    lookupTerm(client, ICD10_VALUE_SET, code)
      .then((term) => (term !== null && isNameEmpty() ? applyTerm(term) : undefined))
      // The lookup is a convenience: when it fails the doctor types the name, and the server still validates the code on submit.
      .catch(() => undefined);
  };
  return { applyTerm, fillNameOf };
}

function VerificationField({ index }: { readonly index: number }): ReactNode {
  const t = useT('doctor.encounter');
  const tVerification = useT('doctor.verification');
  const { control, register } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: `diagnoses.${index}.verificationStatus` });
  const statusId = `diagnosis-status-${index}`;
  return (
    <FieldRow id={statusId} label={t('verificationLabel', { n: index + 1 })} error={errorAt(errors, `diagnoses.${index}.verificationStatus`)}>
      <select id={statusId} {...register(`diagnoses.${index}.verificationStatus`)} className={INPUT_CLASS}>
        {VERIFICATION_STATUSES.map((status) => (
          <option key={status} value={status}>{status === '' ? t('verificationNone') : tVerification(status)}</option>
        ))}
      </select>
    </FieldRow>
  );
}

/** The free-text name of a diagnosis (`display`); picking an ICD-10 code fills it in, the doctor may still adjust it. */
function DiagnosisNameField({ index }: { readonly index: number }): ReactNode {
  const t = useT('doctor.encounter');
  const { control, register } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: `diagnoses.${index}.display` });
  const displayId = `diagnosis-display-${index}`;
  const displayError = errorAt(errors, `diagnoses.${index}.display`);
  return (
    <FieldRow id={displayId} label={t('diagnosisName', { n: index + 1 })} error={displayError}>
      <input id={displayId} {...register(`diagnoses.${index}.display`)} {...a11yOf(displayId, displayError)} className={INPUT_CLASS} autoComplete="off" />
    </FieldRow>
  );
}

/** The ICD-10 code of a row: the combobox; picking or typing out a code also fills the row's name. */
function DiagnosisCodeField({ index }: { readonly index: number }): ReactNode {
  const t = useT('doctor.encounter');
  const { control } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: `diagnoses.${index}.code` });
  const { applyTerm, fillNameOf } = useNameFromCode(index);
  return (
    <Controller
      control={control}
      name={`diagnoses.${index}.code`}
      render={({ field }) => (
        <Icd10Combobox
          ref={field.ref}
          id={`icd10-${index}`}
          labelSuffix={t('diagnosisN', { n: index + 1 })}
          value={field.value}
          onChange={field.onChange}
          onBlur={() => {
            field.onBlur();
            fillNameOf(field.value);
          }}
          onSelectTerm={applyTerm}
          error={errorAt(errors, `diagnoses.${index}.code`)}
        />
      )}
    />
  );
}

function DiagnosisRow({ index, canRemove, onRemove }: { readonly index: number; readonly canRemove: boolean; readonly onRemove: () => void }): ReactNode {
  const t = useT('doctor.encounter');
  return (
    <div className={ROW_CLASS}>
      <DiagnosisCodeField index={index} />
      <div className="mt-2"><DiagnosisNameField index={index} /></div>
      <div className="mt-2"><VerificationField index={index} /></div>
      {canRemove ? <RemoveRowButton onClick={onRemove} label={t('removeDiagnosis')} ariaLabel={t('removeDiagnosisN', { n: index + 1 })} /> : null}
    </div>
  );
}

/** Summary (ClinicalImpression) and the ICD-10 diagnoses (BR-004): at least one, at most 20; the first is the primary one. */
export function DiagnosesEditor(): ReactNode {
  const t = useT('doctor.encounter');
  const { control, register } = useFormContext<CompleteEncounterForm>();
  const { fields, append, remove } = useFieldArray({ control, name: 'diagnoses' });
  const { errors } = useFormState({ control, name: ['summary', 'diagnoses'] });
  const summaryError = errorAt(errors, 'summary');
  const listError = errorAt(errors, 'diagnoses');

  return (
    <fieldset className={FIELDSET_CLASS}>
      <legend className="px-1 font-semibold">{t('diagnosesLegend')}</legend>
      <FieldRow id="summary" label={t('summary')} error={summaryError}>
        <textarea id="summary" rows={4} {...register('summary')} {...a11yOf('summary', summaryError)} className={INPUT_CLASS} />
      </FieldRow>
      <p className="mt-4 text-sm font-medium">{t('diagnosesHint')}</p>
      {listError ? <p role="alert" data-testid="diagnoses-error" className="text-sm text-[var(--destructive)]">{listError}</p> : null}
      {fields.map((field, index) => (
        <DiagnosisRow key={field.id} index={index} canRemove={fields.length > 1} onRemove={() => remove(index)} />
      ))}
      <button type="button" onClick={() => append(EMPTY_DIAGNOSIS, { focusName: `diagnoses.${fields.length}.code` })} disabled={fields.length >= DIAGNOSES_MAX} className={ADD_BUTTON_CLASS}>
        {t('addDiagnosis')}
      </button>
    </fieldset>
  );
}
