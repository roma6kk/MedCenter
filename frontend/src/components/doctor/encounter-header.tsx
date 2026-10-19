'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { StampBadge, type StampStatus } from '@/components/feedback/stamp-badge';
import { useT } from '@/lib/i18n/use-t';
import { formatMinskDateTime } from './clinic-time';
import type { EncounterDetails, EncounterState } from './doctor-types';
import { usePatient } from './use-doctor-queries';

/** Encounter status as the stamp the design system already has (`in-progress` reads as "На приёме"). */
function stampOf(status: EncounterState): StampStatus {
  if (status === 'in-progress') return 'checked-in';
  if (status === 'finished' || status === 'cancelled' || status === 'entered-in-error') return status;
  return 'pending';
}

function PatientLink({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('doctor.encounter');
  const tCommon = useT('common');
  const patient = usePatient(patientId);
  // The id is shown only when the card cannot be read; while it loads a placeholder avoids flashing a number as the name.
  if (patient.isPending) return <span className="text-[var(--muted-foreground)]">{tCommon('loading')}</span>;
  const name: string = patient.data?.fullName || t('patientFallback', { id: patientId });
  return <Link href={`/patients/${encodeURIComponent(patientId)}`} className="underline">{name}</Link>;
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return (
    <div>
      <dt className="form-label">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

/** Who and when: patient (to the card), the start and end of the visit, the booked service. */
export function EncounterHeader({ encounter }: { readonly encounter: EncounterDetails }): ReactNode {
  const t = useT('doctor.encounter');
  return (
    <section aria-labelledby="encounter-title" className="rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-5">
      <p className="form-label no-print"><Link href="/doctor/appointments" className="underline">{t('backToJournal')}</Link></p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 id="encounter-title" className="serif text-2xl font-bold">{t('title')}</h1>
        <StampBadge status={stampOf(encounter.status)} />
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t('patient')}><PatientLink patientId={encounter.patientId} /></Fact>
        <Fact label={t('started')}>{formatMinskDateTime(encounter.period.start)}</Fact>
        <Fact label={t('ended')}>{encounter.period.end ? formatMinskDateTime(encounter.period.end) : '—'}</Fact>
        <Fact label={t('service')}>{encounter.serviceType?.display ?? '—'}</Fact>
      </dl>
    </section>
  );
}
