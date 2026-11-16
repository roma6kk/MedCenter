'use client';

import type { ReactNode } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FIELD_NARROW_CLASS } from '@/components/ui/field-styles';
import { FileDrop } from '@/components/ui/file-drop';
import { FormField, INPUT_CLASS } from '@/components/patient/form-field';
import { clinicDateKey } from '@/lib/clinic-time';
import { CONSENT_SCAN_CONTENT_TYPES, CONSENT_SCAN_MAX_BYTES } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { useConsentRecordForm, type ConsentRecordFormState } from './use-consent-record-form';
import { Select } from '@/components/ui/select';

type Role = 'ADMIN' | 'DOCTOR';

function ScanField({ state }: { readonly state: ConsentRecordFormState }): ReactNode {
  const t = useT('consent.staff');
  const { setValue, control, formState: { errors } } = state.form;
  const file: File | null = useWatch({ control, name: 'file' });
  return (
    <FormField id="consent-file" label={t('file')} error={errors.file?.message}>
      {(controlProps) => (
        <FileDrop
          {...controlProps}
          value={file}
          accept={CONSENT_SCAN_CONTENT_TYPES}
          maxBytes={CONSENT_SCAN_MAX_BYTES}
          onChange={(next) => setValue('file', next, { shouldValidate: state.form.formState.isSubmitted })}
        />
      )}
    </FormField>
  );
}

function SignerField({ state, role }: { readonly state: ConsentRecordFormState; readonly role: Role }): ReactNode {
  const t = useT('consent.staff');
  const { register, formState: { errors } } = state.form;
  if (role === 'DOCTOR') return <p className="mt-3 text-xs text-muted-foreground">{t('signedByDoctorHint')}</p>;
  return (
    <FormField id="consent-signed-by" label={`${t('signedByName')} *`} error={errors.signedByName?.message}>
      {(control) => <input {...control} type="text" aria-required="true" {...register('signedByName')} className={INPUT_CLASS} />}
    </FormField>
  );
}

function EntryFields({ state, role }: { readonly state: ConsentRecordFormState; readonly role: Role }): ReactNode {
  const t = useT('consent.staff');
  const { register, control, formState: { errors } } = state.form;
  return (
    <>
      <FormField id="consent-form-number" label={t('formNumber')} error={errors.formNumber?.message}>
        {(controlProps) => <input {...controlProps} type="text" aria-required="true" {...register('formNumber')} className={`${INPUT_CLASS} ${FIELD_NARROW_CLASS}`} />}
      </FormField>
      <FormField id="consent-signed-at" label={t('signedAt')} error={errors.signedAt?.message}>
        {(controlProps) => <Controller control={control} name="signedAt" render={({ field }) => <DatePicker {...controlProps} {...field} max={clinicDateKey()} aria-required="true" />} />}
      </FormField>
      <FormField id="consent-status" label={t('entryStatus')}>
        {(controlProps) => (
          <Select {...controlProps} {...register('status')} wrapperClassName="max-w-xs">
            <option value="active">{t('entryStatuses.active')}</option>
            <option value="rejected">{t('entryStatuses.rejected')}</option>
          </Select>
        )}
      </FormField>
      <SignerField state={state} role={role} />
      <ScanField state={state} />
    </>
  );
}

interface ConsentRecordFormProps {
  readonly patientId: string;
  readonly role: Role;
}

export function ConsentRecordForm({ patientId, role }: ConsentRecordFormProps): ReactNode {
  const t = useT('consent.staff');
  const state: ConsentRecordFormState = useConsentRecordForm(patientId, role);
  return (
    <form onSubmit={state.submit} noValidate aria-labelledby="consent-record-title" className="mt-2">
      <h3 id="consent-record-title" className="text-base font-bold">{t('recordTitle')}</h3>
      <EntryFields state={state} role={role} />
      {state.isAlreadyActive ? <p role="alert" className="mt-3 rounded-card bg-warning-soft p-3 text-sm">{t('alreadyActive')}</p> : null}
      {state.problem !== null ? <div className="mt-3"><ProblemBanner problem={state.problem} /></div> : null}
      <Button type="submit" aria-disabled={state.isPending ? true : undefined} aria-busy={state.isPending} className="mt-4">
        {state.isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
