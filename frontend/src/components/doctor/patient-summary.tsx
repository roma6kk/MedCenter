'use client';

import type { ReactNode } from 'react';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { CodeChip } from '@/components/feedback/code-chip';
import { Card } from '@/components/ui/card';
import { SkeletonText } from '@/components/ui/skeleton';
import { formatClinicDate, formatClinicDateTime } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import type { HistoryItem, ObservationView, Prescription } from './doctor-types';
import { ATC_SYSTEM } from './encounter-problem-fields';
import { buildRecentDiagnoses, currentPrescriptions, MAX_SUMMARY_ROWS, type RecentDiagnosis } from './patient-summary-model';
import { useEncounter, usePatientHistory, usePatientPrescriptions, useUpcomingVisit } from './use-doctor-queries';

function Block({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactNode {
  return (
    <section className="flex flex-col gap-2 border-t border-border-soft pt-4 first:border-t-0 first:pt-0">
      <h3 className="form-label">{title}</h3>
      {children}
    </section>
  );
}

/** One quiet line for a block that has nothing to show: an empty block must not take the room a full one would. */
function Empty({ children }: { readonly children: ReactNode }): ReactNode {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function DiagnosisRows({ items }: { readonly items: ReadonlyArray<RecentDiagnosis> }): ReactNode {
  const t = useT('doctor.summary');
  const tVerification = useT('doctor.verification');
  if (items.length === 0) return <Empty>{t('diagnosesEmpty')}</Empty>;
  return (
    <ul className="grid gap-2">
      {items.map((diagnosis) => (
        <li key={diagnosis.code} className="text-sm">
          <span className="flex flex-wrap items-baseline gap-2">
            <CodeChip code={diagnosis.code} />
            <span>{diagnosis.display}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {diagnosis.verificationStatus ? `${tVerification(diagnosis.verificationStatus)} · ` : ''}
            {formatClinicDate(diagnosis.date)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RecentDiagnoses({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('doctor.summary');
  const history = usePatientHistory(patientId, 1);
  return (
    <Block title={t('diagnosesTitle')}>
      {history.data === undefined ? <QueryFailure query={history} embedded notFoundText={t('unavailable')} pending={<SkeletonText lines={2} />} /> : <DiagnosisRows items={buildRecentDiagnoses(history.data.items)} />}
    </Block>
  );
}

function PrescriptionLine({ item }: { readonly item: Prescription }): ReactNode {
  if (item.kind === 'medication') {
    return (
      <li className="text-sm">
        <span className="flex flex-wrap items-baseline gap-2">
          <CodeChip code={item.atcCode} system={ATC_SYSTEM} />
          <span className="font-semibold">{item.atcDisplay ?? item.atcCode}</span>
        </span>
        <span className="text-muted-foreground">{item.dosageText}</span>
      </li>
    );
  }
  return (
    <li className="text-sm">
      <span className="flex flex-wrap items-baseline gap-2">
        <CodeChip code={item.code} system={item.codeSystem} />
        <span className="font-semibold">{item.display ?? item.code}</span>
      </span>
    </li>
  );
}

function PrescriptionRows({ items }: { readonly items: ReadonlyArray<Prescription> }): ReactNode {
  const t = useT('doctor.summary');
  if (items.length === 0) return <Empty>{t('prescriptionsEmpty')}</Empty>;
  return (
    <>
      <ul className="grid gap-2">{items.slice(0, MAX_SUMMARY_ROWS).map((item) => <PrescriptionLine key={item.id} item={item} />)}</ul>
      {items.length > MAX_SUMMARY_ROWS ? <p className="text-xs text-muted-foreground">{t('moreCount', { count: items.length - MAX_SUMMARY_ROWS })}</p> : null}
    </>
  );
}

function CurrentPrescriptions({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('doctor.summary');
  const prescriptions = usePatientPrescriptions(patientId, 1);
  return (
    <Block title={t('prescriptionsTitle')}>
      {prescriptions.data === undefined ? <QueryFailure query={prescriptions} embedded notFoundText={t('unavailable')} pending={<SkeletonText lines={2} />} /> : <PrescriptionRows items={currentPrescriptions(prescriptions.data.items)} />}
    </Block>
  );
}

function VitalsList({ items, date }: { readonly items: ReadonlyArray<ObservationView>; readonly date: string }): ReactNode {
  const t = useT('doctor.summary');
  return (
    <>
      <ul className="grid gap-1">
        {items.slice(0, MAX_SUMMARY_ROWS + 2).map((item, index) => (
          <li key={`${item.code}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span>{item.display ?? item.code}</span>
            <span className="tabular-nums font-semibold">{`${item.value} ${item.unit}`}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t('vitalsOn', { date: formatClinicDate(date) })}</p>
    </>
  );
}

/** The newest finished visit is the only one read: its observations are the "last vitals"; older visits are not searched. */
function LastVitals({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('doctor.summary');
  const history = usePatientHistory(patientId, 1);
  const latest: HistoryItem | undefined = history.data?.items[0];
  const encounter = useEncounter(latest?.id ?? '', latest !== undefined);
  const isPending: boolean = history.isPending || (latest !== undefined && encounter.isPending);
  const observations: ReadonlyArray<ObservationView> = encounter.data?.observations ?? [];
  return (
    <Block title={t('vitalsTitle')}>
      {isPending ? <SkeletonText lines={2} /> : null}
      {!isPending && history.isError ? <Empty>{t('unavailable')}</Empty> : null}
      {!isPending && !history.isError && (latest === undefined || encounter.isError || observations.length === 0) ? <Empty>{t('vitalsEmpty')}</Empty> : null}
      {latest !== undefined && !isPending && observations.length > 0 ? <VitalsList items={observations} date={latest.date} /> : null}
    </Block>
  );
}

function UpcomingVisit({ patientId, excludeAppointmentId }: { readonly patientId: string; readonly excludeAppointmentId: string | undefined }): ReactNode {
  const t = useT('doctor.summary');
  const upcoming = useUpcomingVisit(patientId, excludeAppointmentId);
  return (
    <Block title={t('upcomingTitle')}>
      {upcoming.isPending ? <SkeletonText lines={1} /> : null}
      {upcoming.isError ? <Empty>{t('unavailable')}</Empty> : null}
      {upcoming.data === null ? <Empty>{t('upcomingEmpty')}</Empty> : null}
      {upcoming.data ? (
        <p className="text-sm">
          <span className="font-semibold tabular-nums">{formatClinicDateTime(upcoming.data.start)}</span>
          {upcoming.data.serviceName ? <span className="block text-muted-foreground">{upcoming.data.serviceName}</span> : null}
        </p>
      ) : null}
    </Block>
  );
}

interface PatientSummaryProps {
  readonly patientId: string;
  /** The visit the doctor is in right now (the encounter screen): it is not an "upcoming" one. */
  readonly excludeAppointmentId?: string;
  /** `plain` drops the card and its heading, for a panel that already has a title of its own (the drawer). */
  readonly plain?: boolean;
  readonly className?: string;
}

/**
 * The clinical summary of a patient (A2, A3): recent diagnoses, current prescriptions, the last vitals and the next visit,
 * from what the history and prescription lists already return. Shared by the patient card and the encounter screen, so both
 * show the same picture. Every block loads and fails on its own, and an empty one is a single quiet line. Allergies are not
 * in any API yet and are left out rather than shown as "none".
 */
export function PatientSummary({ patientId, excludeAppointmentId, plain = false, className }: PatientSummaryProps): ReactNode {
  const t = useT('doctor.summary');
  const blocks: ReactNode = (
    <>
      <RecentDiagnoses patientId={patientId} />
      <CurrentPrescriptions patientId={patientId} />
      <LastVitals patientId={patientId} />
      <UpcomingVisit patientId={patientId} excludeAppointmentId={excludeAppointmentId} />
    </>
  );
  if (plain) return <div aria-label={t('title')} role="region" className={cn('flex flex-col gap-4', className)}>{blocks}</div>;
  return (
    <Card as="section" radius="panel" padding="lg" aria-labelledby="patient-summary-title" className={cn('flex flex-col gap-4', className)}>
      <h2 id="patient-summary-title" className="text-lg font-bold">{t('title')}</h2>
      {blocks}
    </Card>
  );
}
