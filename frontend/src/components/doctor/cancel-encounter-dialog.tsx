'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/use-t';
import { InlineProblem } from './inline-problem';
import { useCancelEncounter } from './use-doctor-mutations';

interface CancelEncounterDialogProps {
  readonly encounterId: string;
  readonly appointmentId: string;
  readonly onDiscardDraft: () => void;
  readonly onClose: () => void;
}

export function CancelEncounterDialog({ encounterId, appointmentId, onDiscardDraft, onClose }: CancelEncounterDialogProps): ReactNode {
  const t = useT('doctor.encounter');
  const tCommon = useT('common');
  const router = useRouter();
  const cancel = useCancelEncounter(encounterId, appointmentId, () => {
    onDiscardDraft();
    router.push('/doctor/appointments');
  });
  const close = (): void => (cancel.isPending ? undefined : onClose());
  return (
    <Dialog
      title={t('cancelTitle')}
      description={t('cancelBody')}
      size="sm"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" aria-disabled={cancel.isPending} onClick={close}>{t('cancelKeep')}</Button>
          <Button variant="destructive" aria-disabled={cancel.isPending} onClick={() => (cancel.isPending ? undefined : cancel.mutate())}>
            {cancel.isPending ? tCommon('loading') : t('cancel')}
          </Button>
        </>
      }
    >
      {cancel.isError ? <p className="mt-3"><InlineProblem error={cancel.error} /></p> : null}
    </Dialog>
  );
}
