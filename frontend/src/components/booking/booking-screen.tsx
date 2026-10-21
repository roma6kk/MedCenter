'use client';

import type { ReactNode } from 'react';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { BookingWizard } from './booking-wizard';

/** The `/booking` page body: heading, lead line and the wizard. `presetDoctorId` comes from a `?doctorId=` deep link. */
export function BookingScreen({ presetDoctorId }: { readonly presetDoctorId?: string }): ReactNode {
  const t = useT('booking');
  useDocumentTitle(t('title'));
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[34px]">{t('title')}</h1>
        <p className="text-base text-muted-foreground">{t('subtitle')}</p>
      </div>
      <BookingWizard {...(presetDoctorId === undefined ? {} : { presetDoctorId })} />
    </div>
  );
}
