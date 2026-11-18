'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useRetryCooldown } from '@/lib/api/use-retry-cooldown';
import { useT } from '@/lib/i18n/use-t';
import { AdminProblem } from './admin-problem';
import { Button } from '@/components/ui/button';
import { SECONDARY_BUTTON_CLASS } from './admin-styles';
import { Dialog } from '@/components/ui/dialog';
import { problemOf } from './problem-of';

interface ConfirmDialogProps {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly isPending: boolean;
  readonly error?: unknown;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly children?: ReactNode;
}

/** The safe choice takes the focus, even when the dialog has options (a checkbox) in front of the buttons: Enter must not confirm a deletion. */
function useSafeChoiceFocus(): RefObject<HTMLButtonElement> {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return ref;
}

export function ConfirmDialog({ title, message, confirmLabel, isPending, error, onConfirm, onCancel, children }: ConfirmDialogProps): ReactNode {
  const t = useT('common');
  const tProblem = useT('feedback.problem');
  const cooldown: number = useRetryCooldown(problemOf(error));
  const isBlocked: boolean = isPending || cooldown > 0;
  const cancelRef = useSafeChoiceFocus();
  const handleConfirm = (): void => {
    if (!isBlocked) onConfirm();
  };
  const label: string = isPending ? t('loading') : cooldown > 0 ? tProblem('retryAfter', { seconds: cooldown }) : confirmLabel;
  const footer: ReactNode = (
    <>
      <button ref={cancelRef} type="button" onClick={onCancel} className={SECONDARY_BUTTON_CLASS}>
        {t('cancel')}
      </button>
      <Button variant="destructive" onClick={handleConfirm} aria-disabled={isBlocked || undefined}>
        {label}
      </Button>
    </>
  );
  return (
    <Dialog title={title} description={message} onClose={onCancel} size="sm" footer={footer}>
      {children}
      {error === undefined || error === null ? null : (
        <div className="mt-3">
          <AdminProblem error={error} />
        </div>
      )}
    </Dialog>
  );
}
