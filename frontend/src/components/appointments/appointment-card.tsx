'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { Button } from '@/components/ui/button';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { WRAP_TEXT } from '@/components/patient/wrap-text';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { isCancellable, type AppointmentView } from './appointment-types';
import { StatusBadge } from './status-badge';

interface AppointmentCardProps {
  readonly appointment: AppointmentView;
  /** Offers the cancel action (only for a cancellable appointment); the dialog itself lives with the list. */
  readonly onCancel?: (appointment: AppointmentView) => void;
}

/** The "details" link and the "cancel" button of one appointment; the hero card and the list rows share them. */
export function AppointmentActions({ appointment, onCancel, hero = false }: AppointmentCardProps & { readonly hero?: boolean }): ReactNode {
  const t = useT('appointments');
  const format = useClinicFormat();
  const when: string = format.dateTime(appointment.start);
  const doctor: string = appointment.doctorName ?? t('doctorUnknown');
  const size = hero ? 'lg' : 'md';
  return (
    <div className={cn('no-print flex flex-none gap-2', hero ? 'flex-col' : 'justify-end')}>
      <Link
        href={`/appointments/${encodeURIComponent(appointment.id)}`}
        aria-label={t('openFor', { when })}
        className={cn(buttonVariants({ variant: 'secondary', size }), 'font-medium', hero && 'font-semibold')}
      >
        {t('open')}
      </Link>
      {onCancel !== undefined && isCancellable(appointment.status) ? (
        <Button variant={hero ? 'danger' : 'ghost'} size={size} aria-label={t('cancelFor', { when, doctor })} onClick={() => onCancel(appointment)} className={hero ? '' : 'font-semibold text-destructive hover:bg-destructive-soft'}>
          {hero ? t('cancel') : t('cancelShort')}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One appointment as a row of the list: the clock time in mono type, what and who, the status as a soft pill, then the
 * actions. The day itself is the heading of the group the row sits in.
 */
export function AppointmentCard({ appointment, onCancel }: AppointmentCardProps): ReactNode {
  const t = useT('appointments');
  const format = useClinicFormat();
  const when: string = format.dateTime(appointment.start);
  return (
    <article aria-label={when} className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
      <time dateTime={appointment.start} className="mono w-16 flex-none text-[17px] font-medium">{format.time(appointment.start)}</time>
      <div className="flex min-w-0 flex-[999_1_240px] flex-col gap-0.5">
        <p className={cn('text-base font-semibold', WRAP_TEXT)}>{appointment.serviceName ?? t('serviceUnknown')}</p>
        <p className={cn('text-sm text-muted-foreground', WRAP_TEXT)}>{appointment.doctorName ?? t('doctorUnknown')}</p>
        {appointment.status === 'cancelled' && appointment.cancelReason ? (
          <p className={cn('text-sm text-muted-foreground', WRAP_TEXT)}>{t('fieldCancelReason')}: {appointment.cancelReason}</p>
        ) : null}
      </div>
      <StatusBadge status={appointment.status} />
      <AppointmentActions appointment={appointment} onCancel={onCancel} />
    </article>
  );
}
