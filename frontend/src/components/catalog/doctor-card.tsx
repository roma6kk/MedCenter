'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import type { Doctor } from './catalog-types';
import { doctorInitials } from './doctor-initials';

interface DoctorCardProps {
  readonly doctor: Doctor;
  /** Heading level of the name inside the page outline. */
  readonly headingLevel?: 1 | 2 | 3;
  /** Links or buttons shown under the specialty. */
  readonly children?: ReactNode;
}

/** Doctor of the catalog: initials avatar on a soft teal tile, name, specialty (frontend-design-spec §C.1, redesign canvas). */
export function DoctorCard({ doctor, headingLevel = 2, children }: DoctorCardProps): ReactNode {
  const t = useT('catalog');
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3';
  return (
    <article data-testid="doctor-card" className="flex gap-4 rounded-card border border-border bg-card p-4">
      <span aria-hidden="true" className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-primary-soft text-lg font-bold text-primary-soft-foreground">
        {doctorInitials(doctor)}
      </span>
      <div className="min-w-0 flex-1">
        <Heading className="text-lg font-bold">{doctor.name}</Heading>
        <p className="text-sm text-muted-foreground">{doctor.specialty ?? t('noSpecialty')}</p>
        {children === undefined ? null : <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
      </div>
    </article>
  );
}
