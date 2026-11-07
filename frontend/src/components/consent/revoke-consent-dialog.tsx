'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { isApiError } from '@/lib/api/api-fetch';
import { useT } from '@/lib/i18n/use-t';
import { useRevokeMyConsent } from './use-consent';

interface RevokeConsentDialogProps {
  // Must keep its identity between renders: the focus trap restarts when it changes.
  readonly onClose: () => void;
}

function useCloseUnlessPending(pending: boolean, onClose: () => void): () => void {
  const isPending = useRef(pending);
  useEffect(() => {
    isPending.current = pending;
  }, [pending]);
  return useCallback(() => {
    if (!isPending.current) onClose();
  }, [onClose]);
}

export function RevokeConsentDialog({ onClose }: RevokeConsentDialogProps): ReactNode {
  const t = useT('consent.mine');
  const revoke = useRevokeMyConsent();
  const close: () => void = useCloseUnlessPending(revoke.isPending, onClose);
  const confirm = (): void => {
    if (revoke.isPending) return;
    revoke.mutate(undefined, { onSuccess: onClose });
  };
  const footer: ReactNode = (
    <>
      {/* aria-disabled, not disabled: a control that loses the focus to the body would let Tab walk out of the dialog. */}
      <Button variant="secondary" aria-disabled={revoke.isPending} onClick={close}>{t('dialogKeep')}</Button>
      <Button variant="destructive" aria-disabled={revoke.isPending} onClick={confirm}>{revoke.isPending ? t('dialogBusy') : t('dialogConfirm')}</Button>
    </>
  );
  return (
    <Dialog title={t('dialogTitle')} description={t('dialogBody')} size="sm" onClose={close} footer={footer}>
      {revoke.isError && isApiError(revoke.error) ? <div className="mt-3"><ProblemBanner problem={revoke.error.problem} /></div> : null}
    </Dialog>
  );
}
