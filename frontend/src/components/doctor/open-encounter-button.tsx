'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ConsentRequiredNotice } from '@/components/consent/consent-required-notice';
import { buttonVariants } from '@/components/ui/button-variants';
import { isApiError } from '@/lib/api/api-fetch';
import { clinicDayOf, formatClinicTime, formatDateKey } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { InlineProblem } from './inline-problem';
import { rememberStartedEncounter, startedEncounterOf } from './started-encounters';
import { useMinskToday } from './use-minsk-today';
import { useOpenEncounter } from './use-doctor-mutations';

interface OpenEncounterButtonProps {
  readonly appointmentId: string;
  readonly patientId: string;
  /** RFC 3339 start of the appointment: an appointment that is not today is not started without a confirmation (A4). */
  readonly start: string;
  /** Names the visit for assistive technology (`Open encounter: Kuznetsov, 09:00`). */
  readonly label: string;
  /** `lg` is the single call to action of the next-patient panel. */
  readonly size?: 'md' | 'lg';
  readonly fullWidth?: boolean;
}

/** Whether this browser already opened the appointment's encounter; read after mount because storage does not exist while the page is rendered on the server. */
function useStartedEncounter(appointmentId: string): boolean {
  const [isStarted, setIsStarted] = useState(false);
  useEffect(() => setIsStarted(startedEncounterOf(appointmentId) !== null), [appointmentId]);
  return isStarted;
}

/**
 * "Open encounter" of a booked appointment (BR-008): creates the encounter (API 7.1, idempotent) and goes to it.
 * The id of the Encounter — not of the appointment — is what `/encounters/[id]` needs.
 * Starting a visit is a clinical act, so an appointment that is not today asks first (A4); one the doctor has already
 * started reads «Продолжить приём» and goes straight back in.
 */
export function OpenEncounterButton({ appointmentId, patientId, start, label, size = 'md', fullWidth = false }: OpenEncounterButtonProps): ReactNode {
  const t = useT('doctor.journal');
  const tConsent = useT('consent.required');
  const router = useRouter();
  const open = useOpenEncounter();
  const today: string = useMinskToday();
  const isContinuing: boolean = useStartedEncounter(appointmentId);
  // ADR-019: no active consent. The dialog is its own state, not derived from the mutation: a new request (the emergency
  // one) resets the mutation, and the dialog must stay up through it.
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const send = (emergencyReason?: string): void => {
    open.mutate(
      { appointmentId, patientId, ...(emergencyReason === undefined ? {} : { emergencyReason }) },
      {
        onSuccess: (encounterId) => {
          rememberStartedEncounter(appointmentId, encounterId);
          router.push(`/encounters/${encodeURIComponent(encounterId)}`);
        },
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
  const day: string = clinicDayOf(start);
  const needsConfirmation: boolean = !isContinuing && day !== '' && day !== today;
  const press = (): void => (needsConfirmation ? setIsConfirmOpen(true) : send());
  const confirm = (): void => {
    setIsConfirmOpen(false);
    send();
  };

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2', fullWidth && 'flex w-full')}>
      <button
        type="button"
        onClick={press}
        disabled={open.isPending}
        aria-label={t(isContinuing ? 'continueFor' : 'openFor', { label })}
        className={cn(buttonVariants({ variant: 'primary', size }), fullWidth && 'w-full')}
      >
        {open.isPending ? t('opening') : t(isContinuing ? 'continue' : 'open')}
      </button>
      {open.isError && !isDialogOpen ? <InlineProblem error={open.error} overrides={{ ENCOUNTER_STATE_INVALID: t('alreadyCompleted') }} /> : null}
      {isConfirmOpen ? (
        <Dialog
          title={t('notTodayTitle')}
          description={t('notTodayBody', { date: formatDateKey(day, 'numeric'), time: formatClinicTime(start) })}
          size="sm"
          onClose={() => setIsConfirmOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsConfirmOpen(false)}>{t('notTodayCancel')}</Button>
              <Button onClick={confirm}>{t('notTodayConfirm')}</Button>
            </>
          }
        />
      ) : null}
      {isDialogOpen ? (
        <Dialog title={tConsent('title')} onClose={closeDialog}>
          <div className="mt-3"><ConsentRequiredNotice action="open" patientId={patientId} isPending={open.isPending} onEmergency={send} /></div>
          {open.isError && !(isApiError(open.error) && open.error.errorCode === 'CONSENT_REQUIRED') ? <div className="mt-3"><InlineProblem error={open.error} /></div> : null}
        </Dialog>
      ) : null}
    </span>
  );
}
