'use client';

import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMyConsent } from '@/components/consent/use-consent';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { FormField, INPUT_CLASS } from '@/components/patient/form-field';
import { useRetryCooldown } from '@/lib/api/use-retry-cooldown';
import { useT } from '@/lib/i18n/use-t';
import type { BookingDraft, BookingStep } from '@/store/use-booking-draft-store';
import { reasonProblem } from './book-appointment';
import { BookingSummary } from './booking-summary';
import type { BookingSubmit } from './use-booking-submit';

interface ConfirmStepProps {
  readonly draft: Pick<BookingDraft, 'serviceId' | 'doctorId' | 'slotStart' | 'slotEnd' | 'reason'>;
  readonly onReasonChange: (reason: string) => void;
  /** «Изменить» of a summary row: back to the step that made the choice. */
  readonly onEdit: (step: BookingStep) => void;
  readonly booking: Pick<BookingSubmit, 'submit' | 'isPending' | 'problem' | 'reasonError'>;
}

function useReasonField(reason: string, serverError: string | null): { readonly error: string | undefined; readonly touch: () => void } {
  const t = useT('booking');
  const [touched, setTouched] = useState(false);
  const local = reasonProblem(reason);
  const localText: string | undefined = touched && local !== null ? t(local === 'tooShort' ? 'reasonTooShort' : 'reasonTooLong') : undefined;
  return { error: localText ?? serverError ?? undefined, touch: () => setTouched(true) };
}

interface ReasonFieldProps {
  readonly value: string;
  readonly error: string | undefined;
  readonly inputRef: RefObject<HTMLTextAreaElement>;
  readonly onChange: (reason: string) => void;
  readonly onBlur: () => void;
  /** No active consent to the electronic record: the free text about health cannot be taken (6.1, ADR-019). */
  readonly disabled: boolean;
}

function ReasonField({ value, error, inputRef, onChange, onBlur, disabled }: ReasonFieldProps): ReactNode {
  const t = useT('booking');
  return (
    <FormField id="booking-reason" label={t('reasonLabel')} hint={disabled ? t('reasonNoConsent') : t('reasonHint')} error={error}>
      {(control) => (
        <textarea {...control} ref={inputRef} rows={3} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} className={INPUT_CLASS} />
      )}
    </FormField>
  );
}

interface ConfirmButtonProps {
  readonly isPending: boolean;
  /** Seconds the server asked to wait (429 `Retry-After`); `0` when sending is allowed. */
  readonly cooldown: number;
  readonly onConfirm: () => void;
}

/**
 * Closed with `aria-disabled`, not `disabled`, while the request runs or a 429 asks to wait: the pressed button keeps the
 * keyboard focus (a `disabled` one drops it in some browsers) and a repeated press does nothing.
 */
function ConfirmButton({ isPending, cooldown, onConfirm }: ConfirmButtonProps): ReactNode {
  const t = useT('booking');
  const closed: boolean = isPending || cooldown > 0;
  return (
    // A bar fixed to the bottom of a phone screen; from `md` it is an ordinary block inside the summary panel. Nothing above it
    // is transformed (the step animation lives on the other column), so `fixed` is relative to the viewport.
    <div className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card p-4 shadow-elev-3 md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none">
      <Button
        size="lg"
        onClick={() => (closed ? undefined : onConfirm())}
        aria-disabled={closed ? true : undefined}
        aria-busy={isPending}
        data-testid="booking-confirm"
        className="w-full"
      >
        {isPending ? t('submitting') : cooldown > 0 ? t('retryIn', { seconds: cooldown }) : t('confirm')}
      </Button>
    </div>
  );
}

/**
 * Step 4: an optional reason (3…500) beside the summary panel «Ваша запись» (rows with «Изменить», the clinic's address, the
 * cancellation hint) that holds the button which sends the booking. It returns the two columns of the wizard's row. On a
 * wide screen the place of the error line under the reason is kept free: the line appears when the field loses focus on
 * the mouse press, and a button that moved away in between would miss the click that follows.
 */
export function ConfirmStep({ draft, onReasonChange, onEdit, booking }: ConfirmStepProps): ReactNode {
  const t = useT('booking');
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const field = useReasonField(draft.reason, booking.reasonError);
  const cooldown: number = useRetryCooldown(booking.problem);
  // Only a known "no consent" closes the field; a consent that cannot be read leaves it open and the server decides.
  const consent = useMyConsent();
  const noConsent: boolean = consent.data !== undefined && consent.data.active === null;
  // A reason typed before the answer arrived (or kept in the draft) must not go out: the server would refuse or drop it.
  useEffect(() => {
    if (noConsent && draft.reason !== '') onReasonChange('');
  }, [noConsent, draft.reason, onReasonChange]);
  const handleConfirm = (): void => {
    field.touch();
    if (!noConsent && reasonProblem(draft.reason) !== null) reasonRef.current?.focus();
    else booking.submit();
  };
  return (
    <>
      <div className="min-w-0 flex-[999_1_480px]">
        <h2 className="text-xl font-bold">{t('confirmTitle')}</h2>
        <div className={field.error === undefined ? 'mt-4 md:pb-6' : 'mt-4'}>
          <ReasonField value={draft.reason} error={field.error} inputRef={reasonRef} onChange={onReasonChange} onBlur={field.touch} disabled={noConsent} />
        </div>
        {booking.problem === null ? null : <div className="mt-4"><ProblemBanner problem={booking.problem} /></div>}
      </div>
      {/* The bar of the confirm button is fixed to the screen bottom on a phone: leave room under the panel so it covers nothing. */}
      <aside className="min-w-0 flex-[1_1_320px] pb-24 md:pb-0">
        <BookingSummary
          draft={{ ...draft, step: 4 }}
          onEdit={onEdit}
          showPlace
          action={<ConfirmButton isPending={booking.isPending} cooldown={cooldown} onConfirm={handleConfirm} />}
        />
      </aside>
    </>
  );
}
