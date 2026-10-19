'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/use-t';
import type { Doctor } from './catalog-types';
import { DoctorCard } from './doctor-card';
import { DoctorSlotsBooking } from './doctor-slots-booking';

/** `/doctors/[doctorId]`: the doctor's card and the free time to book (frontend-design-spec §3). */
export function DoctorProfile({ doctor }: { readonly doctor: Doctor }): ReactNode {
  const t = useT('catalog');
  return (
    <div>
      <Link href="/doctors" className="inline-flex min-h-[44px] items-center text-sm underline">{t('backToList')}</Link>
      <div className="mt-2"><DoctorCard doctor={doctor} headingLevel={1} /></div>
      <section aria-labelledby="doctor-slots" className="mt-8">
        <h2 id="doctor-slots" className="serif text-2xl font-semibold">{t('slotsTitle')}</h2>
        <p className="mb-4 mt-1 text-sm text-[var(--muted-foreground)]">{t('slotsLead')}</p>
        <DoctorSlotsBooking doctorId={doctor.id} />
      </section>
    </div>
  );
}
