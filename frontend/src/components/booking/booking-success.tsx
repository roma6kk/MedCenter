'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarPlus, MapPin } from 'lucide-react';
import { useAppointment } from '@/components/appointments/use-appointments';
import { useDoctor, useService } from '@/components/catalog/use-catalog';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { clinicDayOf, formatClinicTime, formatDayHeading } from '@/lib/clinic-time';
import { buildIcs, downloadIcs } from '@/lib/ics';
import { doctorLabel, normalizeDoctorName } from '@/lib/doctor-name';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import type { BookedVisit } from './use-booking-submit';


const ICS_FILE_BASE = 'lifeline-visit';

function AnimatedCheck(): ReactNode {
  return (
    <span aria-hidden="true" data-testid="success-check" className="inline-flex h-16 w-16 animate-check-pop items-center justify-center rounded-full bg-success-soft text-success">
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={24} strokeDasharray={24} className="animate-check-draw" />
      </svg>
    </span>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col gap-0.5 border-t border-border py-3 first:border-t-0 sm:flex-row sm:gap-4">
      <dt className="w-28 flex-none pt-0.5 text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base">{children}</dd>
    </div>
  );
}

export function BookingSuccess({ visit, onBookAnother }: { readonly visit: BookedVisit; readonly onBookAnother?: () => void }): ReactNode {
  const t = useT('booking');
  const home = useT('home');
  const common = useT('common');
  const locale = useUiStore((state) => state.locale);
  const heading = useRef<HTMLHeadingElement>(null);
  const doctor = useDoctor(visit.doctorId);
  const service = useService(visit.serviceId);
  const appointment = useAppointment(visit.id);
  const fromAppointment: string = normalizeDoctorName(appointment.data?.doctorName);
  const doctorName: string | undefined = fromAppointment !== '' ? fromAppointment : doctor.data === undefined ? undefined : doctorLabel(doctor.data);
  const serviceName: string | undefined = service.data?.name ?? appointment.data?.serviceName;
  const address: string = home('contactAddressValue');
  const day: string = clinicDayOf(visit.start);
  // The wizard's heading was focused by the step change; this screen replaces it, so focus goes to its own heading.
  useEffect(() => heading.current?.focus(), []);
  const addToCalendar = (): void => {
    const details: ReadonlyArray<string> = [
      ...(doctorName === undefined ? [] : [`${t('summaryDoctor')}: ${doctorName}`]),
      ...(serviceName === undefined ? [] : [`${t('summaryService')}: ${serviceName}`]),
    ];
    downloadIcs(
      `${ICS_FILE_BASE}-${day}.ics`,
      buildIcs({
        uid: `${visit.id}@lifeline`,
        start: visit.start,
        end: visit.end,
        summary: t('calendarTitle', { clinic: common('appName') }),
        location: address,
        ...(details.length === 0 ? {} : { description: details.join('. ') }),
      }),
    );
  };
  return (
    <Card radius="panel" padding="lg" data-testid="booking-success" className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 text-center">
      <AnimatedCheck />
      <div>
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-bold focus:outline-none">{t('successTitle')}</h2>
        <p role="status" className="mt-2 text-base text-muted-foreground">{t('successLead')}</p>
      </div>
      <dl data-testid="success-details" className="w-full rounded-card border border-border-soft px-5 text-left">
        <Fact label={t('summaryTime')}>
          <span className="font-semibold">{formatDayHeading(day, locale)}</span>
          <span className="tabular-nums"> · {formatClinicTime(visit.start, locale)}–{formatClinicTime(visit.end, locale)}</span>
        </Fact>
        <Fact label={t('summaryDoctor')}>{doctorName ?? '…'}</Fact>
        <Fact label={t('summaryService')}>{serviceName ?? t('serviceBySchedule')}</Fact>
        <Fact label={t('summaryPlace')}>
          <span className="inline-flex items-start gap-1.5"><MapPin aria-hidden="true" size={16} className="mt-1 flex-none text-primary" />{address}</span>
        </Fact>
      </dl>
      <div className="flex w-full flex-col justify-center gap-3 sm:flex-row sm:flex-wrap [&>*]:whitespace-nowrap">
        <Button variant="secondary" onClick={addToCalendar} data-testid="add-to-calendar"><CalendarPlus aria-hidden="true" size={18} />{t('addToCalendar')}</Button>
        <Link href="/appointments" className={buttonVariants({ variant: 'primary' })}>{t('toAppointments')}</Link>
        <Link href="/home" className={buttonVariants({ variant: 'ghost' })}>{t('toHome')}</Link>
        {onBookAnother === undefined ? null : <Button variant="ghost" onClick={onBookAnother} data-testid="book-another">{t('bookAnother')}</Button>}
      </div>
      <Link href={`/appointments/${encodeURIComponent(visit.id)}`} data-testid="success-cancel-link" className="inline-flex min-h-[44px] items-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
        {t('cancelLink')}
      </Link>
    </Card>
  );
}
