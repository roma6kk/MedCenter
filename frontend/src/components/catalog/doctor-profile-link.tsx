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

/** Link to the doctor's page; it stretches over the whole card (`interactive` tone), so the card is one click target; the accessible name starts with the visible word and adds whose profile it is. */
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

/**
 * The two actions of a doctor card (C5): «Записаться» opens the booking wizard on this doctor's times, «Профиль» is the
 * stretched link of the whole card. The booking link is positioned above the stretch layer, so both stay clickable.
 * Doctors and administrators do not book, so they get the profile link only.
 */
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
