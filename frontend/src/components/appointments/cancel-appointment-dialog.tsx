'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { buttonVariants } from '@/components/ui/button-variants';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { CANCEL_REASON_CODES } from '@/lib/contracts';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import { useCloseUnlessPending } from '@/components/patient/use-close-unless-pending';
import { doctorOf, type AppointmentView } from './appointment-types';
import { useCancelForm, type CancelFormState } from './use-cancel-form';

interface CancelAppointmentDialogProps {
  readonly appointment: AppointmentView;
  // Must keep its identity between renders: the focus trap restarts when it changes.
  readonly onClose: () => void;
  readonly onCancelled: () => void;
}

function NotCancellable({ onClose }: { readonly onClose: () => void }): ReactNode {
  const t = useT('appointments');
  const tCommon = useT('common');
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => closeButton.current?.focus(), []);
  return (
    <div>
      <p role="alert" className="mt-3 text-sm">{t('notCancellable')}</p>
      <button ref={closeButton} type="button" onClick={onClose} className={`${buttonVariants({ variant: 'secondary' })} mt-3`}>{tCommon('close')}</button>
    </div>
  );
}

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
      <fieldset aria-describedby={error === undefined ? undefined : 'cancel-reason-error'} className="grid gap-2">
        <legend className="form-label mb-1">{t('cancelReasonLabel')}</legend>
        {CANCEL_REASON_CODES.map((code) => (
          <label key={code} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="radio" value={code} {...form.register('reason')} className="size-4 accent-primary" />
            {t(`cancelReasons.${code}`)}
          </label>
        ))}
        {error === undefined ? null : <p id="cancel-reason-error" role="alert" className="text-sm text-destructive">{error}</p>}
      </fieldset>
      {form.problem !== null ? <div className="mt-3"><ProblemBanner problem={form.problem} /></div> : null}
    </form>
  );
}

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
      description={`${format.dateTime(appointment.start)} · ${doctorOf(appointment, t('doctorUnknown'))}. ${t('cancelLead')}`}
      size="sm"
      onClose={close}
      footer={footer}
    >
      {form.notCancellable ? <NotCancellable onClose={onClose} /> : <ReasonForm form={form} formId={formId} />}
    </Dialog>
  );
}
