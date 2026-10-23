'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button-variants';
import { useT } from '@/lib/i18n/use-t';
import { SECTION_CLASS, SECTION_LEAD_CLASS, SECTION_TITLE_CLASS } from './catalog-styles';
import { directoryHref } from './doctor-directory';
import { DIRECTIONS, HOME_ANCHORS, type Direction } from './home-content';

function DirectionCard({ direction }: { readonly direction: Direction }): ReactNode {
  const t = useT('home.directions');
  const tHome = useT('home');
  const Icon = direction.icon;
  const name: string = t(`${direction.id}.name`);
  return (
    <li>
      <Card as="article" padding="lg" className="flex h-full flex-col gap-3">
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-card bg-primary-soft text-primary-soft-foreground">
          <Icon className="h-6 w-6" />
        </span>
        <h3 className="text-xl font-bold">{name}</h3>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{t(`${direction.id}.about`)}</p>
        <Link href={directoryHref({ ...(direction.specialtyCode === undefined ? {} : { specialty: direction.specialtyCode }), page: 1 })} aria-label={`${tHome('directionMore')}: ${name}`} className="mt-auto inline-flex min-h-[44px] items-center text-[15px] font-semibold text-primary underline-offset-4 hover:underline">
          {tHome('directionMore')}
        </Link>
      </Card>
    </li>
  );
}

/**
 * Departments of the clinic; the catalog of services (live data) is passed in as children and shown under the cards.
 * `availableSpecialties` are the specialty codes of the doctors loaded: a department with a specialty none of them has
 * is hidden, so no card leads to an empty catalog. Undefined (the catalog could not be read) keeps every department.
 */
export function HomeDirections({ availableSpecialties, children }: { readonly availableSpecialties?: ReadonlySet<string>; readonly children?: ReactNode }): ReactNode {
  const t = useT('home');
  return (
    <section id={HOME_ANCHORS.directions} aria-labelledby="home-directions" className="scroll-mt-4 border-y border-border bg-card">
      <div className={`${SECTION_CLASS} flex flex-col gap-8 py-16`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="home-directions" className={SECTION_TITLE_CLASS}>{t('directionsTitle')}</h2>
            <p className={SECTION_LEAD_CLASS}>{t('directionsLead')}</p>
          </div>
          <Link href="/doctors" className={buttonVariants({ variant: 'secondary' })}>{t('findDoctor')}</Link>
        </div>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DIRECTIONS.filter((direction) => direction.specialtyCode === undefined || availableSpecialties === undefined || availableSpecialties.has(direction.specialtyCode)).map((direction) => <DirectionCard key={direction.id} direction={direction} />)}
        </ul>
        {children}
      </div>
    </section>
  );
}
