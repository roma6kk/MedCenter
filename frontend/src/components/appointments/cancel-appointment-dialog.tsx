'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { FormField, INPUT_CLASS } from '@/components/patient/form-field';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useDialogFocus } from '@/hooks/use-dialog-focus';
import { useT } from '@/lib/i18n/use-t';
import type { AppointmentView } from './appointment-types';
import { useCancelForm, type CancelFormState } from './use-cancel-form';

interface CancelAppointmentDialogProps {
  readonly appointment: AppointmentView;
  /** Must keep its identity between renders (`useCallback`): the focus trap restarts when it changes. */
  readonly onClose: () => void;
  readonly onCancelled: () => void;
}


function NotCancellable({ onClose }: { readonly onClose: () => void }): ReactNode {
  const t = useT('appointments');
  const tCommon = useT('common');
  const closeButton = useRef<HTMLButtonElement>(null);
  // The submit button that had the focus is gone: hand the focus to the only action left.
  useEffect(() => closeButton.current?.focus(), []);
  return (
    <div>
      <p role="alert" className="mt-3 text-sm">{t('notCancellable')}</p>
      <button ref={closeButton} type="button" onClick={onClose} className={`${buttonVariants({ variant: 'secondary' })} mt-3`}>{tCommon('close')}</button>
    </div>
  );
}

/** Client messages are `appointments.*` keys; whatever the server said about the field is already text. */
function useReasonError(form: CancelFormState): string | undefined {
  const t = useT();
  const error = form.errors.reason;
  if (error?.message === undefined) return undefined;
  return error.type === 'server' ? error.message : t(error.message);
}

function ReasonForm({ form, onClose }: { readonly form: CancelFormState; readonly onClose: () => void }): ReactNode {
  const t = useT('appointments');
  const error: string | undefined = useReasonError(form);
  return (
    <form onSubmit={(event) => { event.preventDefault(); form.submit(); }} noValidate className="mt-3">
      <FormField id="cancel-reason" label={t('cancelReasonLabel')} hint={t('cancelReasonHint')} error={error}>
        {(control) => <textarea rows={4} {...control} {...form.register('reason')} className={INPUT_CLASS} />}
      </FormField>
      {form.problem !== null ? <div className="mt-3"><ProblemBanner problem={form.problem} /></div> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {/* aria-disabled, not disabled: a control that loses the focus to the body would let Tab walk out of the dialog. */}
        <Button type="submit" variant="danger" aria-disabled={form.pending}>{form.pending ? t('cancelBusy') : t('cancelSubmit')}</Button>
        <Button variant="secondary" aria-disabled={form.pending} onClick={onClose}>{t('cancelKeep')}</Button>
      </div>
    </form>
  );
}

/**
 * "Do not cancel" and Escape mean the request was never sent, so they do nothing while it is in flight: the appointment
 * would be cancelled after the user dismissed the dialog, and nobody would be told. The identity of the returned function
 * does not change (the focus trap restarts when it does), the pending state is read through a ref.
 */
function useCloseUnlessPending(pending: boolean, onClose: () => void): () => void {
  const isPending = useRef(pending);
  useEffect(() => {
    isPending.current = pending;
  }, [pending]);
  return useCallback(() => {
    if (!isPending.current) onClose();
  }, [onClose]);
}

/** The cancellation dialog (FR-005): the reason is mandatory, focus stays inside, Escape closes, a 409 explains itself. */
export function CancelAppointmentDialog({ appointment, onClose, onCancelled }: CancelAppointmentDialogProps): ReactNode {
  const t = useT('appointments');
  const format = useClinicFormat();
  const titleId: string = useId();
  const leadId: string = useId();
  const form: CancelFormState = useCancelForm(appointment.id, onCancelled);
  const close: () => void = useCloseUnlessPending(form.pending, onClose);
  const dialogRef = useDialogFocus<HTMLDivElement>(true, close);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse/40 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={leadId} className="max-h-full w-full max-w-md overflow-y-auto rounded-panel border border-border bg-card p-6">
        <h2 id={titleId} className="text-lg font-bold">{t('cancelTitle')}</h2>
        <p id={leadId} className="mt-1 text-sm text-[var(--muted-foreground)]">
          {format.dateTime(appointment.start)} · {appointment.doctorName ?? t('doctorUnknown')}. {t('cancelLead')}
        </p>
        {form.notCancellable ? <NotCancellable onClose={onClose} /> : <ReasonForm form={form} onClose={close} />}
      </div>
    </div>
  );
}
