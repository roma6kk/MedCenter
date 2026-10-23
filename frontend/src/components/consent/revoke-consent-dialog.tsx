'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { isApiError } from '@/lib/api/api-fetch';
import { useDialogFocus } from '@/hooks/use-dialog-focus';
import { useT } from '@/lib/i18n/use-t';
import { useRevokeMyConsent } from './use-consent';

interface RevokeConsentDialogProps {
  /** Must keep its identity between renders (`useCallback`): the focus trap restarts when it changes. */
  readonly onClose: () => void;
}

/** "Keep" and Escape do nothing while the request is in flight: the consent would be revoked after the dialog was dismissed. */
function useCloseUnlessPending(pending: boolean, onClose: () => void): () => void {
  const isPending = useRef(pending);
  useEffect(() => {
    isPending.current = pending;
  }, [pending]);
  return useCallback(() => {
    if (!isPending.current) onClose();
  }, [onClose]);
}

/**
 * Confirmation of the patient's own revocation (API 3.6, design §3): says what it does (new entries stop, nothing is
 * deleted) and that the clinic needs a written application as well. The status refreshes through the mutation's
 * invalidation; the dialog closes once the answer is in.
 */
export function RevokeConsentDialog({ onClose }: RevokeConsentDialogProps): ReactNode {
  const t = useT('consent.mine');
  const titleId: string = useId();
  const bodyId: string = useId();
  const revoke = useRevokeMyConsent();
  const close: () => void = useCloseUnlessPending(revoke.isPending, onClose);
  const dialogRef = useDialogFocus<HTMLDivElement>(true, close);
  const confirm = (): void => {
    if (revoke.isPending) return;
    revoke.mutate(undefined, { onSuccess: onClose });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse/40 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} className="max-h-full w-full max-w-md overflow-y-auto rounded-panel border border-border bg-card p-6">
        <h2 id={titleId} className="text-lg font-bold">{t('dialogTitle')}</h2>
        <p id={bodyId} className="mt-2 text-sm text-muted-foreground">{t('dialogBody')}</p>
        {revoke.isError && isApiError(revoke.error) ? <div className="mt-3"><ProblemBanner problem={revoke.error.problem} /></div> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {/* aria-disabled, not disabled: a control that loses the focus to the body would let Tab walk out of the dialog. */}
          <Button variant="danger" aria-disabled={revoke.isPending} onClick={confirm}>{revoke.isPending ? t('dialogBusy') : t('dialogConfirm')}</Button>
          <Button variant="secondary" aria-disabled={revoke.isPending} onClick={close}>{t('dialogKeep')}</Button>
        </div>
      </div>
    </div>
  );
}
