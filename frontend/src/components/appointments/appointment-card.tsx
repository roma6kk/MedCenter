'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CircleX } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { Button } from '@/components/ui/button';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { WRAP_TEXT } from '@/components/patient/wrap-text';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { doctorOf, isCancellable, type AppointmentView } from './appointment-types';
import { StatusBadge } from './status-badge';

interface AppointmentCardProps {
  readonly appointment: AppointmentView;
  readonly onCancel?: (appointment: AppointmentView) => void;
}

export function AppointmentActions({ appointment, onCancel, hero = false }: AppointmentCardProps & { readonly hero?: boolean }): ReactNode {
  const t = useT('appointments');
  const format = useClinicFormat();
  const when: string = format.dateTime(appointment.start);
  const doctor: string = doctorOf(appointment, t('doctorUnknown'));
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
        <Button variant="quiet-danger" size={size} aria-label={t('cancelFor', { when, doctor })} onClick={() => onCancel(appointment)}>
          <CircleX aria-hidden="true" className="size-4" />
          {hero ? t('cancel') : t('cancelShort')}
        </Button>
      ) : null}
    </div>
  );
}

export function AppointmentCard({ appointment, onCancel }: AppointmentCardProps): ReactNode {
  const t = useT('appointments');
  const format = useClinicFormat();
  const when: string = format.dateTime(appointment.start);
  return (
    <article aria-label={when} className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
      <time dateTime={appointment.start} className="tabular-nums w-16 flex-none text-lg font-medium">{format.time(appointment.start)}</time>
      <div className="flex min-w-0 flex-[999_1_240px] flex-col gap-0.5">
        <p className={cn('text-base font-semibold', WRAP_TEXT)}>{appointment.serviceName ?? t('serviceUnknown')}</p>
        <p className={cn('text-sm text-muted-foreground', WRAP_TEXT)}>{doctorOf(appointment, t('doctorUnknown'))}</p>
        {appointment.status === 'cancelled' && appointment.cancelReason ? (
          <p className={cn('text-sm text-muted-foreground', WRAP_TEXT)}>{t('fieldCancelReason')}: {appointment.cancelReason}</p>
        ) : null}
      </div>
      <StatusBadge status={appointment.status} />
      <AppointmentActions appointment={appointment} onCancel={onCancel} />
    </article>
  );
}
