'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { STRETCHED_LINK_CLASS } from '@/components/ui/card-variants';
import { buttonVariants } from '@/components/ui/button-variants';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { SECTION_CLASS, SECTION_LEAD_CLASS, SECTION_TITLE_CLASS } from './catalog-styles';
import { directoryHref } from './doctor-directory';
import { directionGridClass, type DirectionEntry } from './home-directions-model';
import { HOME_ANCHORS, type DirectionTone } from './home-content';

/** Tile colours of a direction (VB3): the soft ground and its own text colour of one token family, each pair checked for contrast in `globals-contrast.spec.ts`. */
const TONE_TILE_CLASS: Readonly<Record<DirectionTone, string>> = {
  primary: 'bg-primary-soft text-primary-soft-foreground',
  destructive: 'bg-destructive-soft text-destructive',
  info: 'bg-info-soft text-info',
  warm: 'bg-warm-soft text-warm-foreground',
  success: 'bg-success-soft text-success',
};

function DirectionCard({ entry }: { readonly entry: DirectionEntry }): ReactNode {
  const t = useT('home.directions');
  const tHome = useT('home');
  const Icon = entry.icon;
  const name: string = entry.id === undefined ? (entry.label ?? '') : t(`${entry.id}.name`);
  const about: string = entry.id === undefined ? tHome('directionGeneric') : t(`${entry.id}.about`);
  const isServices: boolean = entry.kind === 'services';
  const href: string = isServices ? `#${HOME_ANCHORS.services}` : directoryHref({ ...(entry.specialtyCode === undefined ? {} : { specialty: entry.specialtyCode }), page: 1 });
  const label: string = isServices ? tHome('directionServices') : tHome('directionMore');
  return (
    <li>
      <Card as="article" padding="lg" tone="interactive" className="flex h-full flex-col gap-3">
        <span aria-hidden="true" className={cn('flex h-14 w-14 items-center justify-center rounded-card', TONE_TILE_CLASS[entry.tone])}>
          <Icon className="h-7 w-7" />
        </span>
        <h3 className="text-xl font-bold">{name}</h3>
        <p className="text-base leading-relaxed text-muted-foreground">{about}</p>
        <Link href={href} aria-label={`${label}: ${name}`} className={`mt-auto inline-flex min-h-[44px] items-center text-base font-semibold text-primary underline-offset-4 hover:underline ${STRETCHED_LINK_CLASS}`}>
          {label}
        </Link>
      </Card>
    </li>
  );
}

/**
 * Departments of the clinic, built from the specialties its doctors really have (`directionEntries`); the catalog of
 * services (live data) is passed in as children and shown under the cards. A section with nothing to show is not drawn.
 */
export function HomeDirections({ entries, children }: { readonly entries: ReadonlyArray<DirectionEntry>; readonly children?: ReactNode }): ReactNode {
  const t = useT('home');
  if (entries.length === 0 && children === undefined) return null;
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
        {entries.length === 0 ? null : <ul className={cn('grid gap-4', directionGridClass(entries.length))}>{entries.map((entry) => <DirectionCard key={entry.key} entry={entry} />)}</ul>}
        {children}
      </div>
    </section>
  );
}
