'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { STRETCHED_LINK_CLASS } from '@/components/ui/card-variants';
import { useCanBook } from '@/hooks/use-can-book';
import { cn } from '@/lib/ui/cn';
import { useT } from '@/lib/i18n/use-t';
import type { Doctor } from './catalog-types';
import { doctorLabel } from '@/lib/doctor-name';

export function DoctorProfileLink({ doctor }: { readonly doctor: Doctor }): ReactNode {
  const t = useT('catalog');
  return (
    <Link
      href={`/doctors/${encodeURIComponent(doctor.id)}`}
      aria-label={`${t('profile')}: ${doctorLabel(doctor)}`}
      className={cn(buttonVariants({ variant: 'secondary' }), STRETCHED_LINK_CLASS)}
    >
      {t('profile')}
    </Link>
  );
}

export function DoctorCardActions({ doctor }: { readonly doctor: Doctor }): ReactNode {
  const t = useT('catalog');
  const canBook = useCanBook();
  return (
    <>
      {canBook ? (
        <Link
          href={`/booking?doctorId=${encodeURIComponent(doctor.id)}`}
          aria-label={t('bookWith', { name: doctorLabel(doctor) })}
          className={cn(buttonVariants({ variant: 'primary' }), 'relative z-10')}
        >
          {t('book')}
        </Link>
      ) : null}
      <DoctorProfileLink doctor={doctor} />
    </>
  );
}
