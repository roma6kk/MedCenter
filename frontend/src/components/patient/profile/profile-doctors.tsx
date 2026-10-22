'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button-variants';
import type { AppointmentView } from '@/components/appointments/appointment-types';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { WRAP_TEXT } from '../wrap-text';
import { initialsOf } from './profile-header';

export interface DoctorEntry {
  readonly name: string;
  /** The nearest booked appointment with this doctor. */
  readonly appointment: AppointmentView;
}

/** Doctors of the booked appointments, in the order of the list (soonest first), one row per name. The history carries no doctor name, so only these can be named. */
export function doctorsOf(appointments: ReadonlyArray<AppointmentView>): ReadonlyArray<DoctorEntry> {
  const seen = new Set<string>();
  const result: DoctorEntry[] = [];
  for (const appointment of appointments) {
    const name: string = (appointment.doctorName ?? '').trim();
    if (name === '' || seen.has(name)) continue;
    seen.add(name);
    result.push({ name, appointment });
  }
  return result;
}

export function ProfileDoctors({ doctors }: { readonly doctors: ReadonlyArray<DoctorEntry> }): ReactNode {
  const t = useT('patientProfile.doctors');
  const format = useClinicFormat();
  if (doctors.length === 0) return null;
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="profile-doctors-title" className="flex flex-col gap-3.5 p-[22px]">
      <div>
        <h2 id="profile-doctors-title" className="text-lg font-bold">{t('title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('hint')}</p>
      </div>
      <ul className="flex list-none flex-col gap-3">
        {doctors.map(({ name, appointment }) => (
          <li key={name} className="flex flex-wrap items-center gap-3.5 rounded-[14px] bg-background p-3.5">
            <span aria-hidden="true" className="inline-flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-primary-soft font-bold text-primary-soft-foreground">{initialsOf(name)}</span>
            <span className={cn('flex flex-[1_1_200px] flex-col gap-0.5', WRAP_TEXT)}>
              <span className="text-base font-bold">{name}</span>
              <span className="text-sm text-muted-foreground">{t('nextVisit', { date: format.date(appointment.start) })}</span>
            </span>
            <Link href={`/appointments/${encodeURIComponent(appointment.id)}`} aria-label={t('openLabel', { name })} className={buttonVariants({ variant: 'soft' })}>{t('open')}</Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
