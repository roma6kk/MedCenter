'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Timer, UserRound } from 'lucide-react';
import { ConsentStatusLine } from '@/components/consent/consent-status-line';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ageInYears } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import type { PatientCard } from './doctor-types';
import { durationParts, elapsedMinutes } from './encounter-duration';
import { useNow } from './use-now';
import { usePatient } from './use-doctor-queries';

function PatientName({ patientId, patient, isPending }: { readonly patientId: string; readonly patient: PatientCard | undefined; readonly isPending: boolean }): ReactNode {
  const t = useT('doctor.encounter');
  const tCommon = useT('common');
  if (isPending) return <span className="text-muted-foreground">{tCommon('loading')}</span>;
  const name: string = patient?.fullName || t('patientFallback', { id: patientId });
  return <Link href={`/patients/${encodeURIComponent(patientId)}`} className="inline-flex min-h-[44px] items-center underline-offset-2 hover:underline">{name}</Link>;
}

function Duration({ startedAt }: { readonly startedAt: string }): ReactNode {
  const t = useT('doctor.encounter');
  const now: number | null = useNow(30_000);
  if (now === null) return null;
  const parts = durationParts(elapsedMinutes(startedAt, now));
  const value: string =
    parts.kind === 'days' ? t('durationDays', { days: parts.days, hours: parts.hours }) :
    parts.kind === 'hours' ? t('durationHours', { hours: parts.hours, minutes: String(parts.minutes).padStart(2, '0') }) :
    t('durationMinutes', { minutes: parts.minutes });
  return (
    <p title={t('durationLabel')} data-testid="encounter-duration" className="inline-flex items-center gap-1.5 text-sm font-medium tabular-nums text-muted-foreground lg:ml-auto">
      <Timer aria-hidden="true" className="size-4" />
      {t('duration', { value })}
    </p>
  );
}

interface EncounterPatientBarProps {
  readonly patientId: string;
  readonly startedAt?: string;
  readonly onOpenSummary: () => void;
}

export function EncounterPatientBar({ patientId, startedAt, onOpenSummary }: EncounterPatientBarProps): ReactNode {
  const t = useT('doctor.encounter');
  const tPatient = useT('doctor.patient');
  const patient = usePatient(patientId);
  const age: number | null = patient.data?.birthDate ? ageInYears(patient.data.birthDate) : null;
  const details: string = [age === null ? null : tPatient('age', { years: age }), patient.data?.gender ? tPatient(`gender.${patient.data.gender}`) : null].filter((part) => part !== null).join(' · ');
  return (
    <Card as="section" radius="card" padding="none" aria-label={t('patientBarLabel')} className="no-print sticky top-[4.5rem] z-20 mb-4 lg:top-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-3 text-base font-bold [overflow-wrap:anywhere]">
        <PatientName patientId={patientId} patient={patient.data} isPending={patient.isPending} />
        {details === '' ? null : <span className="text-sm font-normal text-muted-foreground">{details}</span>}
      </p>
      <ConsentStatusLine patientId={patientId} />
      {startedAt === undefined ? null : <Duration startedAt={startedAt} />}
      <Button variant="secondary" onClick={onOpenSummary} className="ml-auto lg:hidden">
        <UserRound aria-hidden="true" className="size-4" />
        {t('patientSummaryOpen')}
      </Button>
    </Card>
  );
}
