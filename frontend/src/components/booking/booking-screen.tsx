'use client';

import type { ReactNode } from 'react';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { BookingWizard } from './booking-wizard';

export function BookingScreen({ presetDoctorId }: { readonly presetDoctorId?: string }): ReactNode {
  const t = useT('booking');
  useDocumentTitle(t('title'));
  return (
    <div className="flex flex-col gap-7">
      <BookingWizard
        {...(presetDoctorId === undefined ? {} : { presetDoctorId })}
        header={
          <div className="flex flex-col gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
            <p className="text-base text-muted-foreground">{t('subtitle')}</p>
          </div>
        }
      />
    </div>
  );
}
