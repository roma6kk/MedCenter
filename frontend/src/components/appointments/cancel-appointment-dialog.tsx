'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { buttonVariants } from '@/components/ui/button-variants';
import { FormField, INPUT_CLASS } from '@/components/patient/form-field';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { useClinicFormat } from '@/hooks/use-clinic-format';
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

function ReasonForm({ form, formId }: { readonly form: CancelFormState; readonly formId: string }): ReactNode {
  const t = useT('appointments');
  const error: string | undefined = useReasonError(form);
  return (
    <form id={formId} onSubmit={(event) => { event.preventDefault(); form.submit(); }} noValidate className="mt-3">
      <FormField id="cancel-reason" label={t('cancelReasonLabel')} hint={t('cancelReasonHint')} error={error}>
        {(control) => <textarea rows={4} {...control} {...form.register('reason')} className={INPUT_CLASS} />}
      </FormField>
      {form.problem !== null ? <div className="mt-3"><ProblemBanner problem={form.problem} /></div> : null}
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

/**
 * The cancellation dialog (FR-005, B2): a real modal over the page (scrim, focus trap, Escape), the reason is mandatory, a
 * 409 explains itself. The solid red button here is the one place where the cancellation is confirmed; the buttons live in
 * the footer and submit the form by its id.
 */
export function CancelAppointmentDialog({ appointment, onClose, onCancelled }: CancelAppointmentDialogProps): ReactNode {
  const t = useT('appointments');
  const format = useClinicFormat();
  const formId = 'cancel-appointment-form';
  const form: CancelFormState = useCancelForm(appointment.id, onCancelled);
  const close: () => void = useCloseUnlessPending(form.pending, onClose);
  const footer: ReactNode = form.notCancellable ? undefined : (
    <>
      {/* aria-disabled, not disabled: a control that loses the focus to the body would let Tab walk out of the dialog. */}
      <Button variant="secondary" aria-disabled={form.pending} onClick={close}>{t('cancelKeep')}</Button>
      <Button type="submit" form={formId} variant="destructive" aria-disabled={form.pending}>{form.pending ? t('cancelBusy') : t('cancelSubmit')}</Button>
    </>
  );
  return (
    <Dialog
      title={t('cancelTitle')}
      description={`${format.dateTime(appointment.start)} · ${appointment.doctorName ?? t('doctorUnknown')}. ${t('cancelLead')}`}
      size="sm"
      onClose={close}
      footer={footer}
    >
      {form.notCancellable ? <NotCancellable onClose={onClose} /> : <ReasonForm form={form} formId={formId} />}
    </Dialog>
  );
}
