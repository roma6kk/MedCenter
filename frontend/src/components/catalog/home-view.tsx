'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { SECTION_CLASS, SECTION_TITLE_CLASS } from './catalog-styles';
import { CatalogUnavailable } from './catalog-unavailable';
import type { CatalogService, Doctor } from './catalog-types';
import { DoctorCard } from './doctor-card';
import { DoctorCardActions } from './doctor-profile-link';
import { HomeAudiences } from './home-audiences';
import { HomeContacts } from './home-contacts';
import { HomeCta } from './home-cta';
import { HomeDirections } from './home-directions';
import { directionEntries } from './home-directions-model';
import { HomeHero } from './home-hero';
import { HomePath } from './home-path';
import { HOME_ANCHORS } from './home-content';
import { MobileBookBar } from './mobile-book-bar';
import { HomeTrust } from './home-trust';
import { ServiceGrid } from './service-grid';

const HOME_DOCTORS = 4;

interface HomeViewProps {
  readonly services: ReadonlyArray<CatalogService>;
  readonly doctors: ReadonlyArray<Doctor>;
  /** The catalog could not be read on the server. */
  readonly isFailed: boolean;
}

/** Services of the clinic with their length, shown under the departments; each leads to the doctors who give it. */
function ServicesBlock({ services }: { readonly services: ReadonlyArray<CatalogService> }): ReactNode {
  const t = useT('home');
  // No services, no block: an «Услуги — каталог пуст» heading over nothing says less than silence (C4).
  if (services.length === 0) return null;
  return (
    <div id={HOME_ANCHORS.services} className="flex scroll-mt-4 flex-col gap-4 border-t border-border pt-8">
      <div>
        <h3 className="text-2xl font-bold">{t('servicesTitle')}</h3>
        <p className="mt-1 text-base text-muted-foreground">{t('servicesLead')}</p>
      </div>
      <ServiceGrid services={services} />
    </div>
  );
}

function DoctorsTeaser({ doctors }: { readonly doctors: ReadonlyArray<Doctor> }): ReactNode {
  const t = useT('home');
  if (doctors.length === 0) return null;
  return (
    <section aria-labelledby="home-doctors" className={`${SECTION_CLASS} flex flex-col gap-6 pt-16`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="home-doctors" className={SECTION_TITLE_CLASS}>{t('doctorsTitle')}</h2>
        <Link href="/doctors" className={buttonVariants({ variant: 'secondary' })}>{t('doctorsAll')}</Link>
      </div>
      <ul className="grid gap-4 md:grid-cols-2">
        {doctors.slice(0, HOME_DOCTORS).map((doctor) => (
          <li key={doctor.id}><DoctorCard doctor={doctor} headingLevel={3} tone="interactive" showNearest><DoctorCardActions doctor={doctor} /></DoctorCard></li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Landing page of the clinic (redesign canvas "Главная — клиника полного цикла"): what the clinic does and for whom, its
 * departments and services, the patient's way through it, the companies it works with, the doctors and the contacts.
 * Booking is one way in among several, not the centre of the page.
 */
export function HomeView({ services, doctors, isFailed }: HomeViewProps): ReactNode {
  const t = useT('home');
  useDocumentTitle(t('title'), false);
  const entries = directionEntries(isFailed ? undefined : doctors, services.length > 0);
  // The live part of the departments section: the retry banner when the catalog is down, the services when there are any, else nothing.
  const live: ReactNode = isFailed ? <CatalogUnavailable namespace="home" retryHref="/" /> : services.length > 0 ? <ServicesBlock services={services} /> : undefined;
  return (
    <>
      <HomeHero doctors={isFailed ? [] : doctors} />
      <HomeTrust />
      <HomeDirections entries={entries}>{live}</HomeDirections>
      <HomePath />
      <HomeAudiences />
      {isFailed ? null : <DoctorsTeaser doctors={doctors} />}
      <HomeCta />
      <HomeContacts />
      <MobileBookBar />
    </>
  );
}
