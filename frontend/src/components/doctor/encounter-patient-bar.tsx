'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { UserRound } from 'lucide-react';
import { ConsentStatusLine } from '@/components/consent/consent-status-line';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ageInYears } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import type { PatientCard } from './doctor-types';
import { usePatient } from './use-doctor-queries';

function PatientName({ patientId, patient, isPending }: { readonly patientId: string; readonly patient: PatientCard | undefined; readonly isPending: boolean }): ReactNode {
  const t = useT('doctor.encounter');
  const tCommon = useT('common');
  // The id is shown only when the card cannot be read; while it loads a placeholder avoids flashing a number as the name.
  if (isPending) return <span className="text-muted-foreground">{tCommon('loading')}</span>;
  const name: string = patient?.fullName || t('patientFallback', { id: patientId });
  return <Link href={`/patients/${encodeURIComponent(patientId)}`} className="underline-offset-2 hover:underline">{name}</Link>;
}

interface EncounterPatientBarProps {
  readonly patientId: string;
  /** Opens the patient's summary in a drawer; only offered below the width where the summary has a column of its own. */
  readonly onOpenSummary: () => void;
}

/**
 * Who the visit is about, kept at the top of the encounter screen while the form scrolls (A3): name (a link to the card),
 * age and sex, and where the consent stands. On a narrow screen it also carries the button that opens the patient's summary.
 */
export function EncounterPatientBar({ patientId, onOpenSummary }: EncounterPatientBarProps): ReactNode {
  const t = useT('doctor.encounter');
  const tPatient = useT('doctor.patient');
  const patient = usePatient(patientId);
  const age: number | null = patient.data?.birthDate ? ageInYears(patient.data.birthDate) : null;
  const details: string = [age === null ? null : tPatient('age', { years: age }), patient.data?.gender ? tPatient(`gender.${patient.data.gender}`) : null].filter((part) => part !== null).join(' · ');
  return (
    <Card as="section" radius="card" padding="none" aria-label={t('patientBarLabel')} className="no-print sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-3 text-base font-bold [overflow-wrap:anywhere]">
        <PatientName patientId={patientId} patient={patient.data} isPending={patient.isPending} />
        {details === '' ? null : <span className="text-sm font-normal text-muted-foreground">{details}</span>}
      </p>
      <ConsentStatusLine patientId={patientId} />
      <Button variant="secondary" onClick={onOpenSummary} className="ml-auto lg:hidden">
        <UserRound aria-hidden="true" className="size-4" />
        {t('patientSummaryOpen')}
      </Button>
    </Card>
  );
}
