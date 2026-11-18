'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { doctorLabel } from '@/lib/doctor-name';
import { useT } from '@/lib/i18n/use-t';
import type { CatalogService, Doctor } from './catalog-types';
import { doctorInitials } from './doctor-initials';
import { DoctorSlotsBooking } from './doctor-slots-booking';
import { useDoctorServices } from './use-doctor-services';

const SECTION_HEADING_CLASS = 'text-2xl font-bold';

function DoctorAbout({ doctor, services, isPending }: { readonly doctor: Doctor; readonly services: ReadonlyArray<CatalogService>; readonly isPending: boolean }): ReactNode {
  const t = useT('catalog');
  return (
    <section aria-labelledby="doctor-about" className="mt-8">
      <h2 id="doctor-about" className={SECTION_HEADING_CLASS}>{t('aboutTitle')}</h2>
      <dl className="mt-4 grid gap-4 rounded-card border border-border-soft bg-card p-5 shadow-elev-1 sm:grid-cols-[10rem_1fr]">
        <dt className="text-sm text-muted-foreground">{t('aboutSpecialty')}</dt>
        <dd className="font-semibold">{doctor.specialty ?? t('noSpecialty')}</dd>
        <dt className="text-sm text-muted-foreground">{t('aboutServices')}</dt>
        <dd>
          {isPending ? (
            <Skeleton aria-hidden="true" className="h-5 w-48" />
          ) : services.length === 0 ? (
            <span className="text-muted-foreground">{t('aboutNoServices')}</span>
          ) : (
            <ul className="flex flex-col gap-1.5" data-testid="doctor-services">
              {services.map((service) => (
                <li key={service.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{service.name}</span>
                  <span className="tabular-nums text-sm text-muted-foreground">{t('minutes', { minutes: service.defaultDurationMin })}</span>
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">{t('aboutNote')}</p>
    </section>
  );
}

export function DoctorProfile({ doctor }: { readonly doctor: Doctor }): ReactNode {
  const t = useT('catalog');
  useDocumentTitle(doctorLabel(doctor));
  const { services, isPending } = useDoctorServices(doctor.id);
  return (
    <div>
      <Link href="/doctors" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium hover:underline">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t('backToList')}
      </Link>
      <header data-testid="doctor-card" className="mt-2 flex flex-col items-start gap-5 rounded-panel bg-primary-soft p-6 sm:flex-row sm:items-center">
        <Avatar src={doctor.photoUrl} initials={doctorInitials(doctor)} className="h-28 w-28 text-4xl ring-4 ring-card" />
        <div>
          <h1 className="text-3xl font-bold">{doctorLabel(doctor)}</h1>
          <p className="mt-1 text-lg font-medium text-primary-soft-foreground">{doctor.specialty ?? t('noSpecialty')}</p>
        </div>
      </header>
      <DoctorAbout doctor={doctor} services={services} isPending={isPending} />
      <section aria-labelledby="doctor-slots" className="mt-8">
        <h2 id="doctor-slots" className={SECTION_HEADING_CLASS}>{t('slotsTitle')}</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">{t('slotsLead')}</p>
        <DoctorSlotsBooking doctorId={doctor.id} services={services} servicesPending={isPending} />
      </section>
    </div>
  );
}
