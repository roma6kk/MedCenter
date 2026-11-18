'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { FormField, INPUT_CLASS } from '@/components/patient/form-field';
import { closeMyAccount } from '@/components/patient/patient-api';
import { useCloseUnlessPending } from '@/components/patient/use-close-unless-pending';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { isApiError } from '@/lib/api/api-fetch';
import { endClosedAccountSession } from '@/lib/auth/session-client';
import { useT } from '@/lib/i18n/use-t';
import { ClosureNotice } from './closure-notice';

const FORM_ID = 'delete-account-form';
const WRONG_PASSWORD_STATUS = 403;

interface DeleteAccountDialogProps {
  // Must keep its identity between renders: the focus trap restarts when it changes.
  readonly onClose: () => void;
}

export function DeleteAccountDialog({ onClose }: DeleteAccountDialogProps): ReactNode {
  const t = useT('accountClosure');
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState(false);
  const close = useMutation({
    mutationFn: (value: string) => closeMyAccount(value),
    onSuccess: () => endClosedAccountSession(),
  });
  const dismiss: () => void = useCloseUnlessPending(close.isPending, onClose);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (close.isPending) return;
    setMissing(password === '');
    if (password !== '') close.mutate(password);
  };
  const wrongPassword: boolean = close.isError && isApiError(close.error) && close.error.status === WRONG_PASSWORD_STATUS;
  const footer: ReactNode = (
    <>
      <Button variant="secondary" aria-disabled={close.isPending} onClick={dismiss}>{t('keep')}</Button>
      <Button type="submit" form={FORM_ID} variant="destructive" aria-disabled={close.isPending}>{close.isPending ? t('busy') : t('confirm')}</Button>
    </>
  );
  return (
    <Dialog title={t('dialogTitle')} size="sm" onClose={dismiss} footer={footer}>
      <ClosureNotice headingLevel="h3" showRemoved />
      <form id={FORM_ID} noValidate onSubmit={submit} className="mt-4">
        <FormField
          id="delete-account-password"
          label={t('passwordLabel')}
          hint={t('passwordHint')}
          error={missing ? t('passwordRequired') : wrongPassword ? t('wrongPassword') : undefined}
        >
          {(control) => (
            <input
              {...control}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={INPUT_CLASS}
            />
          )}
        </FormField>
      </form>
      {close.isError && isApiError(close.error) && !wrongPassword ? <div className="mt-3"><ProblemBanner problem={close.error.problem} /></div> : null}
    </Dialog>
  );
}
