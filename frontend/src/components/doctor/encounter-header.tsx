'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { StampBadge, type StampStatus } from '@/components/feedback/stamp-badge';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { formatClinicDateTime } from '@/lib/clinic-time';
import type { EncounterDetails, EncounterState } from './doctor-types';

function stampOf(status: EncounterState): StampStatus {
  if (status === 'in-progress') return 'checked-in';
  if (status === 'finished' || status === 'cancelled' || status === 'entered-in-error') return status;
  return 'pending';
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return (
    <div>
      <dt className="form-label">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

export function EncounterHeader({ encounter }: { readonly encounter: EncounterDetails }): ReactNode {
  const t = useT('doctor.encounter');
  return (
    <Card as="section" radius="panel" padding="lg" aria-labelledby="encounter-title">
      <p className="form-label no-print"><Link href="/doctor/appointments" className="underline">{t('backToJournal')}</Link></p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 id="encounter-title" className="text-2xl font-bold leading-tight tracking-[-0.02em]">{t('title')}</h1>
        <StampBadge status={stampOf(encounter.status)} />
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={t('started')}>{formatClinicDateTime(encounter.period.start)}</Fact>
        <Fact label={t('ended')}>{encounter.period.end ? formatClinicDateTime(encounter.period.end) : '—'}</Fact>
        <Fact label={t('service')}>{encounter.serviceType?.display ?? '—'}</Fact>
      </dl>
    </Card>
  );
}
