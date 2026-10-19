'use client';

import type { ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
import { useDoctor, useService } from '@/components/catalog/use-catalog';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { FormField, INPUT_CLASS } from '@/components/patient/form-field';
import { useRetryCooldown } from '@/lib/api/use-retry-cooldown';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import type { BookingDraft } from '@/store/use-booking-draft-store';
import { reasonProblem } from './book-appointment';
import { formatSlotDateTime, slotDurationMin } from './slot-time';
import type { BookingSubmit } from './use-booking-submit';

interface ConfirmStepProps {
  readonly draft: Pick<BookingDraft, 'serviceId' | 'doctorId' | 'slotStart' | 'slotEnd' | 'reason'>;
  readonly onReasonChange: (reason: string) => void;
  readonly booking: Pick<BookingSubmit, 'submit' | 'isPending' | 'problem' | 'reasonError'>;
}

function SummaryRow({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col gap-0.5 border-b border-[var(--border)] py-2 sm:flex-row sm:gap-4">
      <dt className="form-label w-36 flex-none pt-0.5">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Summary({ draft }: Pick<ConfirmStepProps, 'draft'>): ReactNode {
  const t = useT('booking');
  const locale = useUiStore((state) => state.locale);
  const doctor = useDoctor(draft.doctorId);
  const service = useService(draft.serviceId);
  const start: string | null = draft.slotStart;
  const minutes: number = start === null || draft.slotEnd === null ? 0 : slotDurationMin({ start, end: draft.slotEnd });
  return (
    <dl data-testid="booking-summary">
      <SummaryRow label={t('summaryService')}>{draft.serviceId === null ? t('serviceBySchedule') : (service.data?.name ?? '…')}</SummaryRow>
      <SummaryRow label={t('summaryDoctor')}>
        {doctor.data?.name ?? '…'}
        {doctor.data?.specialty === undefined ? null : <span className="text-[var(--muted-foreground)]"> · {doctor.data.specialty}</span>}
      </SummaryRow>
      <SummaryRow label={t('summaryTime')}><span className="mono">{start === null ? '' : formatSlotDateTime(start, locale)}</span></SummaryRow>
      {minutes > 0 ? <SummaryRow label={t('summaryDuration')}>{t('slotMinutes', { minutes })}</SummaryRow> : null}
    </dl>
  );
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
}

function ReasonField({ value, error, inputRef, onChange, onBlur }: ReasonFieldProps): ReactNode {
  const t = useT('booking');
  return (
    <FormField id="booking-reason" label={t('reasonLabel')} hint={t('reasonHint')} error={error}>
      {(control) => (
        <textarea {...control} ref={inputRef} rows={3} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} className={INPUT_CLASS} />
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
    <div className="no-print sticky bottom-0 -mx-4 mt-4 border-t border-[var(--border)] bg-[var(--background)] p-4 md:static md:mx-0 md:border-0 md:p-0">
      <button
        type="button"
        onClick={() => (closed ? undefined : onConfirm())}
        aria-disabled={closed ? true : undefined}
        aria-busy={isPending}
        data-testid="booking-confirm"
        className="min-h-[44px] w-full rounded-[6px] bg-[var(--primary)] px-6 py-2 text-[var(--primary-foreground)] aria-disabled:cursor-not-allowed aria-disabled:opacity-60 md:w-auto"
      >
        {isPending ? t('submitting') : cooldown > 0 ? t('retryIn', { seconds: cooldown }) : t('confirm')}
      </button>
    </div>
  );
}

/**
 * Step 4: the booking as it will be made, an optional reason (3…500) and the button that sends it. On a wide screen the
 * place of the error line under the reason is kept free: the line appears when the field loses focus on the mouse press,
 * and a button that moved away in between would miss the click that follows.
 */
export function ConfirmStep({ draft, onReasonChange, booking }: ConfirmStepProps): ReactNode {
  const t = useT('booking');
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const field = useReasonField(draft.reason, booking.reasonError);
  const cooldown: number = useRetryCooldown(booking.problem);
  const handleConfirm = (): void => {
    field.touch();
    if (reasonProblem(draft.reason) !== null) reasonRef.current?.focus();
    else booking.submit();
  };
  return (
    <div>
      <h2 className="serif text-xl font-semibold">{t('confirmTitle')}</h2>
      <div className="mt-3"><Summary draft={draft} /></div>
      <div className={field.error === undefined ? 'mt-4 md:pb-6' : 'mt-4'}>
        <ReasonField value={draft.reason} error={field.error} inputRef={reasonRef} onChange={onReasonChange} onBlur={field.touch} />
      </div>
      {booking.problem === null ? null : <div className="mt-4"><ProblemBanner problem={booking.problem} /></div>}
      <ConfirmButton isPending={booking.isPending} cooldown={cooldown} onConfirm={handleConfirm} />
    </div>
  );
}
