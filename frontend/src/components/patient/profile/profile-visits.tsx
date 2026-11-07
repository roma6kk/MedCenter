'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button-variants';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { normalizeDoctorName } from '@/lib/doctor-name';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { WRAP_TEXT } from '../wrap-text';
import type { HistoryEntry } from '../patient-types';

export function LastVisitCard({ entry }: { readonly entry: HistoryEntry | undefined }): ReactNode {
  const t = useT('patientProfile.last');
  const format = useClinicFormat();
  const diagnosis = entry?.diagnoses[0];
  const doctor: string = normalizeDoctorName(entry?.doctorName);
  const advice: string = (entry?.recommendations ?? '').trim();
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="profile-last-title" data-testid="profile-last" className="flex flex-col gap-3 p-[22px]">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="profile-last-title" className="text-lg font-bold">{t('title')}</h2>
        {entry === undefined ? null : <time dateTime={entry.date} className="text-sm text-muted-foreground">{format.date(entry.date)}</time>}
      </div>
      {entry === undefined ? (
        <p className="text-base text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <p className={cn('text-sm text-muted-foreground', WRAP_TEXT)}>
            {entry.serviceType?.display ?? t('serviceUnknown')}
            {doctor === '' ? '' : ` · ${doctor}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {entry.diagnosis === '' ? (
              <span className="text-base text-muted-foreground">{t('noDiagnosis')}</span>
            ) : (
              <>
                <span className="mono rounded-sm bg-secondary px-2 py-[3px] text-xs font-medium">{entry.diagnosis}</span>
                {diagnosis === undefined ? null : <span className={cn('text-base font-semibold', WRAP_TEXT)}>{diagnosis.display}</span>}
              </>
            )}
          </div>
          {advice === '' ? null : (
            <div className={cn('rounded-control bg-primary-soft px-3.5 py-3 text-sm leading-normal text-primary-soft-foreground', WRAP_TEXT)}>
              <span className="block text-sm font-semibold">{t('doctorAdvice')}</span>
              {format.prose(advice)}
            </div>
          )}
        </>
      )}
      <Link href="/medcard" className={cn(buttonVariants({ variant: 'ghost' }), 'mt-auto self-start')}>{t('all')}</Link>
    </Card>
  );
}
