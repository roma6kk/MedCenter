'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/use-t';
import { CatalogUnavailable } from './catalog-unavailable';
import type { CatalogService, Doctor } from './catalog-types';
import { DoctorCard } from './doctor-card';
import { DoctorProfileLink } from './doctor-profile-link';
import { ServiceGrid } from './service-grid';

const HOME_DOCTORS = 4;
const PRIMARY_LINK_CLASS = 'inline-flex min-h-[44px] items-center rounded-[6px] bg-[var(--primary)] px-5 py-2 text-[var(--primary-foreground)]';
const SECONDARY_LINK_CLASS = 'inline-flex min-h-[44px] items-center rounded-[6px] border border-[var(--border)] bg-[var(--card)] px-5 py-2 hover:bg-[var(--secondary)]';

interface HomeViewProps {
  readonly services: ReadonlyArray<CatalogService>;
  readonly doctors: ReadonlyArray<Doctor>;
  /** The catalog could not be read on the server. */
  readonly isFailed: boolean;
}

function Hero(): ReactNode {
  const t = useT('home');
  return (
    <section aria-labelledby="home-title">
      <h1 id="home-title" className="serif text-[32px] font-bold leading-tight">{t('title')}</h1>
      <p className="mt-3 max-w-2xl text-base text-[var(--muted-foreground)]">{t('lead')}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/booking" className={PRIMARY_LINK_CLASS}>{t('book')}</Link>
        <Link href="/doctors" className={SECONDARY_LINK_CLASS}>{t('findDoctor')}</Link>
      </div>
    </section>
  );
}

function DoctorsTeaser({ doctors }: { readonly doctors: ReadonlyArray<Doctor> }): ReactNode {
  const t = useT('home');
  if (doctors.length === 0) return null;
  return (
    <section aria-labelledby="home-doctors" className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="home-doctors" className="serif text-2xl font-semibold">{t('doctorsTitle')}</h2>
        <Link href="/doctors" className="inline-flex min-h-[44px] items-center text-sm underline">{t('doctorsAll')}</Link>
      </div>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {doctors.slice(0, HOME_DOCTORS).map((doctor) => (
          <li key={doctor.id}><DoctorCard doctor={doctor} headingLevel={3}><DoctorProfileLink doctor={doctor} /></DoctorCard></li>
        ))}
      </ul>
    </section>
  );
}

/** Landing page: what the clinic offers and a way to the doctors and the booking (frontend-design-spec §C.1). */
export function HomeView({ services, doctors, isFailed }: HomeViewProps): ReactNode {
  const t = useT('home');
  return (
    <div>
      <Hero />
      {isFailed ? (
        <div className="mt-10"><CatalogUnavailable namespace="home" retryHref="/" /></div>
      ) : (
        <>
          <section aria-labelledby="home-services" className="mt-10">
            <h2 id="home-services" className="serif text-2xl font-semibold">{t('servicesTitle')}</h2>
            <div className="mt-4"><ServiceGrid services={services} /></div>
          </section>
          <DoctorsTeaser doctors={doctors} />
        </>
      )}
    </div>
  );
}
