'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { STRETCHED_LINK_CLASS } from '@/components/ui/card-variants';
import { cn } from '@/lib/ui/cn';
import { useT } from '@/lib/i18n/use-t';
import { useSessionStore } from '@/store/use-session-store';
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

/**
 * The two actions of a doctor card (C5): «Записаться» opens the booking wizard on this doctor's times, «Профиль» is the
 * stretched link of the whole card. The booking link is positioned above the stretch layer, so both stay clickable.
 * Doctors and administrators do not book, so they get the profile link only.
 */
export function DoctorCardActions({ doctor }: { readonly doctor: Doctor }): ReactNode {
  const t = useT('catalog');
  const role = useSessionStore((state) => state.role);
  return (
    <>
      {role === 'DOCTOR' || role === 'ADMIN' ? null : (
        <Link
          href={`/booking?doctorId=${encodeURIComponent(doctor.id)}`}
          aria-label={t('bookWith', { name: doctor.name })}
          className={cn(buttonVariants({ variant: 'primary' }), 'relative z-10')}
        >
          {t('book')}
        </Link>
      )}
      <DoctorProfileLink doctor={doctor} />
    </>
  );
}
