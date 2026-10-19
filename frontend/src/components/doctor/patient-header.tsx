'use client';

import type { ReactNode } from 'react';
import { CodeChip } from '@/components/feedback/code-chip';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { useT } from '@/lib/i18n/use-t';
import { ageInYears, formatDateKey } from './clinic-time';
import { ContactList } from './contact-list';
import type { PatientCard } from './doctor-types';
import { TableSkeleton } from '@/components/feedback/states';
import { QueryErrorState } from './query-error-state';
import { usePatient } from './use-doctor-queries';

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return (
    <div>
      <dt className="form-label">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

function PatientFacts({ patient }: { readonly patient: PatientCard }): ReactNode {
  const t = useT('doctor.patient');
  const age: number | null = patient.birthDate ? ageInYears(patient.birthDate) : null;
  return (
    <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Fact label={t('birthDate')}>
        {patient.birthDate ? formatDateKey(patient.birthDate, 'long') : t('unknown')}
        {age !== null ? <span className="text-[var(--muted-foreground)]">{` · ${t('age', { years: age })}`}</span> : null}
      </Fact>
      <Fact label={t('genderLabel')}>{patient.gender ? t(`gender.${patient.gender}`) : t('unknown')}</Fact>
      <Fact label={t('contacts')}>{patient.telecom.length > 0 ? <ContactList telecom={patient.telecom} /> : t('noContacts')}</Fact>
      <Fact label={t('recordId')}><CodeChip code={patient.id} /></Fact>
    </dl>
  );
}

/** The patient's identity block of the doctor's card (API 3.2): name, birth date and age, sex, contacts. */
export function PatientHeader({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('doctor.patient');
  const patient = usePatient(patientId);
  if (patient.isPending) return <TableSkeleton />;
  if (patient.isError) return <QueryErrorState error={patient.error} notFoundText={t('notFound')} onRetry={() => void patient.refetch()} />;
  return (
    <section aria-labelledby="patient-title" className="rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-5">
      <p className="form-label">{t('cardLabel')}</p>
      <h1 id="patient-title" className="serif mt-1 text-3xl font-bold">{patient.data.fullName || t('unnamed')}</h1>
      {patient.data.active ? null : <div className="mt-2"><StampBadge status="cancelled">{t('inactive')}</StampBadge></div>}
      <PatientFacts patient={patient.data} />
    </section>
  );
}
