'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { STRETCHED_LINK_CLASS } from '@/components/ui/card-variants';
import { cn } from '@/lib/ui/cn';
import { useT } from '@/lib/i18n/use-t';
import type { Doctor } from './catalog-types';

/** Link to the doctor's page; it stretches over the whole card (`interactive` tone), so the card is one click target; the accessible name starts with the visible word and adds whose profile it is. */
export function DoctorProfileLink({ doctor }: { readonly doctor: Doctor }): ReactNode {
  const t = useT('catalog');
  return (
    <Link
      href={`/doctors/${encodeURIComponent(doctor.id)}`}
      aria-label={`${t('profile')}: ${doctor.name}`}
      className={cn(buttonVariants({ variant: 'secondary' }), STRETCHED_LINK_CLASS)}
    >
      {t('profile')}
    </Link>
  );
}
