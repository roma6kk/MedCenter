'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { Button } from '@/components/ui/button';
import { FormField, INPUT_CLASS } from '@/components/patient/form-field';
import { isApiError } from '@/lib/api/api-fetch';
import { applyProblemToForm } from '@/lib/api/field-errors';
import type { ProblemDetails } from '@/lib/api/problem';
import { CONSENT_FORM_NUMBER_MAX } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { useRevokePatientConsent } from './use-consent';

const schema = z.object({
  applicationNumber: z.string().trim().min(1, { message: 'validation.required' }).max(CONSENT_FORM_NUMBER_MAX, { message: 'validation.tooLong' }),
});
type Values = z.infer<typeof schema>;

/**
 * Records the written revocation of a patient's consent (API 3.9) by its application number. The revocation blocks new
 * entries at once and deletes nothing. A 404 means there is no active consent left to revoke (it was revoked elsewhere).
 */
export function ConsentRevokeForm({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('consent.staff');
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { applicationNumber: '' } });
  const revoke = useRevokePatientConsent(patientId);
  const [isGone, setIsGone] = useState(false);
  const [problem, setProblem] = useState<ProblemDetails | null>(null);
  const submit = form.handleSubmit(({ applicationNumber }) => {
    if (revoke.isPending) return;
    setIsGone(false);
    setProblem(null);
    revoke.mutate(
      { applicationNumber },
      {
        onSuccess: () => form.reset(),
        onError: (error) => {
          if (!isApiError(error)) return;
          if (error.errorCode === 'NOT_FOUND') setIsGone(true);
          else if (error.errorCode === 'VALIDATION_ERROR' && applyProblemToForm(error.problem, form.setError, ['applicationNumber']).length === 0) return;
          else setProblem(error.problem);
        },
      },
    );
  });
  return (
    <form onSubmit={(event) => void submit(event)} noValidate aria-labelledby="consent-revoke-title" className="mt-2">
      <h3 id="consent-revoke-title" className="text-base font-bold">{t('revokeTitle')}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t('revokeLead')}</p>
      <FormField id="consent-application" label={t('applicationNumber')} error={form.formState.errors.applicationNumber?.message}>
        {(control) => <input {...control} type="text" aria-required="true" {...form.register('applicationNumber')} className={INPUT_CLASS} />}
      </FormField>
      {isGone ? <p role="alert" className="mt-3 rounded-card bg-warning-soft p-3 text-sm">{t('nothingToRevoke')}</p> : null}
      {problem !== null ? <div className="mt-3"><ProblemBanner problem={problem} /></div> : null}
      <Button type="submit" variant="danger" aria-disabled={revoke.isPending ? true : undefined} aria-busy={revoke.isPending} className="mt-3">
        {revoke.isPending ? t('revoking') : t('revokeSubmit')}
      </Button>
    </form>
  );
}
