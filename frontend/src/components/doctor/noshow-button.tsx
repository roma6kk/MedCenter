'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { InlineProblem } from './inline-problem';
import { useNoshow } from './use-doctor-mutations';

interface NoshowButtonProps {
  readonly appointmentId: string;
  /** Names the patient for assistive technology, so the same "No-show" button in every row is distinguishable. */
  readonly patientName?: string;
  readonly className?: string;
}

const BUTTON_CLASS = buttonVariants({ variant: 'secondary' });

interface FocusHandoff {
  readonly triggerRef: RefObject<HTMLButtonElement>;
  readonly confirmRef: RefObject<HTMLButtonElement>;
  /** Closes the confirmation and gives focus back to the trigger. */
  readonly dismiss: () => void;
}

/**
 * The pressed button disappears with the swap between "No-show" and its confirmation, so focus is moved on purpose: into
 * the confirmation when it opens, back to "No-show" when it is dismissed (a keyboard user would otherwise land on the page top).
 */
function useFocusHandoff(isConfirming: boolean, setIsConfirming: (isConfirming: boolean) => void): FocusHandoff {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const isReturningFocus = useRef(false);
  useEffect(() => {
    if (isConfirming) {
      confirmRef.current?.focus();
    } else if (isReturningFocus.current) {
      isReturningFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [isConfirming]);
  const dismiss = (): void => {
    isReturningFocus.current = true;
    setIsConfirming(false);
  };
  return { triggerRef, confirmRef, dismiss };
}

/** Marks the element a row keeps focus on once its actions are gone (the journal puts it on the patient link). */
const ROW_ANCHOR_SELECTOR = '[data-row-anchor]';

/** The anchor of the table row or card that holds `from`: the nearest ancestor that contains one is the row itself. */
function rowAnchorOf(from: HTMLElement | null): HTMLElement | null {
  for (let node: HTMLElement | null = from?.parentElement ?? null; node !== null; node = node.parentElement) {
    const anchor: HTMLElement | null = node.querySelector<HTMLElement>(ROW_ANCHOR_SELECTOR);
    if (anchor !== null) return anchor;
  }
  return null;
}

interface ConfirmationProps {
  readonly appointmentId: string;
  readonly confirmRef: RefObject<HTMLButtonElement>;
  readonly onDismiss: () => void;
  readonly onDone: () => void;
}

/** The second step: confirm or back out (Escape too). The service's refusal is spelled out next to the buttons. */
function NoshowConfirmation({ appointmentId, confirmRef, onDismiss, onDone }: ConfirmationProps): ReactNode {
  const t = useT('doctor.noshow');
  const noshow = useNoshow(() => rowAnchorOf(confirmRef.current)?.focus());
  return (
    <span
      role="group"
      aria-label={t('confirmGroup')}
      onKeyDown={(event) => (event.key === 'Escape' && !noshow.isPending ? onDismiss() : undefined)}
      className="inline-flex flex-wrap items-center gap-2"
    >
      <button
        ref={confirmRef}
        type="button"
        onClick={() => noshow.mutate(appointmentId, { onSuccess: onDone })}
        disabled={noshow.isPending}
        className={cn(BUTTON_CLASS, 'border-destructive text-destructive')}
      >
        {t('confirm')}
      </button>
      <button type="button" onClick={onDismiss} disabled={noshow.isPending} className="min-h-[44px] px-2 text-sm underline disabled:opacity-50">
        {t('cancel')}
      </button>
      {noshow.isError ? <InlineProblem error={noshow.error} overrides={{ CONFLICT: t('notBooked'), ENCOUNTER_STATE_INVALID: t('hasEncounter') }} /> : null}
    </span>
  );
}

/** Marks a booked appointment as a no-show (API 6.6). Two steps: a confirm before the POST, so a stray click costs nothing. */
export function NoshowButton({ appointmentId, patientName, className }: NoshowButtonProps): ReactNode {
  const t = useT('doctor.noshow');
  const [isConfirming, setIsConfirming] = useState(false);
  const { triggerRef, confirmRef, dismiss } = useFocusHandoff(isConfirming, setIsConfirming);

  if (isConfirming) return <NoshowConfirmation appointmentId={appointmentId} confirmRef={confirmRef} onDismiss={dismiss} onDone={() => setIsConfirming(false)} />;
  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setIsConfirming(true)}
      aria-label={patientName ? t('markFor', { name: patientName }) : undefined}
      className={cn(BUTTON_CLASS, 'text-warning', className)}
    >
      {t('button')}
    </button>
  );
}
