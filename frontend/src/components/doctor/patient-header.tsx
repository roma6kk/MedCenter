'use client';

import type { ReactNode } from 'react';
import { ConsentStatusLine } from '@/components/consent/consent-status-line';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { ageInYears, formatDateKey } from '@/lib/clinic-time';
import { ContactList } from './contact-list';
import type { PatientCard } from './doctor-types';
import { initialsOf } from './journal-model';
import { ContentSkeleton } from '@/components/feedback/content-skeleton';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { RelatedPersons } from './related-persons';
import { usePatient } from './use-doctor-queries';

function Fact({ label, children, className }: { readonly label: string; readonly children: ReactNode; readonly className?: string }): ReactNode {
  return (
    <div className={className}>
      <dt className="form-label">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

function PatientFacts({ patient }: { readonly patient: PatientCard }): ReactNode {
  const t = useT('doctor.patient');
  const age: number | null = patient.birthDate ? ageInYears(patient.birthDate) : null;
  return (
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      <Fact label={t('birthDate')}>
        {patient.birthDate ? formatDateKey(patient.birthDate, 'long') : t('unknown')}
        {age !== null ? <span className="text-muted-foreground">{` · ${t('age', { years: age })}`}</span> : null}
      </Fact>
      <Fact label={t('genderLabel')}>{patient.gender ? t(`gender.${patient.gender}`) : t('unknown')}</Fact>
      <Fact label={t('contacts')} className="col-span-2 lg:col-span-1">{patient.telecom.length > 0 ? <ContactList telecom={patient.telecom} /> : t('noContacts')}</Fact>
    </dl>
  );
}

interface PatientHeaderProps {
  readonly patientId: string;
  readonly onManageConsent: () => void;
}

export function PatientHeader({ patientId, onManageConsent }: PatientHeaderProps): ReactNode {
  const t = useT('doctor.patient');
  const patient = usePatient(patientId);
  if (patient.data === undefined) return <QueryFailure query={patient} notFoundText={t('notFound')} pending={<ContentSkeleton shape="detail" />} />;
  const name: string = patient.data.fullName || t('unnamed');
  return (
    <Card as="section" radius="panel" padding="lg" aria-labelledby="patient-title" className="flex animate-fade-in flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar initials={initialsOf(name)} className="size-14 text-lg" />
        <div className="min-w-0">
          <p className="form-label">{t('cardLabel')}</p>
          <h1 id="patient-title" className="mt-0.5 text-2xl font-bold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere]">{name}</h1>
        </div>
        {patient.data.active ? null : <StampBadge status="cancelled">{t('inactive')}</StampBadge>}
      </div>
      <PatientFacts patient={patient.data} />
      <div className="flex flex-col gap-1 border-t border-border-soft pt-3">
        <ConsentStatusLine patientId={patientId} onManage={onManageConsent} />
        <RelatedPersons patientId={patientId} />
      </div>
    </Card>
  );
}
