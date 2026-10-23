'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useWatch } from 'react-hook-form';
import type { RelatedPerson } from '@/components/doctor/doctor-types';
import { useRelatedPersons } from '@/components/doctor/use-doctor-queries';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { Button } from '@/components/ui/button';
import { FormField, INPUT_CLASS } from '@/components/patient/form-field';
import { CONSENT_SCAN_CONTENT_TYPES } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { CONSENTER_TYPES } from './consent-types';
import { useConsentRecordForm, type ConsentRecordFormState } from './use-consent-record-form';

type Role = 'ADMIN' | 'DOCTOR';

function relatedLabel(person: RelatedPerson): string {
  const relationship: string | undefined = person.relationship.map((coding) => coding.display ?? coding.code).find((text) => text !== undefined && text !== '');
  return relationship === undefined ? person.fullName : `${person.fullName} (${relationship})`;
}

/** Choice of the person who signed for the patient and the document that gives them the right to (art. 18 of the Healthcare Law). */
function RepresentativeFields({ state, patientId }: { readonly state: ConsentRecordFormState; readonly patientId: string }): ReactNode {
  const t = useT('consent.staff');
  const related = useRelatedPersons(patientId, 1);
  const { register, formState: { errors } } = state.form;
  const persons: ReadonlyArray<RelatedPerson> = related.data?.items ?? [];
  return (
    <>
      {related.data !== undefined && persons.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t('relatedNone')}</p> : null}
      <FormField id="consent-related" label={t('relatedPerson')} error={errors.relatedPersonId?.message}>
        {(control) => (
          <select {...control} {...register('relatedPersonId')} className={INPUT_CLASS}>
            <option value="">{t('relatedPlaceholder')}</option>
            {persons.map((person) => <option key={person.id} value={person.id}>{relatedLabel(person)}</option>)}
          </select>
        )}
      </FormField>
      <FormField id="consent-document" label={t('representativeDocument')} hint={t('representativeHint')} error={errors.representativeDocument?.message}>
        {(control) => <input {...control} type="text" {...register('representativeDocument')} className={INPUT_CLASS} />}
      </FormField>
    </>
  );
}

function ScanField({ state }: { readonly state: ConsentRecordFormState }): ReactNode {
  const t = useT('consent.staff');
  const { setValue, control, formState: { errors } } = state.form;
  const file: File | null = useWatch({ control, name: 'file' });
  const input = useRef<HTMLInputElement>(null);
  // After a successful record the form is reset: the browser keeps the old file name in the input unless it is cleared too.
  useEffect(() => {
    if (file === null && input.current !== null) input.current.value = '';
  }, [file]);
  return (
    <FormField id="consent-file" label={t('file')} hint={t('fileHint')} error={errors.file?.message}>
      {(controlProps) => (
        <input
          {...controlProps}
          ref={input}
          type="file"
          accept={CONSENT_SCAN_CONTENT_TYPES.join(',')}
          onChange={(event) => setValue('file', event.target.files?.[0] ?? null, { shouldValidate: state.form.formState.isSubmitted })}
          className={INPUT_CLASS}
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

function EntryFields({ state, role, patientId }: { readonly state: ConsentRecordFormState; readonly role: Role; readonly patientId: string }): ReactNode {
  const t = useT('consent.staff');
  const tType = useT('consent.view.consenterTypes');
  const { register, control, formState: { errors } } = state.form;
  const consenterType = useWatch({ control, name: 'consenterType' });
  return (
    <>
      <FormField id="consent-form-number" label={t('formNumber')} error={errors.formNumber?.message}>
        {(controlProps) => <input {...controlProps} type="text" aria-required="true" {...register('formNumber')} className={INPUT_CLASS} />}
      </FormField>
      <FormField id="consent-signed-at" label={t('signedAt')} error={errors.signedAt?.message}>
        {(controlProps) => <input {...controlProps} type="date" aria-required="true" {...register('signedAt')} className={INPUT_CLASS} />}
      </FormField>
      <FormField id="consent-status" label={t('entryStatus')}>
        {(controlProps) => (
          <select {...controlProps} {...register('status')} className={INPUT_CLASS}>
            <option value="active">{t('entryStatuses.active')}</option>
            <option value="rejected">{t('entryStatuses.rejected')}</option>
          </select>
        )}
      </FormField>
      <FormField id="consent-consenter" label={t('consenterType')}>
        {(controlProps) => (
          <select {...controlProps} {...register('consenterType')} className={INPUT_CLASS}>
            {CONSENTER_TYPES.map((type) => <option key={type} value={type}>{tType(type)}</option>)}
          </select>
        )}
      </FormField>
      {consenterType === 'self' ? null : <RepresentativeFields state={state} patientId={patientId} />}
      <SignerField state={state} role={role} />
      <ScanField state={state} />
    </>
  );
}

interface ConsentRecordFormProps {
  readonly patientId: string;
  /** ADMIN types the name of the clerk who handled the form; for a DOCTOR the server takes it from the token. */
  readonly role: Role;
}

/**
 * Records a paper consent or a written refusal (API 3.10 + 3.8, ADR-019): form number, signing date, who signed (for a
 * representative: the trusted person and the authority document) and the scan. The consent itself is never given here by
 * the patient; this form only enters what was signed on paper.
 */
export function ConsentRecordForm({ patientId, role }: ConsentRecordFormProps): ReactNode {
  const t = useT('consent.staff');
  const state: ConsentRecordFormState = useConsentRecordForm(patientId, role);
  return (
    <form onSubmit={state.submit} noValidate aria-labelledby="consent-record-title" className="mt-2">
      <h3 id="consent-record-title" className="text-base font-bold">{t('recordTitle')}</h3>
      <EntryFields state={state} role={role} patientId={patientId} />
      {state.isAlreadyActive ? <p role="alert" className="mt-3 rounded-card bg-warning-soft p-3 text-sm">{t('alreadyActive')}</p> : null}
      {state.problem !== null ? <div className="mt-3"><ProblemBanner problem={state.problem} /></div> : null}
      <Button type="submit" aria-disabled={state.isPending ? true : undefined} aria-busy={state.isPending} className="mt-4">
        {state.isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
