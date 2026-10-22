'use client';

import type { ReactNode } from 'react';
import { CalendarClock, Clock, UserRound } from 'lucide-react';
import { WRAP_TEXT } from '@/components/patient/wrap-text';
import { Card } from '@/components/ui/card';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { AppointmentActions } from './appointment-card';
import { dateTile, durationMin } from './appointment-day';
import type { AppointmentView } from './appointment-types';
import { StatusBadge } from './status-badge';

interface NextAppointmentProps {
  readonly appointment: AppointmentView;
  readonly onCancel: (appointment: AppointmentView) => void;
}

function Fact({ icon, children }: { readonly icon: ReactNode; readonly children: ReactNode }): ReactNode {
  return (
    <span className={cn('flex items-center gap-2', WRAP_TEXT)}>
      <span aria-hidden="true" className="flex-none">{icon}</span>
      {children}
    </span>
  );
}

/**
 * Hero card of the nearest upcoming visit (design canvas: date tile, "Ближайший приём", status, time · service, who, how long).
 * Everything comes from the appointment already on the page; the room is not in the API and is left out.
 */
export function NextAppointment({ appointment, onCancel }: NextAppointmentProps): ReactNode {
  const t = useT('appointments');
  const format = useClinicFormat();
  const tile = dateTile(appointment.start, format.locale);
  const minutes: number = durationMin(appointment.start, appointment.end);
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="next-appointment-title" data-testid="next-appointment" className="flex flex-wrap items-center gap-7 p-7 shadow-[0_1px_2px_rgb(19_37_43/0.05),0_10px_28px_rgb(19_37_43/0.06)]">
      <div aria-hidden="true" className="flex h-28 w-28 flex-none flex-col items-center justify-center gap-0.5 rounded-[18px] bg-primary text-primary-foreground">
        <span className="text-sm font-semibold uppercase tracking-[0.04em]">{tile.weekday}</span>
        <span className="text-[40px] font-bold leading-none">{tile.day}</span>
        <span className="text-sm font-medium">{tile.month}</span>
      </div>
      <div className="flex min-w-0 flex-[999_1_320px] flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 id="next-appointment-title" className="text-sm font-semibold uppercase tracking-[0.06em] text-primary-soft-foreground">{t('nextTitle')}</h2>
          <StatusBadge status={appointment.status} />
        </div>
        <p className={cn('text-[22px] font-bold tracking-tight sm:text-[28px]', WRAP_TEXT)}>
          <time dateTime={appointment.start} className="mono mr-1">{format.time(appointment.start)}</time>
          · {appointment.serviceName ?? t('serviceUnknown')}
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-muted-foreground">
          <Fact icon={<UserRound size={18} />}>{appointment.doctorName ?? t('doctorUnknown')}</Fact>
          {minutes > 0 ? <Fact icon={<Clock size={18} />}>{t('minutes', { minutes })}</Fact> : null}
          <Fact icon={<CalendarClock size={18} />}>{format.date(appointment.start)}</Fact>
        </div>
      </div>
      <div className="min-w-[200px] flex-[1_1_200px]">
        <AppointmentActions appointment={appointment} onCancel={onCancel} hero />
      </div>
    </Card>
  );
}
