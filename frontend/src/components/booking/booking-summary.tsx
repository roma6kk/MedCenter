'use client';

import type { ReactNode } from 'react';
import { useDoctor, useService } from '@/components/catalog/use-catalog';
import { Card } from '@/components/ui/card';
import { formatClinicDateTime } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import type { BookingDraft, BookingStep } from '@/store/use-booking-draft-store';
import { slotDurationMin } from './slot-time';

interface BookingSummaryProps {
  readonly draft: Pick<BookingDraft, 'step' | 'serviceId' | 'doctorId' | 'slotStart' | 'slotEnd'>;
  /** On the confirmation step: every choice gets «Изменить», which goes back to the step that made it. */
  readonly onEdit?: (step: BookingStep) => void;
  /** Shows the clinic's address (and, on the confirmation step, the cancellation hint). */
  readonly showPlace?: boolean;
  /** The confirm button, in the panel on the confirmation step. */
  readonly action?: ReactNode;
}

interface RowProps {
  readonly label: string;
  readonly children: ReactNode;
  /** The step this row's choice is made on; with `onEdit` the row offers to go back there. */
  readonly editStep?: BookingStep;
  readonly onEdit?: (step: BookingStep) => void;
}

function EditButton({ label, step, onEdit }: { readonly label: string; readonly step: BookingStep; readonly onEdit: (step: BookingStep) => void }): ReactNode {
  const t = useT('booking');
  return (
    <button
      type="button"
      onClick={() => onEdit(step)}
      aria-label={t('editStepLabel', { what: label })}
      data-testid={`summary-edit-${step}`}
      className="-my-2 inline-flex min-h-[44px] flex-none items-center rounded-control px-2 text-sm font-semibold text-primary-soft-foreground hover:underline"
    >
      {t('editStep')}
    </button>
  );
}

function Row({ label, children, editStep, onEdit }: RowProps): ReactNode {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex items-start justify-between gap-3">
        <span className="min-w-0">{children}</span>
        {editStep === undefined || onEdit === undefined ? null : <EditButton label={label} step={editStep} onEdit={onEdit} />}
      </dd>
    </div>
  );
}

/**
 * "Ваша запись": what the draft holds so far, beside every step. It reads the draft store and the catalogue queries the
 * steps already run (same keys, so nothing is requested twice). On the confirmation step it also offers «Изменить» for
 * each choice, the clinic's address and the cancellation hint, and carries the confirm button.
 */
export function BookingSummary({ draft, onEdit, showPlace = false, action }: BookingSummaryProps): ReactNode {
  const t = useT('booking');
  const home = useT('home');
  const locale = useUiStore((state) => state.locale);
  const service = useService(draft.serviceId);
  const doctor = useDoctor(draft.doctorId);
  const hasService: boolean = draft.serviceId !== null;
  const slotMinutes: number = draft.slotStart === null || draft.slotEnd === null ? 0 : slotDurationMin({ start: draft.slotStart, end: draft.slotEnd });
  const minutes: number = slotMinutes > 0 ? slotMinutes : (service.data?.defaultDurationMin ?? 0);
  const muted = 'text-base text-muted-foreground';
  return (
    <Card as="section" radius="panel" padding="lg" aria-labelledby="booking-summary-title" data-testid="booking-draft-summary" className="flex flex-col gap-4">
      <h2 id="booking-summary-title" className="text-lg font-bold">{t('summaryTitle')}</h2>
      <dl data-testid="booking-summary" className="flex flex-col gap-3.5">
        <Row label={t('summaryService')} editStep={1} {...(onEdit === undefined ? {} : { onEdit })}>
          {hasService ? <span className="text-base font-semibold">{service.data?.name ?? '…'}</span> : <span className={muted}>{draft.step === 1 ? t('summaryNone') : t('serviceBySchedule')}</span>}
        </Row>
        <Row label={t('summaryDoctor')} editStep={2} {...(onEdit === undefined ? {} : { onEdit })}>
          {draft.doctorId === null ? (
            <span className={muted}>{t('summaryNone')}</span>
          ) : (
            <>
              <span className="text-base font-semibold">{doctor.data?.name ?? '…'}</span>
              {doctor.data?.specialty === undefined ? null : <span className="block text-sm text-muted-foreground">{doctor.data.specialty}</span>}
            </>
          )}
        </Row>
        <Row label={t('summaryTime')} editStep={3} {...(onEdit === undefined ? {} : { onEdit })}>
          {draft.slotStart === null ? <span className={muted}>—</span> : <span className="tabular-nums text-base font-medium">{formatClinicDateTime(draft.slotStart, locale)}</span>}
        </Row>
        <Row label={t('summaryDuration')}>
          {minutes > 0 ? <span className="tabular-nums text-base font-medium">{t('slotMinutes', { minutes })}</span> : <span className={muted}>—</span>}
        </Row>
        {showPlace ? <Row label={t('summaryPlace')}><span className="text-base font-medium">{home('contactAddressValue')}</span></Row> : null}
      </dl>
      <p className="text-xs leading-normal text-muted-foreground">{showPlace ? t('cancelHint') : t('draftNote')}</p>
      {action}
    </Card>
  );
}
