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

/** Doctor of the catalog: initials avatar on sage, name in serif, specialty (frontend-design-spec §C.1). */
export function DoctorCard({ doctor, headingLevel = 2, children }: DoctorCardProps): ReactNode {
  const t = useT('catalog');
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3';
  return (
    <article data-testid="doctor-card" className="flex gap-4 rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-4">
      <span aria-hidden="true" className="serif flex h-14 w-14 flex-none items-center justify-center rounded-full bg-[var(--secondary)] text-lg font-semibold">
        {doctorInitials(doctor)}
      </span>
      <div className="min-w-0 flex-1">
        <Heading className="serif text-xl font-semibold">{doctor.name}</Heading>
        <p className="text-sm text-[var(--muted-foreground)]">{doctor.specialty ?? t('noSpecialty')}</p>
        {children === undefined ? null : <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
      </div>
    </article>
  );
}
