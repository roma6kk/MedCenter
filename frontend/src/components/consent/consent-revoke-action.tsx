'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { CircleX } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField, INPUT_CLASS } from '@/components/patient/form-field';
import { useCloseUnlessPending } from '@/components/patient/use-close-unless-pending';
import { FIELD_NARROW_CLASS } from '@/components/ui/field-styles';
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

function RevokeDialog({ patientId, onClose }: { readonly patientId: string; readonly onClose: () => void }): ReactNode {
  const t = useT('consent.staff');
  const formId: string = useId();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { applicationNumber: '' } });
  const revoke = useRevokePatientConsent(patientId);
  const [isGone, setIsGone] = useState(false);
  const [problem, setProblem] = useState<ProblemDetails | null>(null);
  const close = useCloseUnlessPending(revoke.isPending, onClose);
  const submit = form.handleSubmit(({ applicationNumber }) => {
    if (revoke.isPending) return;
    setIsGone(false);
    setProblem(null);
    revoke.mutate(
      { applicationNumber },
      {
        onSuccess: onClose,
        onError: (error) => {
          if (!isApiError(error)) return;
          if (error.errorCode === 'NOT_FOUND') setIsGone(true);
          else if (error.errorCode === 'VALIDATION_ERROR' && applyProblemToForm(error.problem, form.setError, ['applicationNumber']).length === 0) return;
          else setProblem(error.problem);
        },
      },
    );
  });
  const footer: ReactNode = (
    <>
      {/* aria-disabled, not disabled: a control that loses the focus to the body would let Tab walk out of the dialog. */}
      <Button variant="secondary" aria-disabled={revoke.isPending ? true : undefined} onClick={close}>{t('revokeCancel')}</Button>
      <Button type="submit" form={formId} variant="destructive" aria-disabled={revoke.isPending ? true : undefined} aria-busy={revoke.isPending}>
        {revoke.isPending ? t('revoking') : t('revokeSubmit')}
      </Button>
    </>
  );
  return (
    <Dialog title={t('revokeTitle')} description={t('revokeLead')} size="sm" onClose={close} footer={footer}>
      <form id={formId} onSubmit={(event) => void submit(event)} noValidate className="mt-2">
        <FormField id="consent-application" label={t('applicationNumber')} error={form.formState.errors.applicationNumber?.message}>
          {(control) => <input {...control} type="text" aria-required="true" {...form.register('applicationNumber')} className={`${INPUT_CLASS} ${FIELD_NARROW_CLASS}`} />}
        </FormField>
        {isGone ? <p role="alert" className="mt-3 rounded-card bg-warning-soft p-3 text-sm">{t('nothingToRevoke')}</p> : null}
        {problem !== null ? <div className="mt-3"><ProblemBanner problem={problem} /></div> : null}
      </form>
    </Dialog>
  );
}

export function ConsentRevokeAction({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('consent.staff');
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button variant="quiet-danger" onClick={() => setIsOpen(true)} className="-ml-4">
        <CircleX aria-hidden="true" className="size-4" />
        {t('revokeOpen')}
      </Button>
      {isOpen ? <RevokeDialog patientId={patientId} onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}
