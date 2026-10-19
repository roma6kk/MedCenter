'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { useClinicFormat } from '@/components/patient/use-clinic-format';
import { WRAP_TEXT } from '@/components/patient/wrap-text';
import { useT } from '@/lib/i18n/use-t';
import { isCancellable, type AppointmentView } from './appointment-types';

interface AppointmentCardProps {
  readonly appointment: AppointmentView;
  /** Offers the cancel action (only for a cancellable appointment); the dialog itself lives with the list. */
  readonly onCancel?: (appointment: AppointmentView) => void;
}

const ACTION_CLASS = 'inline-flex min-h-[44px] items-center rounded-[6px] border px-4 text-sm';

function CardActions({ appointment, when, onCancel }: AppointmentCardProps & { readonly when: string }): ReactNode {
  const t = useT('appointments');
  const doctor: string = appointment.doctorName ?? t('doctorUnknown');
  return (
    <div className="no-print mt-3 flex flex-wrap gap-2">
      <Link href={`/appointments/${encodeURIComponent(appointment.id)}`} aria-label={t('openFor', { when })} className={`${ACTION_CLASS} border-[var(--border)] hover:bg-[var(--secondary)]`}>
        {t('open')}
      </Link>
      {onCancel !== undefined && isCancellable(appointment.status) ? (
        <button type="button" aria-label={t('cancelFor', { when, doctor })} onClick={() => onCancel(appointment)} className={`${ACTION_CLASS} border-[var(--destructive)] text-[var(--destructive)] hover:bg-[var(--secondary)]`}>
          {t('cancel')}
        </button>
      ) : null}
    </div>
  );
}

/** One appointment of the list: the date as a serif headline, the status as a stamp, then who and what. */
export function AppointmentCard({ appointment, onCancel }: AppointmentCardProps): ReactNode {
  const t = useT('appointments');
  const format = useClinicFormat();
  const when: string = format.dateTime(appointment.start);
  const titleId = `appointment-${appointment.id}-when`;
  return (
    <article aria-labelledby={titleId} className="min-w-0 rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <time id={titleId} dateTime={appointment.start} className="serif text-[20px] font-semibold">{when}</time>
        <StampBadge status={appointment.status} />
      </div>
      <p className={`mt-1 text-sm ${WRAP_TEXT}`}>{appointment.doctorName ?? t('doctorUnknown')} · {appointment.serviceName ?? t('serviceUnknown')}</p>
      {appointment.status === 'cancelled' && appointment.cancelReason ? (
        <p className={`mt-1 text-sm text-[var(--muted-foreground)] ${WRAP_TEXT}`}>{t('fieldCancelReason')}: {appointment.cancelReason}</p>
      ) : null}
      <CardActions appointment={appointment} when={when} onCancel={onCancel} />
    </article>
  );
}
