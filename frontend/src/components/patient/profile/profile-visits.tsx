'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button-variants';
import { dateTile } from '@/components/appointments/appointment-day';
import type { AppointmentView } from '@/components/appointments/appointment-types';
import { StatusBadge } from '@/components/appointments/status-badge';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { WRAP_TEXT } from '../wrap-text';
import type { HistoryEntry } from '../patient-types';

/** The nearest booked appointment; `more` is how many further ones the loaded page holds. */
export function NextVisitCard({ appointment, more }: { readonly appointment: AppointmentView | undefined; readonly more: number }): ReactNode {
  const t = useT('patientProfile.next');
  const format = useClinicFormat();
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="profile-next-title" data-testid="profile-next" className="flex flex-col gap-3.5 p-[22px]">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="profile-next-title" className="text-lg font-bold">{t('title')}</h2>
        {appointment === undefined ? null : <StatusBadge status={appointment.status} />}
      </div>
      {appointment === undefined ? (
        <>
          <p className="text-[15px] text-muted-foreground">{t('empty')}</p>
          <div className="mt-auto"><Link href="/booking" className={buttonVariants({ variant: 'primary' })}>{t('book')}</Link></div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3.5">
            <div aria-hidden="true" className="flex h-[72px] w-[72px] flex-none flex-col items-center justify-center rounded-[14px] bg-primary text-primary-foreground">
              <span className="text-xs font-semibold uppercase">{dateTile(appointment.start, format.locale).weekday}</span>
              <span className="text-[26px] font-bold leading-none">{dateTile(appointment.start, format.locale).day}</span>
              <span className="text-xs">{dateTile(appointment.start, format.locale).month}</span>
            </div>
            <div className={cn('flex flex-col gap-0.5', WRAP_TEXT)}>
              <time dateTime={appointment.start} className="mono text-lg font-medium">{format.time(appointment.start)}</time>
              <span className="text-[15px] font-semibold">{appointment.serviceName ?? t('serviceUnknown')}</span>
              <span className="text-sm text-muted-foreground">{appointment.doctorName ?? t('doctorUnknown')}</span>
              <span className="text-sm text-muted-foreground">{format.date(appointment.start)}</span>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Link href={`/appointments/${encodeURIComponent(appointment.id)}`} className={buttonVariants({ variant: 'secondary' })}>{t('details')}</Link>
            {more > 0 ? <Link href="/appointments" className={buttonVariants({ variant: 'ghost' })}>{t('more', { count: more })}</Link> : null}
          </div>
        </>
      )}
    </Card>
  );
}

/** The newest finished visit: day, service, diagnosis chip and what the doctor advised. The doctor's name is not in the history answer. */
export function LastVisitCard({ entry }: { readonly entry: HistoryEntry | undefined }): ReactNode {
  const t = useT('patientProfile.last');
  const format = useClinicFormat();
  const diagnosis = entry?.diagnoses[0];
  const advice: string = (entry?.recommendations ?? '').trim();
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="profile-last-title" data-testid="profile-last" className="flex flex-col gap-3 p-[22px]">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="profile-last-title" className="text-lg font-bold">{t('title')}</h2>
        {entry === undefined ? null : <time dateTime={entry.date} className="text-sm text-muted-foreground">{format.date(entry.date)}</time>}
      </div>
      {entry === undefined ? (
        <p className="text-[15px] text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <p className={cn('text-sm text-muted-foreground', WRAP_TEXT)}>{entry.serviceType?.display ?? t('serviceUnknown')}</p>
          <div className="flex flex-wrap items-center gap-2">
            {entry.diagnosis === '' ? (
              <span className="text-[15px] text-muted-foreground">{t('noDiagnosis')}</span>
            ) : (
              <>
                <span className="mono rounded-md bg-secondary px-2 py-[3px] text-[13px] font-medium">{entry.diagnosis}</span>
                {diagnosis === undefined ? null : <span className={cn('text-[15px] font-semibold', WRAP_TEXT)}>{diagnosis.display}</span>}
              </>
            )}
          </div>
          {advice === '' ? null : (
            <div className={cn('rounded-[12px] bg-primary-soft px-3.5 py-3 text-sm leading-normal text-primary-soft-foreground', WRAP_TEXT)}>
              <span className="block text-xs font-bold uppercase tracking-[0.05em]">{t('doctorAdvice')}</span>
              {format.prose(advice)}
            </div>
          )}
        </>
      )}
      <Link href="/history" className={cn(buttonVariants({ variant: 'ghost' }), 'mt-auto self-start')}>{t('all')}</Link>
    </Card>
  );
}
