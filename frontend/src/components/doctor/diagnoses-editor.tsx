'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { SegmentedControl, type SegmentOption } from '@/components/ui/segmented-control';
import { DIAGNOSES_MAX, ICD10_PATTERN, type CompleteEncounterForm } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { ICD10_VALUE_SET } from './doctor-api';
import type { Term, VerificationStatus } from './doctor-types';
import { EMPTY_DIAGNOSIS } from './encounter-form-defaults';
import { a11yOf, errorAt, INPUT_CLASS, ROW_CLASS } from './encounter-form-helpers';
import { AddRowButton, FieldRow, RemoveRowButton } from './encounter-form-fields';
import { FormSection } from './encounter-form-section';
import { Icd10Combobox } from './icd10-combobox';
import { codeOfTypedText, formatDiagnosis, upperCaseSearch } from './icd10-text';
import { buildRecentDiagnoses } from './patient-summary-model';
import { lookupTerm, usePatientHistory } from './use-doctor-queries';
import { useRemoveRowFocus } from './use-remove-row-focus';

const ICD10_SYSTEM = 'https://fhir.by/CodeSystem/InternClassificDiseases10';
const STATUSES: ReadonlyArray<VerificationStatus> = ['working', 'provisional', 'confirmed'];

type StatusChoice = '' | VerificationStatus;

function VerificationField({ index }: { readonly index: number }): ReactNode {
  const t = useT('doctor.encounter');
  const tVerification = useT('doctor.verification');
  const { control } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: `diagnoses.${index}.verificationStatus` });
  const error: string | undefined = errorAt(errors, `diagnoses.${index}.verificationStatus`);
  const options: ReadonlyArray<SegmentOption<StatusChoice>> = [{ value: '', label: t('verificationNone') }, ...STATUSES.map((status) => ({ value: status, label: tVerification(status) }))];
  return (
    <div>
      <p className="form-label">{t('verificationCaption')}</p>
      <Controller
        control={control}
        name={`diagnoses.${index}.verificationStatus`}
        render={({ field }) => (
          <SegmentedControl<StatusChoice>
            kind="toggle"
            label={t('verificationLabel', { n: index + 1 })}
            options={options}
            value={field.value ?? ''}
            onChange={(next) => field.onChange(next === '' ? undefined : next)}
            className="mt-1 grid w-full grid-cols-2 sm:inline-flex sm:w-auto"
          />
        )}
      />
      {error ? <p role="alert" className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

interface DiagnosisText {
  readonly text: string;
  readonly onTextChange: (raw: string) => void;
  readonly onSelectTerm: (term: Term) => void;
  readonly onLeave: (code: string) => void;
  readonly needsManualName: boolean;
}

function useDiagnosisText(index: number, hasCodeError: boolean): DiagnosisText {
  const { control, setValue, getValues } = useFormContext<CompleteEncounterForm>();
  const client = useQueryClient();
  const code: string = useWatch({ control, name: `diagnoses.${index}.code` });
  const display: string = useWatch({ control, name: `diagnoses.${index}.display` });
  const [typed, setTyped] = useState<string | null>(null);
  const [unnamedCode, setUnnamedCode] = useState<string | null>(() => (ICD10_PATTERN.test(code) && display === '' ? code : null));
  const codePath = `diagnoses.${index}.code` as const;
  const displayPath = `diagnoses.${index}.display` as const;

  const onTextChange = (raw: string): void => {
    const shown: string = typed === null ? formatDiagnosis(code, display) : typed;
    const isChosen: boolean = typed === null && code !== '' && display !== '';
    const next: string = !isChosen ? raw : raw.length < shown.length ? '' : raw.startsWith(shown) ? raw.slice(shown.length) : raw;
    setTyped(upperCaseSearch(next));
    setUnnamedCode(null);
    setValue(codePath, codeOfTypedText(next), { shouldDirty: true, shouldValidate: hasCodeError });
    setValue(displayPath, '', { shouldDirty: true });
  };
  const onSelectTerm = (term: Term): void => {
    setTyped(null);
    setValue(displayPath, term.display ?? '', { shouldDirty: true, shouldValidate: true });
  };
  const isNameEmpty = (): boolean => getValues(displayPath) === '';
  const onLeave = (current: string): void => {
    if (!ICD10_PATTERN.test(current)) return;
    setTyped(null);
    if (!isNameEmpty()) return;
    lookupTerm(client, ICD10_VALUE_SET, current)
      .then((term) => (term?.display && isNameEmpty() ? setValue(displayPath, term.display, { shouldDirty: true, shouldValidate: true }) : undefined))
      // The lookup is a convenience: on failure the doctor types the name; the server validates the code on submit.
      .catch(() => undefined)
      .finally(() => setUnnamedCode(isNameEmpty() ? current : null));
  };
  return { text: typed ?? formatDiagnosis(code, display), onTextChange, onSelectTerm, onLeave, needsManualName: unnamedCode !== null && unnamedCode === code };
}

interface DiagnosisCodeFieldProps {
  readonly index: number;
  readonly shortcuts: ReadonlyArray<Term>;
  readonly text: DiagnosisText;
}

function DiagnosisCombobox({ index, shortcuts, text }: DiagnosisCodeFieldProps): ReactNode {
  const t = useT('doctor.encounter');
  const { control } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: `diagnoses.${index}.code` });
  return (
    <Controller
      control={control}
      name={`diagnoses.${index}.code`}
      render={({ field }) => (
        <Icd10Combobox
          ref={field.ref}
          id={`icd10-${index}`}
          label={t('diagnosisLabel', { n: index + 1 })}
          value={field.value}
          onChange={field.onChange}
          text={text.text}
          onTextChange={text.onTextChange}
          onSelectTerm={text.onSelectTerm}
          onBlur={() => {
            field.onBlur();
            text.onLeave(field.value);
          }}
          shortcuts={shortcuts}
          shortcutsLabel={t('recentDiagnoses')}
          error={errorAt(errors, `diagnoses.${index}.code`)}
        />
      )}
    />
  );
}

function ManualNameField({ index }: { readonly index: number }): ReactNode {
  const t = useT('doctor.encounter');
  const { control, register } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: `diagnoses.${index}.display` });
  const displayId = `diagnosis-display-${index}`;
  const displayError = errorAt(errors, `diagnoses.${index}.display`);
  return (
    <div className="mt-3">
      <FieldRow id={displayId} label={t('diagnosisNameManual', { n: index + 1 })} error={displayError}>
        <input id={displayId} {...register(`diagnoses.${index}.display`)} {...a11yOf(displayId, displayError)} className={INPUT_CLASS} autoComplete="off" />
      </FieldRow>
      <p className="mt-1 text-sm text-muted-foreground">{t('diagnosisNameManualHint')}</p>
    </div>
  );
}

interface DiagnosisRowProps {
  readonly index: number;
  readonly canRemove: boolean;
  readonly shortcuts: ReadonlyArray<Term>;
  readonly onRemove: () => void;
}

function DiagnosisRow({ index, canRemove, shortcuts, onRemove }: DiagnosisRowProps): ReactNode {
  const t = useT('doctor.encounter');
  const { control } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name: [`diagnoses.${index}.code`, `diagnoses.${index}.display`] });
  const text = useDiagnosisText(index, errorAt(errors, `diagnoses.${index}.code`) !== undefined);
  const code: string = useWatch({ control, name: `diagnoses.${index}.code` });
  const needsName: boolean = text.needsManualName || (ICD10_PATTERN.test(code) && errorAt(errors, `diagnoses.${index}.display`) !== undefined);
  return (
    <div className={ROW_CLASS}>
      <DiagnosisCombobox index={index} shortcuts={shortcuts} text={text} />
      {needsName ? <ManualNameField index={index} /> : null}
      <div className="mt-3"><VerificationField index={index} /></div>
      {canRemove ? <RemoveRowButton onClick={onRemove} label={t('removeDiagnosis')} ariaLabel={t('removeDiagnosisN', { n: index + 1 })} /> : null}
    </div>
  );
}

function useDiagnosisShortcuts(patientId: string): ReadonlyArray<Term> {
  const { control } = useFormContext<CompleteEncounterForm>();
  const history = usePatientHistory(patientId, 1);
  const chosen: ReadonlyArray<{ readonly code?: string } | undefined> = useWatch({ control, name: 'diagnoses' });
  const taken = new Set((chosen ?? []).map((row) => row?.code ?? ''));
  return buildRecentDiagnoses(history.data?.items ?? [])
    .filter((diagnosis) => !taken.has(diagnosis.code))
    .map((diagnosis) => ({ system: ICD10_SYSTEM, code: diagnosis.code, display: diagnosis.display }));
}

export function DiagnosesEditor({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('doctor.encounter');
  const { control } = useFormContext<CompleteEncounterForm>();
  const { fields, append, remove } = useFieldArray({ control, name: 'diagnoses' });
  const removeRow = useRemoveRowFocus('diagnoses', 'code', 'diagnoses', fields.length, remove);
  const { errors } = useFormState({ control, name: 'diagnoses' });
  const listError = errorAt(errors, 'diagnoses');
  const shortcuts = useDiagnosisShortcuts(patientId);

  return (
    <FormSection id="diagnoses" title={t('diagnosesLegend')} hint={t('diagnosesHint')}>
      {listError ? <p role="alert" data-testid="diagnoses-error" className="mb-3 text-sm text-destructive">{listError}</p> : null}
      {fields.map((field, index) => (
        <DiagnosisRow key={field.id} index={index} canRemove={fields.length > 1} shortcuts={shortcuts} onRemove={() => removeRow(index)} />
      ))}
      <AddRowButton label={t('addDiagnosis')} onClick={() => append(EMPTY_DIAGNOSIS, { focusName: `diagnoses.${fields.length}.code` })} disabled={fields.length >= DIAGNOSES_MAX} />
    </FormSection>
  );
}
