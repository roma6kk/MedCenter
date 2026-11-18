'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { FormField, INPUT_CLASS } from '@/components/patient/form-field';
import { changeMyPassword } from '@/components/patient/patient-api';
import { useCloseUnlessPending } from '@/components/patient/use-close-unless-pending';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { isApiError } from '@/lib/api/api-fetch';
import { endRevokedSession } from '@/lib/auth/session-client';
import { PASSWORD_MAX, PASSWORD_MIN, PASSWORD_PATTERN } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';

const FORM_ID = 'change-password-form';
const WRONG_PASSWORD_STATUS = 403;

interface ChangePasswordDialogProps {
  // Must keep its identity between renders: the focus trap restarts when it changes.
  readonly onClose: () => void;
}

export function ChangePasswordDialog({ onClose }: ChangePasswordDialogProps): ReactNode {
  const t = useT('passwordChange');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const change = useMutation({
    mutationFn: () => changeMyPassword(current, next),
    // The server closed every session, this one included.
    onSuccess: () => endRevokedSession(),
  });
  const dismiss: () => void = useCloseUnlessPending(change.isPending, onClose);
  const weak: boolean = next.length < PASSWORD_MIN || next.length > PASSWORD_MAX || !PASSWORD_PATTERN.test(next);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (change.isPending) return;
    setSubmitted(true);
    if (current !== '' && !weak) change.mutate();
  };
  const wrongPassword: boolean = change.isError && isApiError(change.error) && change.error.status === WRONG_PASSWORD_STATUS;
  const footer: ReactNode = (
    <>
      <Button variant="secondary" aria-disabled={change.isPending} onClick={dismiss}>{t('cancel')}</Button>
      <Button type="submit" form={FORM_ID} aria-disabled={change.isPending}>{change.isPending ? t('busy') : t('confirm')}</Button>
    </>
  );
  return (
    <Dialog title={t('dialogTitle')} size="sm" onClose={dismiss} footer={footer}>
      <p className="text-sm">{t('lead')}</p>
      <form id={FORM_ID} noValidate onSubmit={submit} className="mt-4">
        <FormField id="change-password-current" label={t('currentLabel')} error={submitted && current === '' ? t('currentRequired') : wrongPassword ? t('wrongPassword') : undefined}>
          {(control) => <input {...control} type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} className={INPUT_CLASS} />}
        </FormField>
        <FormField id="change-password-new" label={t('newLabel')} hint={t('newHint')} error={submitted && weak ? 'validation.passwordStrength' : undefined}>
          {(control) => <input {...control} type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} className={INPUT_CLASS} />}
        </FormField>
      </form>
      {change.isError && isApiError(change.error) && !wrongPassword ? <div className="mt-3"><ProblemBanner problem={change.error.problem} /></div> : null}
    </Dialog>
  );
}
