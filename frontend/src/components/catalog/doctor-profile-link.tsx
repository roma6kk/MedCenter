'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/use-t';
import type { Doctor } from './catalog-types';

/** Link to the doctor's page; the accessible name starts with the visible word and adds whose profile it is. */
export function DoctorProfileLink({ doctor }: { readonly doctor: Doctor }): ReactNode {
  const t = useT('catalog');
  return (
    <Link
      href={`/doctors/${encodeURIComponent(doctor.id)}`}
      aria-label={`${t('profile')}: ${doctor.name}`}
      className="inline-flex min-h-[44px] items-center rounded-[6px] border border-[var(--border)] px-4 text-sm hover:bg-[var(--secondary)]"
    >
      {t('profile')}
    </Link>
  );
}
