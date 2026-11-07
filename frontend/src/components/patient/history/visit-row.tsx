'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { clinicDayOf } from '@/lib/clinic-time';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { normalizeDoctorName } from '@/lib/doctor-name';
import type { DiagnosisView, HistoryEntry, Prescription } from '../patient-types';
import { WRAP_TEXT } from '../wrap-text';
import { CodeTag } from './code-tag';
import { primaryCode } from './history-model';

export const ICD10_SYSTEM = 'https://fhir.by/CodeSystem/InternClassificDiseases10';

// `failed`/`partial`: a visit without prescriptions may still have had some.
export type PrescriptionsState = 'ok' | 'failed' | 'partial';

interface VisitRowProps {
  readonly entry: HistoryEntry;
  readonly prescriptions: ReadonlyArray<Prescription>;
  readonly prescriptionsState?: PrescriptionsState;
  readonly onRetryPrescriptions?: () => void;
}

function diagnosesOf(entry: HistoryEntry): ReadonlyArray<DiagnosisView> {
  if (entry.diagnoses.length > 0) return entry.diagnoses;
  const code = primaryCode(entry);
  return code === '' ? [] : [{ code, display: '' }];
}

function utcDate(dayKey: string): Date {
  const [year = 0, month = 1, day = 1] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function DateTile({ iso }: { readonly iso: string }): ReactNode {
  const { locale } = useClinicFormat();
  const date = utcDate(clinicDayOf(iso));
  return (
    <span aria-hidden="true" className="flex h-16 w-16 flex-none flex-col items-center justify-center rounded-card bg-secondary">
      <span className="text-xl font-bold leading-none">{new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' }).format(date)}</span>
      <span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(date).replace('.', '')}</span>
    </span>
  );
}

function Label({ children }: { readonly children: ReactNode }): ReactNode {
  return <span className="text-sm font-semibold text-muted-foreground">{children}</span>;
}

function PrescriptionLine({ prescription }: { readonly prescription: Prescription }): ReactNode {
  const code = prescription.kind === 'medication' ? prescription.atcCode : prescription.code;
  const name = prescription.kind === 'medication' ? prescription.atcDisplay : prescription.display;
  const detail = prescription.kind === 'medication' ? prescription.dosageText : undefined;
  return (
    <li className="flex flex-wrap items-center gap-2 text-base">
      <CodeTag code={code} />
      <span className={WRAP_TEXT}>{[name, detail].filter(Boolean).join(' — ')}</span>
    </li>
  );
}

function Details({ entry, prescriptions, prescriptionsState = 'ok', onRetryPrescriptions }: VisitRowProps): ReactNode {
  const t = useT('patientHistory');
  const others = diagnosesOf(entry).slice(1);
  return (
    <div className="flex flex-col gap-3 px-5 pb-5 sm:pl-[98px]">
      {others.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Label>{t('diagnoses')}</Label>
          <ul className="flex flex-col gap-1.5">
            {others.map((d, i) => (
              <li key={`${d.code}-${i}`} className="flex flex-wrap items-center gap-2 text-base"><CodeTag code={d.code} system={ICD10_SYSTEM} />{d.display ? <span className={WRAP_TEXT}>{d.display}</span> : null}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {entry.summary ? (
        <p className={cn('flex flex-col gap-0.5 text-base', WRAP_TEXT)}><Label>{t('summary')}</Label><span className={cn('whitespace-pre-line', WRAP_TEXT)}>{entry.summary}</span></p>
      ) : null}
      {entry.recommendations ? (
        <p className={cn('rounded-control bg-primary-soft px-3.5 py-3 text-base leading-normal text-primary-soft-foreground', WRAP_TEXT)}>
          <span className="block text-sm font-semibold">{t('recommendations')}</span>
          <span className={cn('whitespace-pre-line', WRAP_TEXT)}>{entry.recommendations}</span>
        </p>
      ) : null}
      {prescriptions.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Label>{t('prescribed')}</Label>
          <ul className="flex flex-col gap-1.5">{prescriptions.map((p) => <PrescriptionLine key={p.id} prescription={p} />)}</ul>
        </div>
      ) : null}
      {prescriptions.length === 0 && prescriptionsState !== 'ok' ? (
        <p role="status" className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          {prescriptionsState === 'failed' ? t('prescriptionsFailed') : t('prescriptionsPartial')}
          {prescriptionsState === 'failed' && onRetryPrescriptions !== undefined ? (
            <button type="button" onClick={onRetryPrescriptions} className="no-print inline-flex min-h-[44px] items-center font-semibold text-primary-soft-foreground underline underline-offset-2">{t('prescriptionsRetry')}</button>
          ) : (
            <Link href="/medcard?tab=prescriptions" className="no-print inline-flex min-h-[44px] items-center font-semibold text-primary-soft-foreground underline underline-offset-2">{t('prescriptionsLink')}</Link>
          )}
        </p>
      ) : null}
      <div className="no-print flex flex-wrap gap-2 pt-1">
        <Link href="/booking" className={buttonVariants({ variant: 'primary' })}>{t('rebook')}</Link>
        <Link href={`/appointments/${encodeURIComponent(entry.appointmentId)}`} className={buttonVariants({ variant: 'secondary' })}>{t('openAppointment')}</Link>
        {prescriptions.length > 0 ? <Link href="/medcard?tab=prescriptions" className={buttonVariants({ variant: 'secondary' })}>{t('prescriptionsLink')}</Link> : null}
      </div>
    </div>
  );
}

export function VisitRow({ entry, prescriptions, prescriptionsState, onRetryPrescriptions }: VisitRowProps): ReactNode {
  const t = useT('patientHistory');
  const format = useClinicFormat();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const diagnoses = diagnosesOf(entry);
  const service = entry.serviceType?.display ?? '';
  const diagnosis = diagnoses[0];
  return (
    <li className="min-w-0">
      <article className="overflow-hidden rounded-card border border-border bg-card">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={t('toggleVisit', { date: format.dateTime(entry.date), service })}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full flex-wrap items-center gap-3.5 px-5 py-[18px] text-left"
        >
          <DateTile iso={entry.date} />
          <span className="flex min-w-0 flex-[999_1_260px] flex-col gap-1">
            {service ? <span className={cn('text-base font-bold', WRAP_TEXT)}>{service}</span> : null}
            <time dateTime={entry.date} className="text-sm text-muted-foreground">{format.dateTime(entry.date)}</time>
            {entry.doctorName ? <span className={cn('text-sm text-muted-foreground', WRAP_TEXT)}>{t('doctorBy', { name: normalizeDoctorName(entry.doctorName) })}</span> : null}
            <span className="flex flex-wrap items-center gap-2 pt-0.5">
              {diagnosis === undefined ? (
                <span className="text-sm text-muted-foreground">{t('noDiagnosis')}</span>
              ) : (
                <>
                  <CodeTag code={diagnosis.code} system={ICD10_SYSTEM} />
                  {diagnosis.display ? <span className={cn('text-sm', WRAP_TEXT)}>{diagnosis.display}</span> : null}
                  {diagnosis.verificationStatus ? <span className="text-xs text-muted-foreground">({t(`verification.${diagnosis.verificationStatus}`)})</span> : null}
                </>
              )}
            </span>
          </span>
          <span aria-hidden="true" className="flex-none text-xl text-muted-foreground">{open ? '−' : '+'}</span>
        </button>
        <div id={panelId} hidden={!open} className="print:!block">
          <Details entry={entry} prescriptions={prescriptions} {...(prescriptionsState === undefined ? {} : { prescriptionsState })} {...(onRetryPrescriptions === undefined ? {} : { onRetryPrescriptions })} />
        </div>
      </article>
    </li>
  );
}
