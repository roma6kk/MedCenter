'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/admin/shared/modal';
import { ConsentRequiredNotice } from '@/components/consent/consent-required-notice';
import { buttonVariants } from '@/components/ui/button-variants';
import { isApiError } from '@/lib/api/api-fetch';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { InlineProblem } from './inline-problem';
import { useOpenEncounter } from './use-doctor-mutations';

interface OpenEncounterButtonProps {
  readonly appointmentId: string;
  readonly patientId: string;
  /** Names the visit for assistive technology (`Open encounter: Kuznetsov, 09:00`). */
  readonly label: string;
  /** `lg` is the single call to action of the next-patient panel. */
  readonly size?: 'md' | 'lg';
  readonly fullWidth?: boolean;
}

/**
 * "Open encounter" of a booked appointment (BR-008): creates the encounter (API 7.1, idempotent) and goes to it.
 * The id of the Encounter — not of the appointment — is what `/encounters/[id]` needs.
 */
export function OpenEncounterButton({ appointmentId, patientId, label, size = 'md', fullWidth = false }: OpenEncounterButtonProps): ReactNode {
  const t = useT('doctor.journal');
  const tConsent = useT('consent.required');
  const router = useRouter();
  const open = useOpenEncounter();
  // ADR-019: no active consent. The dialog is its own state, not derived from the mutation: a new request (the emergency
  // one) resets the mutation, and the dialog must stay up through it.
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const send = (emergencyReason?: string): void => {
    open.mutate(
      { appointmentId, patientId, ...(emergencyReason === undefined ? {} : { emergencyReason }) },
      {
        onSuccess: (encounterId) => router.push(`/encounters/${encodeURIComponent(encounterId)}`),
        onError: (error) => {
          if (isApiError(error) && error.errorCode === 'CONSENT_REQUIRED') setIsDialogOpen(true);
        },
      },
    );
  };
  const closeDialog = (): void => {
    setIsDialogOpen(false);
    open.reset();
  };

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2', fullWidth && 'flex w-full')}>
      <button
        type="button"
        onClick={() => send()}
        disabled={open.isPending}
        aria-label={t('openFor', { label })}
        className={cn(buttonVariants({ variant: 'primary', size }), fullWidth && 'w-full')}
      >
        {open.isPending ? t('opening') : t('open')}
      </button>
      {open.isError && !isDialogOpen ? <InlineProblem error={open.error} overrides={{ ENCOUNTER_STATE_INVALID: t('alreadyCompleted') }} /> : null}
      {isDialogOpen ? (
        <Modal title={tConsent('title')} onClose={closeDialog}>
          <div className="mt-3"><ConsentRequiredNotice action="open" patientId={patientId} isPending={open.isPending} onEmergency={send} /></div>
          {open.isError && !(isApiError(open.error) && open.error.errorCode === 'CONSENT_REQUIRED') ? <div className="mt-3"><InlineProblem error={open.error} /></div> : null}
        </Modal>
      ) : null}
    </span>
  );
}
