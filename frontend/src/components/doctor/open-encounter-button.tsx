'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button-variants';
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
  const router = useRouter();
  const open = useOpenEncounter();
  const handleClick = (): void => {
    open.mutate({ appointmentId, patientId }, { onSuccess: (encounterId) => router.push(`/encounters/${encodeURIComponent(encounterId)}`) });
  };

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2', fullWidth && 'flex w-full')}>
      <button
        type="button"
        onClick={handleClick}
        disabled={open.isPending}
        aria-label={t('openFor', { label })}
        className={cn(buttonVariants({ variant: 'primary', size }), fullWidth && 'w-full')}
      >
        {open.isPending ? t('opening') : t('open')}
      </button>
      {open.isError ? <InlineProblem error={open.error} overrides={{ ENCOUNTER_STATE_INVALID: t('alreadyCompleted') }} /> : null}
    </span>
  );
}
