'use client';

import type { ReactNode } from 'react';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { BookingWizard } from './booking-wizard';

/** The `/booking` page body: heading and the wizard. `presetDoctorId` comes from a `?doctorId=` deep link. */
export function BookingScreen({ presetDoctorId }: { readonly presetDoctorId?: string }): ReactNode {
  const t = useT('booking');
  useDocumentTitle(t('title'));
  return (
    <>
      <h1 className="serif text-2xl font-bold">{t('title')}</h1>
      <div className="mt-4">
        <BookingWizard {...(presetDoctorId === undefined ? {} : { presetDoctorId })} />
      </div>
    </>
  );
}
